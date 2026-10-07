/**
 * BookingService — the core business logic for creating and cancelling bookings.
 *
 * Concurrency strategy (no replica set, no transactions):
 *
 * 1. Compute candidate mentors (active, working at slot, not already booked at that slot)
 *    ranked by the assignment strategy.
 *
 * 2. For each candidate in priority order:
 *    a. Atomic increment: findOneAndUpdate on MentorDailyLoad with
 *       filter { mentorId, mentorLocalDate, count: { $lt: MAX } }
 *       update { $inc: { count: 1 } }, upsert: true
 *       → If no doc matched and upsert created a new one: capacity reserved.
 *       → If doc matched and count was incremented: capacity reserved.
 *       → If no doc matched and count >= MAX: mentor at capacity, try next.
 *       → Catch E11000 on upsert race: retry once.
 *
 *    b. Insert the Booking document. A unique partial index on
 *       { mentorId, slotStartUtc } WHERE status=CONFIRMED prevents
 *       double-booking the same mentor/slot at the DB level.
 *       → Success: done!
 *       → E11000: another request booked this mentor/slot first.
 *         Roll back the counter ($inc: { count: -1 }) and try next mentor.
 *
 * 3. If all candidates exhausted → throw SlotUnavailableError (409).
 *
 * 4. Idempotency: if Idempotency-Key is provided and a booking with that key
 *    already exists, return the existing booking instead of creating a duplicate.
 *
 * 5. Cancellation: set status=CANCELLED, decrement the daily load counter.
 */

import { DateTime } from 'luxon';
import { nanoid } from 'nanoid';
import { Mentor, Booking, MentorDailyLoad } from '../models/index.js';
import {
  isMentorWorkingAtUtc,
  getMentorLocalDate,
  isSlotBookable,
  utcToLocal,
  createAssignmentStrategy,
  type MentorCandidate,
} from '../domain/index.js';
import {
  SlotUnavailableError,
  SlotInPastError,
  TooSoonError,
  DuplicateBookingError,
  NotFoundError,
} from '../utils/errors.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export interface CreateBookingInput {
  parentName: string;
  parentEmail: string;
  parentTimezone: string;
  slotStartUtc: string;
  childName?: string;
  childAge?: number;
  notes?: string;
  idempotencyKey?: string;
}

export interface BookingResult {
  bookingRef: string;
  parentName: string;
  parentEmail: string;
  parentTimezone: string;
  childName?: string;
  childAge?: number;
  slotStartUtc: string;
  slotEndUtc: string;
  parentLocalTime: string;
  mentorLocalTime: string;
  mentor: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string;
    bio: string;
    timezone: string;
  };
  meetingLink: string;
  status: string;
  createdAt: string;
}

import { getClock, type Clock } from '../utils/clock.js';

export class BookingService {
  private strategy = createAssignmentStrategy();
  private clock: Clock;

  constructor(clock: Clock = getClock()) {
    this.clock = clock;
  }

