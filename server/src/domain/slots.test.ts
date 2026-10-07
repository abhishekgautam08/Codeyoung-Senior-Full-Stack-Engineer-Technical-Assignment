/**
 * Unit tests for slot generation domain logic.
 *
 * Covers:
 * - Normal day slot generation
 * - US Spring Forward (2026-03-08 America/New_York — clocks jump 2am→3am)
 * - US Fall Back (2026-11-01 America/New_York — clocks repeat 1am-2am)
 * - UK Spring Forward (2026-03-29 Europe/London — clocks jump 1am→2am)
 * - UK Fall Back (2026-10-25 Europe/London — clocks repeat 1am-2am)
 * - US/UK DST mismatch weeks (March and Nov when only one has changed)
 * - Dublin (Europe/Dublin)
 * - Los Angeles (America/Los_Angeles)
 * - Phoenix (America/Phoenix — no DST)
 * - Mentor working windows including midnight-crossing
 * - Mentor local date calculation
 * - Lead time validation
 * - Bookable window check
 * - Time-of-day grouping
 */

import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import {
  generateSlotStartsUtc,
  getDayBoundsUtc,
  buildSlotInfo,
  isMentorWorkingAtUtc,
  getMentorLocalDate,
  isSlotBookable,
  isDateInBookableWindow,
  getTimeOfDay,
  isValidIANAZone,
  formatUtcOffset,
  utcToLocal,
} from '../domain/slots.js';

describe('isValidIANAZone', () => {
  it('accepts valid IANA zones', () => {
    expect(isValidIANAZone('America/New_York')).toBe(true);
    expect(isValidIANAZone('Asia/Kolkata')).toBe(true);
    expect(isValidIANAZone('Europe/London')).toBe(true);
    expect(isValidIANAZone('Pacific/Honolulu')).toBe(true);
  });

  it('rejects invalid zones', () => {
    expect(isValidIANAZone('US/Eastern')).toBe(true); // This is actually valid (legacy)
    expect(isValidIANAZone('NotAZone')).toBe(false);
    expect(isValidIANAZone('UTC+5:30')).toBe(false);
    expect(isValidIANAZone('')).toBe(false);
  });
});

describe('formatUtcOffset', () => {
  it('formats whole-hour offsets', () => {
    expect(formatUtcOffset(-300)).toBe('UTC−5');
    expect(formatUtcOffset(0)).toBe('UTC+0');
    expect(formatUtcOffset(60)).toBe('UTC+1');
  });

  it('formats fractional offsets', () => {
    expect(formatUtcOffset(330)).toBe('UTC+5:30');
    expect(formatUtcOffset(345)).toBe('UTC+5:45');
    expect(formatUtcOffset(-210)).toBe('UTC−3:30');
  });
});

