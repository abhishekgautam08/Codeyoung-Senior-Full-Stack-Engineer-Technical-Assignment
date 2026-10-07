import { DateTime } from 'luxon';
import { Mentor, Booking, MentorDailyLoad } from '../models/index.js';
import {
  generateSlotStartsUtc,
  isMentorWorkingAtUtc,
  getMentorLocalDate,
  isSlotBookable,
  isDateInBookableWindow,
  isValidIANAZone,
} from '../domain/index.js';
import { config } from '../config/index.js';
import { getClock, type Clock } from '../utils/clock.js';
import { ValidationError } from '../utils/errors.js';

export interface DayAvailability {
  date: string;
  hasAvailability: boolean;
  limited: boolean;
}

export interface MonthAvailabilityResult {
  month: string;
  timezone: string;
  days: DayAvailability[];
}

export class AvailabilityService {
  constructor(private clock: Clock = getClock()) {}

  async getMonthAvailability(month: string, tz: string): Promise<MonthAvailabilityResult> {
    if (!month || !tz) {
      throw new ValidationError('month (YYYY-MM) and tz are required.');
    }

    if (!isValidIANAZone(tz)) {
      throw new ValidationError(`"${tz}" is not a recognized timezone.`);
    }

    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new ValidationError('month must be in YYYY-MM format.');
    }

    const now = this.clock.now();
    const [year, monthNum] = month.split('-').map(Number);
    const firstDay = DateTime.fromObject({ year, month: monthNum, day: 1 }, { zone: tz });
    if (!firstDay.isValid) {
      throw new ValidationError('Invalid month/year provided.');
    }
    const daysInMonth = firstDay.daysInMonth!;

    // 1. Identify which dates fall in the bookable window
    const bookableDays: string[] = [];
    const nonBookableDays: string[] = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = firstDay.set({ day: d }).toFormat('yyyy-MM-dd');
      if (isDateInBookableWindow(dateStr, tz, config.bookableWindowDays, now)) {
        bookableDays.push(dateStr);
      } else {
        nonBookableDays.push(dateStr);
      }
    }

    if (bookableDays.length === 0) {
      return {
        month,
        timezone: tz,
        days: nonBookableDays.map((date) => ({
          date,
          hasAvailability: false,
          limited: false,
        })),
      };
    }

    // 2. Generate all UTC slot starts for all bookable days in range
    const allSlotStartsByDay = new Map<string, DateTime[]>();
    let minUtc: DateTime | null = null;
    let maxUtc: DateTime | null = null;

    for (const day of bookableDays) {
      const slots = generateSlotStartsUtc(day, tz, config.slotIntervalMinutes);
      allSlotStartsByDay.set(day, slots);

      if (slots.length > 0) {
        if (!minUtc || slots[0] < minUtc) minUtc = slots[0];
        const lastSlotEnd = slots[slots.length - 1].plus({ minutes: config.slotDurationMinutes });
        if (!maxUtc || lastSlotEnd > maxUtc) maxUtc = lastSlotEnd;
      }
    }

    // 3. Batch query: active mentors, bookings in range, daily loads in range
    const mentors = await Mentor.find({ isActive: true }).lean();

    const existingBookings = minUtc && maxUtc
      ? await Booking.find({
          slotStartUtc: { $gte: minUtc.toJSDate(), $lt: maxUtc.toJSDate() },
          status: 'CONFIRMED',
        }).lean()
      : [];

    const bookedSet = new Set(
      existingBookings.map((b) => `${b.mentorId.toString()}_${b.slotStartUtc.toISOString()}`)
    );

    // Compute all possible IST dates in range for daily loads
    const mentorLocalDates = new Set<string>();
    for (const [_, slots] of allSlotStartsByDay.entries()) {
      for (const slotUtc of slots) {
        for (const mentor of mentors) {
          mentorLocalDates.add(getMentorLocalDate(slotUtc.toJSDate(), mentor.timezone));
        }
      }
    }

    const dailyLoads = await MentorDailyLoad.find({
      mentorLocalDate: { $in: Array.from(mentorLocalDates) },
    }).lean();

    const dailyLoadMap = new Map(
      dailyLoads.map((dl) => [`${dl.mentorId.toString()}_${dl.mentorLocalDate}`, dl.count])
    );

    // 4. Calculate availability per day
    const dayResults: DayAvailability[] = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = firstDay.set({ day: d }).toFormat('yyyy-MM-dd');
      const slots = allSlotStartsByDay.get(dateStr);

      if (!slots || slots.length === 0) {
        dayResults.push({
          date: dateStr,
          hasAvailability: false,
          limited: false,
        });
        continue;
      }

      let availableSlotCount = 0;

      for (const slotUtc of slots) {
        if (!isSlotBookable(slotUtc, config.minLeadTimeHours, now)) continue;

        let slotHasMentor = false;
        for (const mentor of mentors) {
          if (
            !isMentorWorkingAtUtc(
              slotUtc,
              mentor.timezone,
              mentor.workingWindows,
              config.slotDurationMinutes
            )
          ) {
            continue;
          }

          const slotKey = `${mentor._id.toString()}_${slotUtc.toJSDate().toISOString()}`;
          if (bookedSet.has(slotKey)) continue;

          const mLocalDate = getMentorLocalDate(slotUtc.toJSDate(), mentor.timezone);
          const currentLoad = dailyLoadMap.get(`${mentor._id.toString()}_${mLocalDate}`) ?? 0;
          if (currentLoad < config.maxBookingsPerMentorPerDay) {
            slotHasMentor = true;
            break;
          }
        }

        if (slotHasMentor) {
          availableSlotCount++;
        }
      }

      const hasAvailability = availableSlotCount > 0;
      // Mark as limited ("Few slots left") if 1 to 4 slots available
      const limited = hasAvailability && availableSlotCount <= 4;

      dayResults.push({
        date: dateStr,
        hasAvailability,
        limited,
      });
    }

    return {
      month,
      timezone: tz,
      days: dayResults,
    };
  }
}
