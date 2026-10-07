import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';
import { BookingService } from '../services/BookingService.js';
import { NotificationService } from '../services/NotificationService.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { isValidIANAZone } from '../domain/index.js';
import { Booking } from '../models/index.js';

export const bookingsRouter = Router();

// Rate limit the booking endpoint
const bookingRateLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxRequests,
  skip: () => config.nodeEnv === 'test',
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many booking requests. Please wait a moment and try again.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const createBookingSchema = z.object({
  parentName: z.string().min(1, 'Name is required').max(100),
  parentEmail: z.string().email('Invalid email address'),
  parentTimezone: z.string().min(1, 'Timezone is required'),
  slotStartUtc: z.string().datetime({ offset: true, message: 'Invalid datetime format' }),
  childName: z.string().max(100).optional(),
  childAge: z.number().int().min(1).max(18).optional(),
  notes: z.string().max(500).optional(),
});

/**
 * POST /api/bookings
 */
bookingsRouter.post(
  '/',
  bookingRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = createBookingSchema.parse(req.body);

      if (!isValidIANAZone(body.parentTimezone)) {
        throw new ValidationError(
          `"${body.parentTimezone}" is not a recognized timezone.`
        );
      }

      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

      const bookingService = new BookingService();
      const booking = await bookingService.createBooking({
        ...body,
        idempotencyKey,
      });

      // Send notifications
      const notificationService = new NotificationService();
      await notificationService.sendBookingConfirmation(booking);

      res.status(201).json({ booking });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/bookings/:bookingRef
 */
bookingsRouter.get(
  '/:bookingRef',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const bookingRef = String(req.params.bookingRef);
      const booking = await Booking.findOne({
        bookingRef,
      })
        .populate('mentorId')
        .lean();

      if (!booking) {
        throw new NotFoundError('Booking');
      }

      res.json({ booking });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/bookings/:bookingRef
 */
bookingsRouter.delete(
  '/:bookingRef',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const bookingRef = String(req.params.bookingRef);
      const bookingService = new BookingService();
      const booking = await bookingService.cancelBooking(bookingRef);

      res.json({ booking, message: 'Booking cancelled successfully.' });
    } catch (err) {
      next(err);
    }
  }
);