describe('getDayBoundsUtc', () => {
  it('returns 24-hour window for normal day', () => {
    const { startUtc, endUtc } = getDayBoundsUtc('2026-06-15', 'America/New_York');
    // June 15 in EDT (UTC-4): midnight = 04:00 UTC
    expect(startUtc.toISO()).toBe('2026-06-15T04:00:00.000Z');
    expect(endUtc.toISO()).toBe('2026-06-16T04:00:00.000Z');
    // Should be exactly 24 hours
    expect(endUtc.diff(startUtc, 'hours').hours).toBe(24);
  });

  it('returns 23-hour window for US spring-forward day', () => {
    // March 8, 2026 in America/New_York: clocks spring forward at 2am
    const { startUtc, endUtc } = getDayBoundsUtc('2026-03-08', 'America/New_York');
    // Start: midnight EST (UTC-5) = 05:00 UTC
    expect(startUtc.toISO()).toBe('2026-03-08T05:00:00.000Z');
    // End: midnight EDT (UTC-4) = 04:00 UTC next day
    expect(endUtc.toISO()).toBe('2026-03-09T04:00:00.000Z');
    // 23 hours (one hour lost)
    expect(endUtc.diff(startUtc, 'hours').hours).toBe(23);
  });

  it('returns 25-hour window for US fall-back day', () => {
    // November 1, 2026 in America/New_York: clocks fall back at 2am
    const { startUtc, endUtc } = getDayBoundsUtc('2026-11-01', 'America/New_York');
    // Start: midnight EDT (UTC-4) = 04:00 UTC
    expect(startUtc.toISO()).toBe('2026-11-01T04:00:00.000Z');
    // End: midnight EST (UTC-5) = 05:00 UTC next day
    expect(endUtc.toISO()).toBe('2026-11-02T05:00:00.000Z');
    // 25 hours (one hour gained)
    expect(endUtc.diff(startUtc, 'hours').hours).toBe(25);
  });

  it('returns 23-hour window for UK spring-forward day', () => {
    // March 29, 2026 in Europe/London: clocks spring forward at 1am GMT → 2am BST
    const { startUtc, endUtc } = getDayBoundsUtc('2026-03-29', 'Europe/London');
    expect(startUtc.toISO()).toBe('2026-03-29T00:00:00.000Z');
    expect(endUtc.toISO()).toBe('2026-03-29T23:00:00.000Z');
    expect(endUtc.diff(startUtc, 'hours').hours).toBe(23);
  });

  it('returns 25-hour window for UK fall-back day', () => {
    // October 25, 2026 in Europe/London: clocks fall back at 2am BST → 1am GMT
    const { startUtc, endUtc } = getDayBoundsUtc('2026-10-25', 'Europe/London');
    // Start: midnight BST (UTC+1) = 23:00 UTC previous day
    expect(startUtc.toISO()).toBe('2026-10-24T23:00:00.000Z');
    // End: midnight GMT (UTC+0) = 00:00 UTC next day
    expect(endUtc.toISO()).toBe('2026-10-26T00:00:00.000Z');
    expect(endUtc.diff(startUtc, 'hours').hours).toBe(25);
  });

  it('returns 24-hour window for Phoenix (no DST)', () => {
    // Phoenix doesn't observe DST
    const { startUtc, endUtc } = getDayBoundsUtc('2026-03-08', 'America/Phoenix');
    expect(endUtc.diff(startUtc, 'hours').hours).toBe(24);
  });
});

describe('generateSlotStartsUtc', () => {
  it('generates correct number of slots for a normal 24-hour day', () => {
    const slots = generateSlotStartsUtc('2026-06-15', 'America/New_York', 30);
    // 24 hours × 2 slots/hour = 48 slots
    expect(slots).toHaveLength(48);
  });

  it('generates 46 slots for a 23-hour spring-forward day (US)', () => {
    const slots = generateSlotStartsUtc('2026-03-08', 'America/New_York', 30);
    // 23 hours × 2 = 46
    expect(slots).toHaveLength(46);
  });

  it('generates 50 slots for a 25-hour fall-back day (US)', () => {
    const slots = generateSlotStartsUtc('2026-11-01', 'America/New_York', 30);
    // 25 hours × 2 = 50
    expect(slots).toHaveLength(50);
  });

  it('generates 46 slots for UK spring-forward day', () => {
    const slots = generateSlotStartsUtc('2026-03-29', 'Europe/London', 30);
    expect(slots).toHaveLength(46);
  });

  it('generates 50 slots for UK fall-back day', () => {
    const slots = generateSlotStartsUtc('2026-10-25', 'Europe/London', 30);
    expect(slots).toHaveLength(50);
  });

  it('generates correct slots for Phoenix (no DST, same as any normal day)', () => {
    const slots = generateSlotStartsUtc('2026-03-08', 'America/Phoenix', 30);
    expect(slots).toHaveLength(48);
  });

  it('generates correct slots for Dublin on US spring-forward day', () => {
    // On 2026-03-08, Dublin has NOT yet sprung forward (Dublin does Mar 29)
    // So Dublin is still GMT (UTC+0), a normal 24-hour day
    const slots = generateSlotStartsUtc('2026-03-08', 'Europe/Dublin', 30);
    expect(slots).toHaveLength(48);
  });

  it('generates correct slots for Los Angeles on US spring-forward day', () => {
    // LA also springs forward on March 8, 2026
    const slots = generateSlotStartsUtc('2026-03-08', 'America/Los_Angeles', 30);
    expect(slots).toHaveLength(46);
  });

  it('spring-forward: skips the nonexistent 2:00–2:59 AM local time slot', () => {
    // On 2026-03-08 in America/New_York, 2:00 AM doesn't exist (jumps to 3:00 AM)
    const slots = generateSlotStartsUtc('2026-03-08', 'America/New_York', 30);

    const localTimes = slots.map((s) => {
      const local = s.setZone('America/New_York');
      return `${local.hour}:${String(local.minute).padStart(2, '0')}`;
    });

    // 2:00 and 2:30 should NOT exist
    expect(localTimes).not.toContain('2:00');
    expect(localTimes).not.toContain('2:30');
    // 1:30 and 3:00 should exist
    expect(localTimes).toContain('1:30');
    expect(localTimes).toContain('3:00');
  });

  it('fall-back: produces two distinct UTC instants for the repeated 1:00 AM hour', () => {
    // On 2026-11-01 in America/New_York, 1:00 AM happens twice (EDT then EST)
    const slots = generateSlotStartsUtc('2026-11-01', 'America/New_York', 30);

    // Find all slots that show 1:00 or 1:30 in local time
    const oneAMSlots = slots.filter((s) => {
      const local = s.setZone('America/New_York');
      return local.hour === 1;
    });

    // Should have 4 slots: 1:00 EDT, 1:30 EDT, 1:00 EST, 1:30 EST
    expect(oneAMSlots).toHaveLength(4);

    // All should be distinct UTC instants
    const utcStrings = oneAMSlots.map((s) => s.toISO());
    const unique = new Set(utcStrings);
    expect(unique.size).toBe(4);
  });

  it('fall-back: disambiguates with different zone abbreviations', () => {
    const slots = generateSlotStartsUtc('2026-11-01', 'America/New_York', 30);

    const oneAMSlots = slots.filter((s) => {
      const local = s.setZone('America/New_York');
      return local.hour === 1 && local.minute === 0;
    });

    expect(oneAMSlots).toHaveLength(2);

    const abbrs = oneAMSlots.map((s) => s.setZone('America/New_York').toFormat('ZZZZ'));
    // One should be EDT and one EST
    expect(abbrs).toContain('EDT');
    expect(abbrs).toContain('EST');
  });

  it('all generated slots are valid UTC instants', () => {
    const slots = generateSlotStartsUtc('2026-07-04', 'America/New_York', 30);
    for (const slot of slots) {
      expect(slot.isValid).toBe(true);
      expect(slot.zone.name).toBe('UTC');
    }
  });
});

