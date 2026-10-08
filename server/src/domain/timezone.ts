import { DateTime } from 'luxon';

/**
 * Shared Canonical Timezone Formatter.
 *
 * Rules:
 * - Europe/London: "BST" in summer, "GMT" in winter.
 * - Europe/Dublin: "IST (Ireland)" in summer, "GMT" in winter (avoids ambiguity with India IST).
 * - Asia/Kolkata / Asia/Calcutta: "IST".
 * - US zones: EDT/EST, CDT/CST, MDT/MST, PDT/PST, MST (Phoenix), AKDT/AKST (Anchorage), HST (Honolulu).
 */
export function getTimezoneAbbr(dt: DateTime, tz: string): string {
  const local = dt.setZone(tz);
  const isSummer = local.isInDST;

  if (tz === 'Europe/London') {
    return isSummer ? 'BST' : 'GMT';
  }

  if (tz === 'Europe/Dublin') {
    return isSummer ? 'IST (Ireland)' : 'GMT';
  }

  if (tz === 'Asia/Kolkata' || tz === 'Asia/Calcutta') {
    return 'IST';
  }

  if (tz === 'America/New_York') {
    return isSummer ? 'EDT' : 'EST';
  }
  if (tz === 'America/Chicago') {
    return isSummer ? 'CDT' : 'CST';
  }
  if (tz === 'America/Denver') {
    return isSummer ? 'MDT' : 'MST';
  }
  if (tz === 'America/Los_Angeles') {
    return isSummer ? 'PDT' : 'PST';
  }
  if (tz === 'America/Phoenix') {
    return 'MST';
  }
  if (tz === 'America/Anchorage') {
    return isSummer ? 'AKDT' : 'AKST';
  }
  if (tz === 'Pacific/Honolulu') {
    return 'HST';
  }

  return local.toFormat('ZZZZ');
}

export function formatTimeWithAbbr(dt: DateTime, tz: string): string {
  const local = dt.setZone(tz);
  const abbr = getTimezoneAbbr(local, tz);
  return `${local.toFormat('h:mm a')} ${abbr}`;
}

export function formatFullLocalTime(dt: DateTime, tz: string): string {
  const local = dt.setZone(tz);
  const abbr = getTimezoneAbbr(local, tz);
  return `${local.toFormat('EEE, d MMM yyyy · h:mm a')} ${abbr}`;
}
