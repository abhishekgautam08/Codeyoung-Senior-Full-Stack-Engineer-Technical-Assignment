import { Router, type Request, type Response, type NextFunction } from 'express';
import { Mentor, Booking } from '../models/index.js';
import { NotFoundError } from '../utils/errors.js';
import { utcToLocal } from '../domain/index.js';

export const mentorsRouter = Router();

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

      const query: Record<string, unknown> = {
        mentorId: mentor._id,
        status: 'CONFIRMED',
      };

      if (date) {
        query.mentorLocalDate = date;
      }

      const bookings = await Booking.find(query)
        .sort({ slotStartUtc: 1 })
        .lean();

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
        bookings: formattedBookings,
      });
    } catch (err) {
      next(err);
    }
  }
);