describe('US/UK DST mismatch weeks', () => {
  // In 2026:
  // US springs forward: March 8
  // UK springs forward: March 29
  // So March 9-28 is a "mismatch" period where US is EDT but UK is still GMT

  it('handles the mismatch week in March (US in EDT, UK still in GMT)', () => {
    const date = '2026-03-15';

    // US (New York) is already EDT (UTC-4)
    const nySlots = generateSlotStartsUtc(date, 'America/New_York', 30);
    const nyStart = nySlots[0].setZone('America/New_York');
    expect(nyStart.toFormat('ZZZZ')).toBe('EDT');

    // UK (London) is still GMT (UTC+0)
    const londonSlots = generateSlotStartsUtc(date, 'Europe/London', 30);
    const londonStart = londonSlots[0].setZone('Europe/London');
    expect(londonStart.toFormat('ZZZZ')).toBe('GMT');

    // Different number of slots? No — both are normal 24h days
    expect(nySlots).toHaveLength(48);
    expect(londonSlots).toHaveLength(48);

    // But the UTC instants should differ (different day boundaries)
    expect(nySlots[0].toISO()).not.toBe(londonSlots[0].toISO());
  });

  it('handles the mismatch week in Nov (US fell back, UK still BST)', () => {
    // US falls back Nov 1, UK falls back Oct 25
    // So Oct 26-31 is mismatch: UK is GMT, US is still EDT
    // Wait — let's check: UK falls back Oct 25. US falls back Nov 1.
    // So Oct 26-31: UK is GMT (already fell back), US is still EDT (hasn't yet)
    const date = '2026-10-28';

    const nySlots = generateSlotStartsUtc(date, 'America/New_York', 30);
    const nyStart = nySlots[0].setZone('America/New_York');
    expect(nyStart.toFormat('ZZZZ')).toBe('EDT'); // US still on EDT

    const londonSlots = generateSlotStartsUtc(date, 'Europe/London', 30);
    const londonStart = londonSlots[0].setZone('Europe/London');
    expect(londonStart.toFormat('ZZZZ')).toBe('GMT'); // UK already fell back
  });
});

