import { DateTime } from 'luxon';
import type { Booking } from '../types/index.js';

import { getTimezoneAbbr } from './timezone.js';

/**
 * Generates an iCalendar (.ics) string for a confirmed booking and downloads it.
 */
export function downloadBookingIcs(booking: Booking): void {
  const start = DateTime.fromISO(booking.slotStartUtc).toUTC();
  const end = DateTime.fromISO(booking.slotEndUtc).toUTC();

  const formatIcsDate = (dt: DateTime) => dt.toFormat("yyyyLLdd'T'HHmmss'Z'");

  const mentorName = typeof booking.mentorId === 'object' ? booking.mentorId.name : 'Your Codeyoung Mentor';
  const mentorEmail = typeof booking.mentorId === 'object' ? booking.mentorId.email : 'mentor@codeyoung.in';

  const parentStart = DateTime.fromISO(booking.slotStartUtc).setZone(booking.parentTimezone);
  const parentTzAbbr = getTimezoneAbbr(parentStart, booking.parentTimezone);
  const parentTimeStr = `${parentStart.toFormat('EEE, d MMM yyyy · h:mm a')} ${parentTzAbbr}`;

  const mentorStart = DateTime.fromISO(booking.slotStartUtc).setZone('Asia/Kolkata');
  const mentorTimeStr = `${mentorStart.toFormat('EEE, d MMM yyyy · h:mm a')} IST`;

  const summary = `Codeyoung 1:1 Live Coding Trial Class`;
  const description = [
    `Welcome to your Codeyoung 1:1 Live Coding Trial Session!`,
    ``,
    `Student: ${booking.childName || booking.parentName}`,
    `Mentor: ${mentorName}`,
    `Class Time: ${parentTimeStr}`,
    `Mentor Time: ${mentorTimeStr}`,
    `Booking Reference: ${booking.bookingRef}`,
    `Join Meeting: ${booking.meetingLink}`,
    ``,
    `Please join the meeting 2-3 minutes early with a laptop/computer for the best interactive experience.`,
  ].join('\\n');

  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Codeyoung//Trial Class Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${booking.bookingRef}@codeyoung.in`,
    `DTSTAMP:${formatIcsDate(DateTime.utc())}`,
    `DTSTART:${formatIcsDate(start)}`,
    `DTEND:${formatIcsDate(end)}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${booking.meetingLink}`,
    `ORGANIZER;CN=${mentorName}:mailto:${mentorEmail}`,
    `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=${booking.parentName}:mailto:${booking.parentEmail}`,
    `STATUS:CONFIRMED`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  const icsContent = icsLines.join('\r\n');
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `codeyoung-trial-${booking.bookingRef}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Creates a direct Google Calendar Add-to-Calendar URL
 */
export function getGoogleCalendarUrl(booking: Booking): string {
  const start = DateTime.fromISO(booking.slotStartUtc).toUTC();
  const end = DateTime.fromISO(booking.slotEndUtc).toUTC();
  const formatGCal = (dt: DateTime) => dt.toFormat("yyyyLLdd'T'HHmmss'Z'");

  const mentorName = typeof booking.mentorId === 'object' ? booking.mentorId.name : 'Your Mentor';

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Codeyoung 1:1 Live Coding Trial Class`,
    dates: `${formatGCal(start)}/${formatGCal(end)}`,
    details: `1:1 Live Trial Class with ${mentorName}.\nBooking Ref: ${booking.bookingRef}\nMeeting Link: ${booking.meetingLink}`,
    location: booking.meetingLink,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