  async createBooking(input: CreateBookingInput): Promise<BookingResult> {
    const slotStartUtc = DateTime.fromISO(input.slotStartUtc, { zone: 'utc' });
    const now = this.clock.now();

    // Validate slot is not in the past
    if (slotStartUtc <= now) {
      throw new SlotInPastError();
    }

    // Validate minimum lead time
    if (!isSlotBookable(slotStartUtc, config.minLeadTimeHours, now)) {
      throw new TooSoonError(config.minLeadTimeHours);
    }

    // Check idempotency
    if (input.idempotencyKey) {
      const existing = await Booking.findOne({
        idempotencyKey: input.idempotencyKey,
      })
        .populate('mentorId')
        .lean();

      if (existing) {
        return this.formatBookingResult(existing);
      }
    }

    // Check duplicate booking (same email + same slot)
    const existingParentBooking = await Booking.findOne({
      parentEmail: input.parentEmail.toLowerCase(),
      slotStartUtc: slotStartUtc.toJSDate(),
      status: 'CONFIRMED',
    }).lean();

    if (existingParentBooking) {
      throw new DuplicateBookingError();
    }

    // Find candidate mentors
    const activeMentors = await Mentor.find({ isActive: true }).lean();
    const slotEndUtc = slotStartUtc.plus({ minutes: config.slotDurationMinutes });

    // Filter mentors who work at this slot time
    const workingMentors = activeMentors.filter((m) =>
      isMentorWorkingAtUtc(
        slotStartUtc,
        m.timezone,
        m.workingWindows,
        config.slotDurationMinutes
      )
    );

    if (workingMentors.length === 0) {
      throw new SlotUnavailableError(
        'No mentors are available at this time. Please choose a different time slot.'
      );
    }

    // Check which mentors don't already have a confirmed booking at this slot
    const existingSlotBookings = await Booking.find({
      slotStartUtc: slotStartUtc.toJSDate(),
      status: 'CONFIRMED',
    }).lean();

    const bookedMentorIds = new Set(
      existingSlotBookings.map((b) => b.mentorId.toString())
    );

    const candidateMentors = workingMentors.filter(
      (m) => !bookedMentorIds.has(m._id.toString())
    );

    if (candidateMentors.length === 0) {
      throw new SlotUnavailableError(
        'That time was just booked by another family. Please pick an alternative.',
        []
      );
    }

    // Get daily load counts and total booking counts for ranking
    const mentorCandidates: MentorCandidate[] = await Promise.all(
      candidateMentors.map(async (m) => {
        const mentorLocalDate = getMentorLocalDate(slotStartUtc.toJSDate(), m.timezone);
        const dailyLoad = await MentorDailyLoad.findOne({
          mentorId: m._id,
          mentorLocalDate,
        }).lean();

        const totalBookings = await Booking.countDocuments({
          mentorId: m._id,
          status: 'CONFIRMED',
        });

        return {
          mentorId: m._id,
          dailyCount: dailyLoad?.count ?? 0,
          totalBookings,
        };
      })
    );

    // Filter out mentors already at daily capacity
    const eligibleCandidates = mentorCandidates.filter(
      (c) => c.dailyCount < config.maxBookingsPerMentorPerDay
    );

    if (eligibleCandidates.length === 0) {
      throw new SlotUnavailableError(
        'All mentors have reached their daily booking limit. Please try another day.',
        []
      );
    }

    // Rank by strategy
    const rankedCandidates = this.strategy.rank(eligibleCandidates);

    // Try each candidate in order
    for (const candidate of rankedCandidates) {
      const mentor = candidateMentors.find(
        (m) => m._id.toString() === candidate.mentorId.toString()
      )!;
      const mentorLocalDate = getMentorLocalDate(slotStartUtc.toJSDate(), mentor.timezone);

      // Step 2a: Atomic increment of daily load counter
      let loadReserved = false;
      try {
        const result = await MentorDailyLoad.findOneAndUpdate(
          {
            mentorId: mentor._id,
            mentorLocalDate,
            count: { $lt: config.maxBookingsPerMentorPerDay },
          },
          { $inc: { count: 1 } },
          { upsert: true, new: true }
        );

        if (result) {
          loadReserved = true;
        }
      } catch (err: unknown) {
        // E11000 on upsert race — another request created the document first
        if (this.isDuplicateKeyError(err)) {
          // Retry the findOneAndUpdate without upsert
          const retryResult = await MentorDailyLoad.findOneAndUpdate(
            {
              mentorId: mentor._id,
              mentorLocalDate,
              count: { $lt: config.maxBookingsPerMentorPerDay },
            },
            { $inc: { count: 1 } },
            { new: true }
          );

          if (retryResult) {
            loadReserved = true;
          }
        } else {
          throw err;
        }
      }

      if (!loadReserved) {
        // Mentor at capacity for this day, try next
        continue;
      }

      // Step 2b: Insert the booking
      const bookingRef = `CY-${nanoid(8).toUpperCase()}`;
      const meetingLink = `https://meet.codeyoung.demo/trial/${bookingRef}-${nanoid(6)}`;

      try {
        const booking = await Booking.create({
          bookingRef,
          parentName: input.parentName,
          parentEmail: input.parentEmail.toLowerCase(),
          parentTimezone: input.parentTimezone,
          childName: input.childName,
          childAge: input.childAge,
          notes: input.notes,
          slotStartUtc: slotStartUtc.toJSDate(),
          slotEndUtc: slotEndUtc.toJSDate(),
          mentorId: mentor._id,
          mentorLocalDate,
          meetingLink,
          status: 'CONFIRMED',
          idempotencyKey: input.idempotencyKey || undefined,
        });

        logger.info(
          { bookingRef, mentorId: mentor._id.toString(), slot: slotStartUtc.toISO() },
          'Booking created successfully'
        );

        // Populate the mentor for the response
        const populated = await Booking.findById(booking._id).populate('mentorId').lean();
        return this.formatBookingResult(populated!);
      } catch (err: unknown) {
        // E11000 on booking insert — another request booked this mentor/slot
        if (this.isDuplicateKeyError(err)) {
          logger.info(
            { mentorId: mentor._id.toString(), slot: slotStartUtc.toISO() },
            'Slot taken by concurrent request, trying next mentor'
          );

          // Roll back the counter
          await MentorDailyLoad.findOneAndUpdate(
            { mentorId: mentor._id, mentorLocalDate },
            { $inc: { count: -1 } }
          );

          continue;
        }
        throw err;
      }
    }

    // All candidates exhausted
    throw new SlotUnavailableError(
      'That time was just booked by another family. Please pick an alternative.',
      []
    );
  }