describe('buildSlotInfo', () => {
  it('formats slot info with correct timezone abbreviation', () => {
    const slotUtc = DateTime.fromISO('2026-06-15T14:00:00.000Z');
    const info = buildSlotInfo(slotUtc, 30, 'America/New_York');

    expect(info.startUtc).toBe('2026-06-15T14:00:00.000Z');
    expect(info.endUtc).toBe('2026-06-15T14:30:00.000Z');
    expect(info.tzAbbr).toBe('EDT');
    expect(info.utcOffset).toBe('UTC−4');
    expect(info.localStart).toContain('10:00 AM');
    expect(info.localStart).toContain('EDT');
  });

  it('shows IST offset correctly', () => {
    const slotUtc = DateTime.fromISO('2026-06-15T14:00:00.000Z');
    const info = buildSlotInfo(slotUtc, 30, 'Asia/Kolkata');

    expect(['IST', 'GMT+5:30']).toContain(info.tzAbbr);
    expect(info.utcOffset).toBe('UTC+5:30');
    expect(info.localStart).toContain('7:30 PM');
  });
});

describe('isMentorWorkingAtUtc', () => {
  const istWindows15to00 = [{ startLocal: '15:00', endLocal: '00:00' }];
  const istWindows20to05 = [{ startLocal: '20:00', endLocal: '05:00' }];

  it('returns true for a slot within 15:00–00:00 IST window', () => {
    // 15:30 IST = 10:00 UTC
    const slotUtc = DateTime.fromISO('2026-06-15T10:00:00.000Z');
    expect(isMentorWorkingAtUtc(slotUtc, 'Asia/Kolkata', istWindows15to00, 30)).toBe(true);
  });

  it('returns false for a slot before 15:00 IST', () => {
    // 14:00 IST = 08:30 UTC
    const slotUtc = DateTime.fromISO('2026-06-15T08:30:00.000Z');
    expect(isMentorWorkingAtUtc(slotUtc, 'Asia/Kolkata', istWindows15to00, 30)).toBe(false);
  });

  it('returns true for 23:30 IST (last valid slot before midnight)', () => {
    // 23:30 IST = 18:00 UTC
    const slotUtc = DateTime.fromISO('2026-06-15T18:00:00.000Z');
    expect(isMentorWorkingAtUtc(slotUtc, 'Asia/Kolkata', istWindows15to00, 30)).toBe(true);
  });

  it('returns false for slot that would end at 00:30 (outside 15:00-00:00)', () => {
    // 00:00 IST = 18:30 UTC (slot would be 00:00-00:30 IST, ends after window)
    const slotUtc = DateTime.fromISO('2026-06-15T18:30:00.000Z');
    expect(isMentorWorkingAtUtc(slotUtc, 'Asia/Kolkata', istWindows15to00, 30)).toBe(false);
  });

  it('handles midnight-crossing window (20:00–05:00): evening slot', () => {
    // 22:00 IST = 16:30 UTC
    const slotUtc = DateTime.fromISO('2026-06-15T16:30:00.000Z');
    expect(isMentorWorkingAtUtc(slotUtc, 'Asia/Kolkata', istWindows20to05, 30)).toBe(true);
  });

  it('handles midnight-crossing window (20:00–05:00): after-midnight slot', () => {
    // 03:00 IST = 21:30 UTC (previous day)
    const slotUtc = DateTime.fromISO('2026-06-14T21:30:00.000Z');
    expect(isMentorWorkingAtUtc(slotUtc, 'Asia/Kolkata', istWindows20to05, 30)).toBe(true);
  });

  it('handles midnight-crossing window (20:00–05:00): outside hours', () => {
    // 12:00 IST = 06:30 UTC
    const slotUtc = DateTime.fromISO('2026-06-15T06:30:00.000Z');
    expect(isMentorWorkingAtUtc(slotUtc, 'Asia/Kolkata', istWindows20to05, 30)).toBe(false);
  });

  it('handles midnight-crossing window: slot at 04:30 (ends at 05:00, should be valid)', () => {
    // 04:30 IST = 23:00 UTC (previous day)
    const slotUtc = DateTime.fromISO('2026-06-14T23:00:00.000Z');
    expect(isMentorWorkingAtUtc(slotUtc, 'Asia/Kolkata', istWindows20to05, 30)).toBe(true);
  });

  it('handles midnight-crossing window: slot at 05:00 (outside window)', () => {
    // 05:00 IST = 23:30 UTC (previous day)
    const slotUtc = DateTime.fromISO('2026-06-14T23:30:00.000Z');
    expect(isMentorWorkingAtUtc(slotUtc, 'Asia/Kolkata', istWindows20to05, 30)).toBe(false);
  });

  it('accepts a JS Date as input', () => {
    const jsDate = new Date('2026-06-15T10:00:00.000Z');
    expect(isMentorWorkingAtUtc(jsDate, 'Asia/Kolkata', istWindows15to00, 30)).toBe(true);
  });
});

