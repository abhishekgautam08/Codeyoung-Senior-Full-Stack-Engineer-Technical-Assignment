/**
 * NotificationService — outbox pattern for simulated email notifications.
 *
 * Writes to the `notifications` collection so notifications are:
 * - Durable (survives crashes)
 * - Inspectable (can query what was sent)
 * - Swappable (replace with real email provider later)
 *
 * Also logs to console for demo visibility.
 */

import { Notification } from '../models/index.js';
import { logger } from '../utils/logger.js';

interface BookingData {
  bookingRef: string;
  parentName: string;
  parentEmail: string;
  parentTimezone: string;
  slotStartUtc: string;
  slotEndUtc: string;
  parentLocalTime: string;
  mentorLocalTime: string;
  meetingLink: string;
  mentor: {
    name: string;
    email: string;
    timezone: string;
  };
}

export class NotificationService {
  /**
   * Send booking confirmation to both parent and mentor.
   */
  async sendBookingConfirmation(booking: BookingData): Promise<void> {
    // Notification to parent
    await Notification.create({
      recipient: booking.parentEmail,
      type: 'BOOKING_CONFIRMED',
      channel: 'email',
      payload: {
        subject: `Your trial class is confirmed! (${booking.bookingRef})`,
        parentName: booking.parentName,
        mentorName: booking.mentor.name,
        parentLocalTime: booking.parentLocalTime,
        meetingLink: booking.meetingLink,
        bookingRef: booking.bookingRef,
      },
    });

    logger.info(
      {
        to: booking.parentEmail,
        type: 'BOOKING_CONFIRMED',
        bookingRef: booking.bookingRef,
      },
      `📧 [SIMULATED EMAIL] Booking confirmation sent to parent: ${booking.parentEmail}`
    );

    // Notification to mentor
    await Notification.create({
      recipient: booking.mentor.email,
      type: 'NEW_BOOKING_MENTOR',
      channel: 'email',
      payload: {
        subject: `New trial class booking: ${booking.parentName} (${booking.bookingRef})`,
        mentorName: booking.mentor.name,
        parentName: booking.parentName,
        mentorLocalTime: booking.mentorLocalTime,
        meetingLink: booking.meetingLink,
        bookingRef: booking.bookingRef,
      },
    });

    logger.info(
      {
        to: booking.mentor.email,
        type: 'NEW_BOOKING_MENTOR',
        bookingRef: booking.bookingRef,
      },
      `📧 [SIMULATED EMAIL] New booking notification sent to mentor: ${booking.mentor.email}`
    );
  }

  /**
   * Send cancellation notification.
   */
  async sendCancellationNotification(booking: BookingData): Promise<void> {
    await Notification.create({
      recipient: booking.parentEmail,
      type: 'BOOKING_CANCELLED',
      channel: 'email',
      payload: {
        subject: `Your trial class has been cancelled (${booking.bookingRef})`,
        parentName: booking.parentName,
        bookingRef: booking.bookingRef,
      },
    });

    logger.info(
      { to: booking.parentEmail, bookingRef: booking.bookingRef },
      `📧 [SIMULATED EMAIL] Cancellation sent to: ${booking.parentEmail}`
    );
  }
}
