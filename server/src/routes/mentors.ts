import { Router, type Request, type Response, type NextFunction } from 'express';
import { DateTime } from 'luxon';
import { Mentor, Booking, MentorDailyLoad } from '../models/index.js';
import { NotFoundError } from '../utils/errors.js';
import { utcToLocal } from '../domain/index.js';
import { config } from '../config/index.js';

export const mentorsRouter = Router();

/**
 * GET /api/mentors
 * Returns all active mentors with profile details and working windows.
 */
mentorsRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const mentors = await Mentor.find({ isActive: true })
      .select('name email timezone workingWindows avatarUrl bio isActive')
      .sort({ name: 1 })
      .lean();

    res.json({ mentors });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/mentors/:id/schedule?date=YYYY-MM-DD
 */
mentorsRouter.get(
  '/:id/schedule',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const mentor = await Mentor.findById(req.params.id).lean();
      if (!mentor) {
        throw new NotFoundError('Mentor');
      }

      const { date } = req.query as { date?: string };
      const targetDate =
        date || DateTime.now().setZone(mentor.timezone).toFormat('yyyy-MM-dd');

      const query: Record<string, unknown> = {
        mentorId: mentor._id,
        status: 'CONFIRMED',
        mentorLocalDate: targetDate,
      };

      const bookings = await Booking.find(query)
        .sort({ slotStartUtc: 1 })
        .lean();

      const dailyLoadDoc = await MentorDailyLoad.findOne({
        mentorId: mentor._id,
        mentorLocalDate: targetDate,
      }).lean();

      const currentCount = dailyLoadDoc?.count ?? bookings.length;

      const formattedBookings = bookings.map((b) => {
        const mentorLocal = utcToLocal(b.slotStartUtc, mentor.timezone);
        const parentLocal = utcToLocal(b.slotStartUtc, b.parentTimezone);

        return {
          bookingRef: b.bookingRef,
          parentName: b.parentName,
          childName: b.childName,
          slotStartUtc: b.slotStartUtc.toISOString(),
          mentorLocalTime: `${mentorLocal.localFormatted} ${mentorLocal.tzAbbr}`,
          parentLocalTime: `${parentLocal.localFormatted} ${parentLocal.tzAbbr}`,
          meetingLink: b.meetingLink,
          status: b.status,
        };
      });

      res.json({
        mentor: {
          id: mentor._id,
          name: mentor.name,
          email: mentor.email,
          timezone: mentor.timezone,
          workingWindows: mentor.workingWindows,
          avatarUrl: mentor.avatarUrl,
          bio: mentor.bio,
        },
        date: targetDate,
        dailyLoad: {
          count: currentCount,
          max: config.maxBookingsPerMentorPerDay,
        },
        workingWindows: mentor.workingWindows,
        bookings: formattedBookings,
      });
    } catch (err) {
      next(err);
    }
  }
);