describe('getMentorLocalDate', () => {
  it('returns correct IST date for a UTC instant in the same calendar day', () => {
    // 2026-06-15 10:00 UTC = 2026-06-15 15:30 IST
    const slotUtc = DateTime.fromISO('2026-06-15T10:00:00.000Z');
    expect(getMentorLocalDate(slotUtc, 'Asia/Kolkata')).toBe('2026-06-15');
  });

  it('returns next IST date for a late UTC instant', () => {
    // 2026-06-15 19:00 UTC = 2026-06-16 00:30 IST (next day!)
    const slotUtc = DateTime.fromISO('2026-06-15T19:00:00.000Z');
    expect(getMentorLocalDate(slotUtc, 'Asia/Kolkata')).toBe('2026-06-16');
  });

  it('handles US evening slot landing on next IST day', () => {
    // A parent in New York books an 8pm EDT slot:
    // 8pm EDT = midnight UTC = 5:30 AM IST next day
    const slotUtc = DateTime.fromISO('2026-06-16T00:00:00.000Z');
    expect(getMentorLocalDate(slotUtc, 'Asia/Kolkata')).toBe('2026-06-16');
  });

  it('accepts a JS Date as input', () => {
    const jsDate = new Date('2026-06-15T10:00:00.000Z');
    expect(getMentorLocalDate(jsDate, 'Asia/Kolkata')).toBe('2026-06-15');
  });
});

describe('isSlotBookable', () => {
  it('returns true for a slot more than 2 hours from now', () => {
    const now = DateTime.fromISO('2026-06-15T10:00:00.000Z');
    const slot = DateTime.fromISO('2026-06-15T13:00:00.000Z');
    expect(isSlotBookable(slot, 2, now)).toBe(true);
  });

  it('returns false for a slot less than 2 hours from now', () => {
    const now = DateTime.fromISO('2026-06-15T10:00:00.000Z');
    const slot = DateTime.fromISO('2026-06-15T11:30:00.000Z');
    expect(isSlotBookable(slot, 2, now)).toBe(false);
  });

  it('returns true for a slot exactly 2 hours from now', () => {
    const now = DateTime.fromISO('2026-06-15T10:00:00.000Z');
    const slot = DateTime.fromISO('2026-06-15T12:00:00.000Z');
    expect(isSlotBookable(slot, 2, now)).toBe(true);
  });

  it('returns false for a past slot', () => {
    const now = DateTime.fromISO('2026-06-15T10:00:00.000Z');
    const slot = DateTime.fromISO('2026-06-15T09:00:00.000Z');
    expect(isSlotBookable(slot, 2, now)).toBe(false);
  });
});

describe('isDateInBookableWindow', () => {
  it('returns true for today', () => {
    const now = DateTime.fromISO('2026-06-15T10:00:00.000Z');
    expect(isDateInBookableWindow('2026-06-15', 'America/New_York', 14, now)).toBe(true);
  });

  it('returns true for a date within 14 days', () => {
    const now = DateTime.fromISO('2026-06-15T10:00:00.000Z');
    expect(isDateInBookableWindow('2026-06-25', 'America/New_York', 14, now)).toBe(true);
  });

  it('returns false for a date beyond 14 days', () => {
    const now = DateTime.fromISO('2026-06-15T10:00:00.000Z');
    expect(isDateInBookableWindow('2026-07-15', 'America/New_York', 14, now)).toBe(false);
  });

  it('returns false for yesterday', () => {
    const now = DateTime.fromISO('2026-06-15T10:00:00.000Z');
    expect(isDateInBookableWindow('2026-06-14', 'America/New_York', 14, now)).toBe(false);
  });
});

