import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { DateTime } from 'luxon';
import {
  isValidIANAZone,
  isDateInBookableWindow,
  generateSlotStartsUtc,
  buildSlotInfo,
  isMentorWorkingAtUtc,
  isSlotBookable,
  getTimeOfDay,
  getMentorLocalDate,
  getTimezoneAbbr,
} from '../domain/index.js';
import { ValidationError } from '../utils/errors.js';
import { config } from '../config/index.js';
import { Mentor, Booking, MentorDailyLoad } from '../models/index.js';

import { getClock } from '../utils/clock.js';
import { AvailabilityService } from '../services/AvailabilityService.js';

export const slotsRouter = Router();

const slotsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  tz: z.string().min(1, 'Timezone is required'),
});

/**
 * GET /api/slots?date=YYYY-MM-DD&tz=<IANA>
 *
 * Returns available slots for a parent's local calendar day.
 */
slotsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = slotsQuerySchema.parse(req.query);
    const { date, tz } = parsed;

    // Validate timezone
    if (!isValidIANAZone(tz)) {
      throw new ValidationError(
        `"${tz}" is not a recognized timezone. Please select a timezone from the list (e.g. America/New_York, Europe/London).`
      );
    }

    // Validate date is in bookable window
    const now = getClock().now();
    if (!isDateInBookableWindow(date, tz, config.bookableWindowDays, now)) {
      throw new ValidationError(
        `Date must be within the next ${config.bookableWindowDays} days.`
      );
    }

    // Get all active mentors
    const mentors = await Mentor.find({ isActive: true }).lean();

    // Generate all UTC slot starts for the parent's local day
    const slotStartsUtc = generateSlotStartsUtc(date, tz, config.slotIntervalMinutes);

    // Get existing confirmed bookings for the date range
    const dayStart = slotStartsUtc[0];
    const dayEnd = slotStartsUtc[slotStartsUtc.length - 1]
      .plus({ minutes: config.slotDurationMinutes });

    const existingBookings = await Booking.find({
      slotStartUtc: { $gte: dayStart.toJSDate(), $lt: dayEnd.toJSDate() },
      status: 'CONFIRMED',
    }).lean();

    // Build a set of booked mentor+slot combinations
    const bookedSet = new Set(
      existingBookings.map((b) => `${b.mentorId.toString()}_${b.slotStartUtc.toISOString()}`)
    );

    // Get all daily load counters for mentors in the relevant date range
    // We need to check multiple IST dates because the parent's day may span two IST days
    const mentorLocalDates = new Set<string>();
    for (const slotUtc of slotStartsUtc) {
      for (const mentor of mentors) {
        mentorLocalDates.add(
          `${mentor._id.toString()}_${getMentorLocalDate(slotUtc.toJSDate(), mentor.timezone)}`
        );
      }
    }

    const dailyLoads = await MentorDailyLoad.find({
      $or: Array.from(mentorLocalDates).map((key) => {
        const [mentorId, mentorLocalDate] = key.split('_');
        return { mentorId, mentorLocalDate };
      }),
    }).lean();

    const dailyLoadMap = new Map(
      dailyLoads.map((dl) => [`${dl.mentorId.toString()}_${dl.mentorLocalDate}`, dl.count])
    );

    // Build slot availability
    const slots = slotStartsUtc.map((slotUtc) => {
      const slotEndUtc = slotUtc.plus({ minutes: config.slotDurationMinutes });
      const slotInfo = buildSlotInfo(slotUtc, config.slotDurationMinutes, tz);
      const bookable = isSlotBookable(slotUtc, config.minLeadTimeHours, now);

      const localStartDt = slotUtc.setZone(tz);
      const localEndDt = slotEndUtc.setZone(tz);
      const localStartTime = localStartDt.toFormat('h:mm a');
      const localEndTime = localEndDt.toFormat('h:mm a');
      const formattedLocal = `${localStartTime} – ${localEndTime} ${slotInfo.tzAbbr}`;

      const istDt = slotUtc.setZone('Asia/Kolkata');
      const mentorIstInfo = {
        time: istDt.toFormat('HH:mm'),
        date: istDt.toFormat('yyyy-MM-dd'),
        formatted: `${istDt.toFormat('h:mm a')} IST (${istDt.toFormat('LLL d')})`,
      };

      let totalMentorsWorking = 0;
      let availableMentors = 0;

      for (const mentor of mentors) {
        if (
          isMentorWorkingAtUtc(
            slotUtc,
            mentor.timezone,
            mentor.workingWindows,
            config.slotDurationMinutes
          )
        ) {
          totalMentorsWorking++;

          const slotKey = `${mentor._id.toString()}_${slotUtc.toISO()}`;
          if (!bookedSet.has(slotKey)) {
            const mentorDate = getMentorLocalDate(slotUtc.toJSDate(), mentor.timezone);
            const loadKey = `${mentor._id.toString()}_${mentorDate}`;
            const currentLoad = dailyLoadMap.get(loadKey) ?? 0;
            if (currentLoad < config.maxBookingsPerMentorPerDay) {
              availableMentors++;
            }
          }
        }
      }

      const isAvailable = bookable && availableMentors > 0;
      let disabledReason: string | undefined = undefined;
      if (!bookable) {
        disabledReason = 'Past 2h lead time';
      } else if (availableMentors === 0) {
        disabledReason = 'Fully booked';
      }

      return {
        ...slotInfo,
        slotStartUtc: slotUtc.toISO()!,
        slotEndUtc: slotEndUtc.toISO()!,
        localStartTime,
        localEndTime,
        formattedLocal,
        timeOfDay: getTimeOfDay(slotUtc, tz),
        isBookable: bookable,
        isAvailable,
        available: isAvailable,
        limited: availableMentors === 1,
        availableMentorsCount: availableMentors,
        totalMentorsWorking,
        mentorIstInfo,
        disabledReason,
      };
    });

    // Filter to only slots where at least one mentor is working
    const relevantSlots = slots.filter((slot) => slot.totalMentorsWorking > 0);

    const primaryTzAbbr =
      slotStartsUtc.length > 0 ? getTimezoneAbbr(slotStartsUtc[0], tz) : '';

    res.json({
      slots: relevantSlots,
      date,
      timezone: tz,
      tzAbbr: primaryTzAbbr,
      totalSlots: relevantSlots.length,
      availableSlots: relevantSlots.filter((s) => s.available).length,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/slots/alternatives?startUtc=<ISO>&tz=<IANA>
 *
 * Returns nearest N available alternative slots.
 */
slotsRouter.get('/alternatives', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startUtc, tz } = req.query as { startUtc?: string; tz?: string };

    if (!startUtc || !tz) {
      throw new ValidationError('startUtc and tz are required query parameters.');
    }

    if (!isValidIANAZone(tz)) {
      throw new ValidationError(`"${tz}" is not a recognized timezone.`);
    }

    const targetUtc = DateTime.fromISO(startUtc, { zone: 'utc' });
    if (!targetUtc.isValid) {
      throw new ValidationError('Invalid startUtc format.');
    }

    const now = getClock().now();
    const alternatives = [];

    // Search -1 day to +3 days from the target
    for (let dayOffset = -1; dayOffset <= 3 && alternatives.length < 6; dayOffset++) {
      const searchDate = targetUtc.setZone(tz).plus({ days: dayOffset }).toFormat('yyyy-MM-dd');

      if (!isDateInBookableWindow(searchDate, tz, config.bookableWindowDays, now)) {
        continue;
      }

      const slotStartsUtc = generateSlotStartsUtc(searchDate, tz, config.slotIntervalMinutes);
      const mentors = await Mentor.find({ isActive: true }).lean();

      const existingBookings = await Booking.find({
        slotStartUtc: {
          $gte: slotStartsUtc[0].toJSDate(),
          $lt: slotStartsUtc[slotStartsUtc.length - 1]
            .plus({ minutes: config.slotDurationMinutes })
            .toJSDate(),
        },
        status: 'CONFIRMED',
      }).lean();

      const bookedSet = new Set(
        existingBookings.map((b) => `${b.mentorId.toString()}_${b.slotStartUtc.toISOString()}`)
      );

      const dailyLoads = await MentorDailyLoad.find({}).lean();
      const dailyLoadMap = new Map(
        dailyLoads.map((dl) => [`${dl.mentorId.toString()}_${dl.mentorLocalDate}`, dl.count])
      );

      for (const slotUtc of slotStartsUtc) {
        if (alternatives.length >= 6) break;

        // Skip the original slot
        if (slotUtc.toISO() === targetUtc.toISO()) continue;

        if (!isSlotBookable(slotUtc, config.minLeadTimeHours, now)) continue;

        // Check if any mentor is available
        const hasAvailable = mentors.some((mentor) => {
          if (
            !isMentorWorkingAtUtc(
              slotUtc,
              mentor.timezone,
              mentor.workingWindows,
              config.slotDurationMinutes
            )
          ) {
            return false;
          }

          const slotKey = `${mentor._id.toString()}_${slotUtc.toISO()}`;
          if (bookedSet.has(slotKey)) return false;

          const mentorDate = getMentorLocalDate(slotUtc.toJSDate(), mentor.timezone);
          const loadKey = `${mentor._id.toString()}_${mentorDate}`;
          const currentLoad = dailyLoadMap.get(loadKey) ?? 0;
          return currentLoad < config.maxBookingsPerMentorPerDay;
        });

        if (hasAvailable) {
          alternatives.push(buildSlotInfo(slotUtc, config.slotDurationMinutes, tz));
        }
      }
    }

    // Sort by proximity to the original slot
    alternatives.sort((a, b) => {
      const distA = Math.abs(
        DateTime.fromISO(a.startUtc).toMillis() - targetUtc.toMillis()
      );
      const distB = Math.abs(
        DateTime.fromISO(b.startUtc).toMillis() - targetUtc.toMillis()
      );
      return distA - distB;
    });

    res.json({ alternatives: alternatives.slice(0, 6) });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/availability/calendar?month=YYYY-MM&tz=<IANA>
 *
 * Returns day-by-day availability summary for a month (for dimming fully booked days).
 */
slotsRouter.get(
  '/calendar',
  async (req: Request, res: Response, next: NextFunction) => {
    // This is actually mounted at /api/slots/calendar but the spec says /api/availability/calendar
    // We'll handle it from here for simplicity
    next();
  }
);

export const availabilityRouter = Router();

availabilityRouter.get(
  '/calendar',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { month, tz } = req.query as { month?: string; tz?: string };
      const service = new AvailabilityService();
      const result = await service.getMonthAvailability(month as string, tz as string);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);
