import { DateTime } from 'luxon';
import { getTimezoneAbbr } from './timezone.js';

export function getUserTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && isValidTimeZone(tz)) {
      return tz;
    }
  } catch {
    // fallback
  }
  return 'America/New_York';
}

export function isValidTimeZone(tz: string): boolean {
  return DateTime.now().setZone(tz).isValid;
}

export function getBookableDates(daysAhead = 14, zone = 'America/New_York'): Array<{
  isoDate: string; // YYYY-MM-DD
  dayOfWeek: string; // e.g. Mon, Tue
  dayNumber: number; // 15
  monthName: string; // Oct
  isToday: boolean;
  isTomorrow: boolean;
  displayLabel: string;
}> {
  const dates = [];
  const start = DateTime.now().setZone(zone);

  for (let i = 0; i < daysAhead; i++) {
    const dt = start.plus({ days: i });
    const isToday = i === 0;
    const isTomorrow = i === 1;

    let displayLabel = dt.toFormat('ccc, LLL d');
    if (isToday) displayLabel = `Today, ${dt.toFormat('LLL d')}`;
    else if (isTomorrow) displayLabel = `Tomorrow, ${dt.toFormat('LLL d')}`;

    dates.push({
      isoDate: dt.toFormat('yyyy-MM-dd'),
      dayOfWeek: dt.toFormat('ccc'),
      dayNumber: dt.day,
      monthName: dt.toFormat('LLL'),
      isToday,
      isTomorrow,
      displayLabel,
    });
  }

  return dates;
}

export function formatDateTimeNice(utcIso: string, zone: string): string {
  const dt = DateTime.fromISO(utcIso).setZone(zone);
  const abbr = getTimezoneAbbr(dt, zone);
  return `${dt.toFormat('cccc, LLLL d, yyyy · h:mm a')} (${abbr})`;
}

export function formatTimeRange(startUtc: string, endUtc: string, zone: string): string {
  const start = DateTime.fromISO(startUtc).setZone(zone);
  const end = DateTime.fromISO(endUtc).setZone(zone);
  const abbr = getTimezoneAbbr(start, zone);
  return `${start.toFormat('h:mm a')} – ${end.toFormat('h:mm a')} ${abbr}`;
}

export function formatIstTime(utcIso: string): string {
  const dt = DateTime.fromISO(utcIso).setZone('Asia/Kolkata');
  return `${dt.toFormat('h:mm a')} IST (${dt.toFormat('LLL d')})`;
}