describe('getTimeOfDay', () => {
  it('classifies morning slots', () => {
    // 8:00 AM EDT
    const slotUtc = DateTime.fromISO('2026-06-15T12:00:00.000Z');
    expect(getTimeOfDay(slotUtc, 'America/New_York')).toBe('morning');
  });

  it('classifies afternoon slots', () => {
    // 2:00 PM EDT
    const slotUtc = DateTime.fromISO('2026-06-15T18:00:00.000Z');
    expect(getTimeOfDay(slotUtc, 'America/New_York')).toBe('afternoon');
  });

  it('classifies evening slots', () => {
    // 7:00 PM EDT
    const slotUtc = DateTime.fromISO('2026-06-15T23:00:00.000Z');
    expect(getTimeOfDay(slotUtc, 'America/New_York')).toBe('evening');
  });
});

describe('utcToLocal', () => {
  it('converts UTC to IST correctly', () => {
    const result = utcToLocal(new Date('2026-06-15T10:00:00.000Z'), 'Asia/Kolkata');
    expect(result.localTime).toBe('15:30');
    expect(result.localDate).toBe('2026-06-15');
    expect(['IST', 'GMT+5:30']).toContain(result.tzAbbr);
  });

  it('converts UTC to EDT correctly', () => {
    const result = utcToLocal(new Date('2026-06-15T14:00:00.000Z'), 'America/New_York');
    expect(result.localTime).toBe('10:00');
    expect(result.tzAbbr).toBe('EDT');
  });

  it('converts UTC to GMT correctly for London in winter', () => {
    const result = utcToLocal(new Date('2026-01-15T14:00:00.000Z'), 'Europe/London');
    expect(result.localTime).toBe('14:00');
    expect(result.tzAbbr).toBe('GMT');
  });
});

import { FixedClock, setClock, resetClock } from '../utils/clock.js';

describe('Clock independence & Pinned Time Tests', () => {
  afterEach(() => {
    resetClock();
  });

  it('keeps 2026-03-08 (US Spring Forward) in window when clock is pinned to 2026-03-01', () => {
    const clock = new FixedClock(DateTime.fromISO('2026-03-01T12:00:00.000Z'));
    setClock(clock);
    expect(isDateInBookableWindow('2026-03-08', 'America/New_York', 14)).toBe(true);
  });

  it('keeps 2026-03-29 (UK Spring Forward) in window when clock is pinned to 2026-03-20', () => {
    const clock = new FixedClock(DateTime.fromISO('2026-03-20T12:00:00.000Z'));
    setClock(clock);
    expect(isDateInBookableWindow('2026-03-29', 'Europe/London', 14)).toBe(true);
  });

  it('keeps 2026-10-25 (UK Fall Back) and 2026-11-01 (US Fall Back) in window when pinned', () => {
    const clockUk = new FixedClock(DateTime.fromISO('2026-10-20T12:00:00.000Z'));
    setClock(clockUk);
    expect(isDateInBookableWindow('2026-10-25', 'Europe/London', 14)).toBe(true);

    const clockUs = new FixedClock(DateTime.fromISO('2026-10-25T12:00:00.000Z'));
    setClock(clockUs);
    expect(isDateInBookableWindow('2026-11-01', 'America/New_York', 14)).toBe(true);
  });

  it('proves identical slot generation & bookability behavior when run 6 months in the future', () => {
    // Run at baseline date T1
    const baseNow = DateTime.fromISO('2026-04-10T08:00:00.000Z');
    const baseTargetDate = '2026-04-15';
    setClock(new FixedClock(baseNow));

    const baseSlots = generateSlotStartsUtc(baseTargetDate, 'America/New_York', 30);
    const baseBookable = baseSlots.map((s) => isSlotBookable(s, 2));

    // Run at T2 = T1 + 6 months
    const futureNow = baseNow.plus({ months: 6 });
    const futureTargetDate = DateTime.fromISO(baseTargetDate).plus({ months: 6 }).toFormat('yyyy-MM-dd');
    setClock(new FixedClock(futureNow));

    const futureSlots = generateSlotStartsUtc(futureTargetDate, 'America/New_York', 30);
    const futureBookable = futureSlots.map((s) => isSlotBookable(s, 2));

    // Both runs must have the exact same number of slots and identical bookable patterns
    expect(futureSlots.length).toBe(baseSlots.length);
    expect(futureBookable).toEqual(baseBookable);
  });
});