  async cancelBooking(bookingRef: string): Promise<BookingResult> {
    const booking = await Booking.findOne({ bookingRef, status: 'CONFIRMED' }).lean();

    if (!booking) {
      throw new NotFoundError('Booking');
    }

    // Set status to CANCELLED
    await Booking.updateOne(
      { _id: booking._id },
      { $set: { status: 'CANCELLED' } }
    );

    // Decrement the daily load counter
    await MentorDailyLoad.findOneAndUpdate(
      {
        mentorId: booking.mentorId,
        mentorLocalDate: booking.mentorLocalDate,
        count: { $gt: 0 },
      },
      { $inc: { count: -1 } }
    );

    logger.info({ bookingRef }, 'Booking cancelled');

    const updated = await Booking.findById(booking._id).populate('mentorId').lean();
    return this.formatBookingResult(updated!);
  }

  private formatBookingResult(booking: Record<string, unknown>): BookingResult {
    const mentor = booking.mentorId as Record<string, unknown>;
    const slotStartUtc = booking.slotStartUtc as Date;
    const parentTz = booking.parentTimezone as string;
    const mentorTz = (mentor.timezone as string) || 'Asia/Kolkata';

    const parentLocal = utcToLocal(slotStartUtc, parentTz);
    const mentorLocal = utcToLocal(slotStartUtc, mentorTz);

    return {
      bookingRef: booking.bookingRef as string,
      parentName: booking.parentName as string,
      parentEmail: booking.parentEmail as string,
      parentTimezone: parentTz,
      childName: booking.childName as string | undefined,
      childAge: booking.childAge as number | undefined,
      slotStartUtc: slotStartUtc.toISOString(),
      slotEndUtc: (booking.slotEndUtc as Date).toISOString(),
      parentLocalTime: `${parentLocal.localFormatted} ${parentLocal.tzAbbr} (${parentLocal.utcOffset})`,
      mentorLocalTime: `${mentorLocal.localFormatted} ${mentorLocal.tzAbbr} (${mentorLocal.utcOffset})`,
      mentor: {
        id: (mentor._id as { toString(): string }).toString(),
        name: mentor.name as string,
        email: mentor.email as string,
        avatarUrl: mentor.avatarUrl as string,
        bio: mentor.bio as string,
        timezone: mentorTz,
      },
      meetingLink: booking.meetingLink as string,
      status: booking.status as string,
      createdAt: (booking.createdAt as Date).toISOString(),
    };
  }

  private isDuplicateKeyError(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: number }).code === 11000
    );
  }
}
