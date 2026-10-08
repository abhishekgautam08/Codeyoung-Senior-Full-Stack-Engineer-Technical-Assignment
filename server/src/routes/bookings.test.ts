/**
 * Integration tests for the booking API.
 *
 * Uses mongodb-memory-server for isolated testing (no real MongoDB needed).
 *
 * Covers:
 * - Health check
 * - Slot retrieval
 * - Booking happy path
 * - Validation errors
 * - Duplicate booking prevention
 * - Mentor capacity limit (2/day)
 * - 409 when all mentors booked
 * - Idempotent retry (same Idempotency-Key returns same booking)
 * - Cancellation frees capacity
 * - Concurrency race: 25 parallel requests for the same slot
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import supertest from 'supertest';
import { DateTime } from 'luxon';
import { createApp } from '../app.js';
import { Mentor, Booking, MentorDailyLoad, Notification } from '../models/index.js';
import { FixedClock, setClock, resetClock, getClock } from '../utils/clock.js';
import { generateBookingRef, BOOKING_REF_REGEX } from '../utils/bookingRef.js';

let mongoServer: MongoMemoryServer;
let app: ReturnType<typeof createApp>;
let request: supertest.Agent;

// Pinned clock to make all integration tests independent of current real-world clock
const PINNED_NOW = DateTime.fromISO('2026-10-15T10:00:00.000Z', { zone: 'utc' });

// A future slot time that's always >2 hours from pinned now
function futureSlot(daysAhead = 2, hour = 16, minute = 0): string {
  return getClock()
    .now()
    .plus({ days: daysAhead })
    .set({ hour, minute, second: 0, millisecond: 0 })
    .toUTC()
    .toISO()!;
}

const testMentors = [
  {
    name: 'Test Mentor A',
    email: 'mentor.a@test.com',
    timezone: 'Asia/Kolkata',
    workingWindows: [{ startLocal: '00:00', endLocal: '23:59' }], // Works all day for testing
    avatarUrl: 'https://example.com/a.png',
    bio: 'Test mentor A',
    isActive: true,
  },
  {
    name: 'Test Mentor B',
    email: 'mentor.b@test.com',
    timezone: 'Asia/Kolkata',
    workingWindows: [{ startLocal: '00:00', endLocal: '23:59' }],
    avatarUrl: 'https://example.com/b.png',
    bio: 'Test mentor B',
    isActive: true,
  },
  {
    name: 'Test Mentor C',
    email: 'mentor.c@test.com',
    timezone: 'Asia/Kolkata',
    workingWindows: [{ startLocal: '00:00', endLocal: '23:59' }],
    avatarUrl: 'https://example.com/c.png',
    bio: 'Test mentor C',
    isActive: true,
  },
];

beforeAll(async () => {
  setClock(new FixedClock(PINNED_NOW));
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
  app = createApp();
  request = supertest(app) as unknown as supertest.Agent;
});

afterAll(async () => {
  resetClock();
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

beforeEach(async () => {
  await Booking.deleteMany({});
  await MentorDailyLoad.deleteMany({});
  await Notification.deleteMany({});
  await Mentor.deleteMany({});
  // Re-seed test mentors
  await Mentor.insertMany(testMentors);
});

describe('GET /api/health', () => {
  it('returns ok', async () => {
    const res = await request.get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('GET /api/timezones/suggested', () => {
  it('returns suggested timezones', async () => {
    const res = await request.get('/api/timezones/suggested');
    expect(res.status).toBe(200);
    expect(res.body.timezones).toBeInstanceOf(Array);
    expect(res.body.timezones.length).toBeGreaterThan(0);
    expect(res.body.timezones[0]).toHaveProperty('value');
    expect(res.body.timezones[0]).toHaveProperty('label');
    expect(res.body.suggestedTimezones).toBeInstanceOf(Array);
  });
});

describe('GET /api/mentors', () => {
  it('returns all active mentors with working windows and profile info', async () => {
    const res = await request.get('/api/mentors');
    expect(res.status).toBe(200);
    expect(res.body.mentors).toBeInstanceOf(Array);
    expect(res.body.mentors.length).toBe(testMentors.length);
    expect(res.body.mentors[0]).toHaveProperty('name');
    expect(res.body.mentors[0]).toHaveProperty('workingWindows');
  });

  it('returns mentor schedule with dailyLoad, workingWindows, and bookings', async () => {
    const mentor = await Mentor.findOne({ isActive: true });
    expect(mentor).toBeDefined();

    const res = await request.get(`/api/mentors/${mentor!._id}/schedule`);
    expect(res.status).toBe(200);
    expect(res.body.mentor).toBeDefined();
    expect(res.body.dailyLoad).toBeDefined();
    expect(typeof res.body.dailyLoad.count).toBe('number');
    expect(res.body.dailyLoad.max).toBe(2);
    expect(res.body.workingWindows).toBeInstanceOf(Array);
    expect(res.body.bookings).toBeInstanceOf(Array);
  });
});

describe('GET /api/slots', () => {
  it('returns slots for a valid date and timezone', async () => {
    const futureDate = getClock().now().plus({ days: 3 }).toFormat('yyyy-MM-dd');
    const res = await request
      .get('/api/slots')
      .query({ date: futureDate, tz: 'America/New_York' });

    expect(res.status).toBe(200);
    expect(res.body.slots).toBeInstanceOf(Array);
    expect(res.body.date).toBe(futureDate);
    expect(res.body.timezone).toBe('America/New_York');
  });

  it('rejects invalid timezone with 400', async () => {
    const res = await request
      .get('/api/slots')
      .query({ date: '2026-10-15', tz: 'NotAZone' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects date outside bookable window', async () => {
    const farDate = getClock().now().plus({ days: 30 }).toFormat('yyyy-MM-dd');
    const res = await request
      .get('/api/slots')
      .query({ date: farDate, tz: 'America/New_York' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/availability/calendar', () => {
  it('returns month availability with date, hasAvailability, and limited flags', async () => {
    const month = getClock().now().toFormat('yyyy-MM');
    const res = await request
      .get('/api/availability/calendar')
      .query({ month, tz: 'America/New_York' });

    expect(res.status).toBe(200);
    expect(res.body.month).toBe(month);
    expect(res.body.timezone).toBe('America/New_York');
    expect(res.body.days).toBeInstanceOf(Array);
    expect(res.body.days.length).toBeGreaterThanOrEqual(28);

    const firstDay = res.body.days[0];
    expect(firstDay).toHaveProperty('date');
    expect(firstDay).toHaveProperty('hasAvailability');
    expect(firstDay).toHaveProperty('limited');
    expect(typeof firstDay.hasAvailability).toBe('boolean');
    expect(typeof firstDay.limited).toBe('boolean');
  });

  it('rejects invalid month format with 400', async () => {
    const res = await request
      .get('/api/availability/calendar')
      .query({ month: 'invalid-month', tz: 'America/New_York' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/bookings', () => {
  it('creates a booking successfully (happy path)', async () => {
    const slotStart = futureSlot();

    const res = await request.post('/api/bookings').send({
      parentName: 'Test Parent',
      parentEmail: 'parent@test.com',
      parentTimezone: 'America/New_York',
      slotStartUtc: slotStart,
    });

    expect(res.status).toBe(201);
    expect(res.body.booking).toBeDefined();
    expect(res.body.booking.bookingRef).toMatch(/^CY-/);
    expect(res.body.booking.parentName).toBe('Test Parent');
    expect(res.body.booking.meetingLink).toContain('meet.codeyoung.demo');
    expect(res.body.booking.mentor).toBeDefined();
    expect(res.body.booking.parentLocalTime).toBeDefined();
    expect(res.body.booking.mentorLocalTime).toBeDefined();

    // Verify notification was created
    const notifications = await Notification.find({});
    expect(notifications.length).toBeGreaterThanOrEqual(2); // parent + mentor
  });

  it('rejects missing required fields with 400', async () => {
    const res = await request.post('/api/bookings').send({
      parentName: 'Test',
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects invalid email with 400', async () => {
    const res = await request.post('/api/bookings').send({
      parentName: 'Test',
      parentEmail: 'not-an-email',
      parentTimezone: 'America/New_York',
      slotStartUtc: futureSlot(),
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects invalid timezone with 400', async () => {
    const res = await request.post('/api/bookings').send({
      parentName: 'Test',
      parentEmail: 'test@test.com',
      parentTimezone: 'InvalidZone',
      slotStartUtc: futureSlot(),
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects slot in the past', async () => {
    const pastSlot = getClock().now().minus({ hours: 1 }).toUTC().toISO()!;

    const res = await request.post('/api/bookings').send({
      parentName: 'Test',
      parentEmail: 'test@test.com',
      parentTimezone: 'America/New_York',
      slotStartUtc: pastSlot,
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SLOT_IN_PAST');
  });

  it('rejects slot too soon (less than 2 hours)', async () => {
    const tooSoonSlot = getClock().now().plus({ hours: 1 }).toUTC().toISO()!;

    const res = await request.post('/api/bookings').send({
      parentName: 'Test',
      parentEmail: 'test@test.com',
      parentTimezone: 'America/New_York',
      slotStartUtc: tooSoonSlot,
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TOO_SOON');
  });

  it('prevents duplicate booking (same email + same slot)', async () => {
    const slotStart = futureSlot();

    // First booking
    await request.post('/api/bookings').send({
      parentName: 'Test Parent',
      parentEmail: 'dupe@test.com',
      parentTimezone: 'America/New_York',
      slotStartUtc: slotStart,
    });

    // Second booking with same email + slot
    const res = await request.post('/api/bookings').send({
      parentName: 'Test Parent',
      parentEmail: 'dupe@test.com',
      parentTimezone: 'America/New_York',
      slotStartUtc: slotStart,
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_BOOKING');
  });

  it('enforces max 2 bookings per mentor per day', async () => {
    // We have 3 mentors. Book 6 slots (2 per mentor) on the same day.
    const baseTime = getClock()
      .now()
      .plus({ days: 3 })
      .set({ hour: 10, minute: 0, second: 0, millisecond: 0 });

    const bookings = [];
    for (let i = 0; i < 6; i++) {
      const slot = baseTime.plus({ minutes: i * 30 }).toUTC().toISO()!;
      const res = await request.post('/api/bookings').send({
        parentName: `Parent ${i}`,
        parentEmail: `parent${i}@test.com`,
        parentTimezone: 'America/New_York',
        slotStartUtc: slot,
      });
      bookings.push(res);
    }

    // First 6 should succeed (3 mentors × 2 bookings each)
    for (let i = 0; i < 6; i++) {
      expect(bookings[i].status).toBe(201);
    }

    // 7th booking should fail — all mentors at capacity
    const res = await request.post('/api/bookings').send({
      parentName: 'Parent 7',
      parentEmail: 'parent7@test.com',
      parentTimezone: 'America/New_York',
      slotStartUtc: baseTime.plus({ minutes: 180 }).toISO()!,
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLOT_UNAVAILABLE');

    // Verify no mentor has more than 2 bookings
    const mentors = await Mentor.find({}).lean();
    for (const mentor of mentors) {
      const count = await Booking.countDocuments({
        mentorId: mentor._id,
        status: 'CONFIRMED',
      });
      expect(count).toBeLessThanOrEqual(2);
    }
  });

  it('returns idempotent result for same Idempotency-Key', async () => {
    const slotStart = futureSlot();
    const idempotencyKey = 'test-idempotency-key-123';

    const res1 = await request
      .post('/api/bookings')
      .set('Idempotency-Key', idempotencyKey)
      .send({
        parentName: 'Idemp Parent',
        parentEmail: 'idemp@test.com',
        parentTimezone: 'America/New_York',
        slotStartUtc: slotStart,
      });

    expect(res1.status).toBe(201);

    const res2 = await request
      .post('/api/bookings')
      .set('Idempotency-Key', idempotencyKey)
      .send({
        parentName: 'Idemp Parent',
        parentEmail: 'idemp@test.com',
        parentTimezone: 'America/New_York',
        slotStartUtc: slotStart,
      });

    // Should return same booking, not a duplicate
    expect(res2.status).toBe(201);
    expect(res2.body.booking.bookingRef).toBe(res1.body.booking.bookingRef);

    // Only one booking should exist
    const bookings = await Booking.countDocuments({ status: 'CONFIRMED' });
    expect(bookings).toBe(1);
  });
});

describe('GET /api/bookings/:bookingRef', () => {
  it('returns booking details', async () => {
    const slotStart = futureSlot();
    const createRes = await request.post('/api/bookings').send({
      parentName: 'Lookup Parent',
      parentEmail: 'lookup@test.com',
      parentTimezone: 'America/New_York',
      slotStartUtc: slotStart,
    });

    const bookingRef = createRes.body.booking.bookingRef;

    const res = await request.get(`/api/bookings/${bookingRef}`);
    expect(res.status).toBe(200);
    expect(res.body.booking.bookingRef).toBe(bookingRef);
  });

  it('returns 404 for non-existent booking', async () => {
    const res = await request.get('/api/bookings/CY-NONEXIST');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('DELETE /api/bookings/:bookingRef (cancellation)', () => {
  it('cancels a booking and frees capacity', async () => {
    // Book all 6 slots (3 mentors × 2 each)
    const baseTime = getClock()
      .now()
      .plus({ days: 4 })
      .set({ hour: 10, minute: 0, second: 0, millisecond: 0 });

    const bookingRefs: string[] = [];
    for (let i = 0; i < 6; i++) {
      const slot = baseTime.plus({ minutes: i * 30 }).toUTC().toISO()!;
      const res = await request.post('/api/bookings').send({
        parentName: `Cancel Parent ${i}`,
        parentEmail: `cancel${i}@test.com`,
        parentTimezone: 'America/New_York',
        slotStartUtc: slot,
      });
      expect(res.status).toBe(201);
      bookingRefs.push(res.body.booking.bookingRef);
    }

    // Verify all slots are booked — next booking should fail
    const failRes = await request.post('/api/bookings').send({
      parentName: 'Should Fail',
      parentEmail: 'shouldfail@test.com',
      parentTimezone: 'America/New_York',
      slotStartUtc: baseTime.plus({ minutes: 180 }).toISO()!,
    });
    expect(failRes.status).toBe(409);

    // Cancel one booking
    const cancelRes = await request.delete(`/api/bookings/${bookingRefs[0]}`);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.booking.status).toBe('CANCELLED');

    // Now should be able to book again
    const successRes = await request.post('/api/bookings').send({
      parentName: 'After Cancel',
      parentEmail: 'aftercancel@test.com',
      parentTimezone: 'America/New_York',
      slotStartUtc: baseTime.plus({ minutes: 180 }).toISO()!,
    });
    expect(successRes.status).toBe(201);
  });
});

describe('Concurrency race test', () => {
  it('handles 25 parallel booking requests safely — no mentor exceeds 2/day, no double-booked slots', async () => {
    // Target: all 25 requests try to book the SAME slot
    const slotStart = futureSlot(5, 14, 0);

    const promises = Array.from({ length: 25 }, (_, i) =>
      request.post('/api/bookings').send({
        parentName: `Concurrent Parent ${i}`,
        parentEmail: `concurrent${i}@test.com`,
        parentTimezone: 'America/New_York',
        slotStartUtc: slotStart,
      })
    );

    const results = await Promise.all(promises);

    const successes = results.filter((r) => r.status === 201);
    const conflicts = results.filter((r) => r.status === 409);

    // With 3 mentors and 1 slot: at most 3 can succeed
    // (each mentor can take this slot once)
    expect(successes.length).toBeLessThanOrEqual(3);
    expect(successes.length).toBeGreaterThanOrEqual(1);
    expect(successes.length + conflicts.length).toBe(25);

    // Verify no mentor has this slot double-booked
    const confirmedBookings = await Booking.find({
      slotStartUtc: new Date(slotStart),
      status: 'CONFIRMED',
    }).lean();

    const mentorIds = confirmedBookings.map((b) => b.mentorId.toString());
    const uniqueMentors = new Set(mentorIds);
    expect(uniqueMentors.size).toBe(confirmedBookings.length); // No duplicates

    // Verify no mentor exceeds 2 bookings per day
    const dailyLoads = await MentorDailyLoad.find({}).lean();
    for (const load of dailyLoads) {
      expect(load.count).toBeLessThanOrEqual(2);
    }
  }, 30000);

  it('handles 25 parallel requests across same mentor-day — no mentor exceeds 2', async () => {
    // 25 different slots on the same day (01:00 to 13:00 UTC = 06:30 to 18:30 IST, all same IST date)
    const baseTime = getClock()
      .now()
      .plus({ days: 6 })
      .set({ hour: 1, minute: 0, second: 0, millisecond: 0 });

    const promises = Array.from({ length: 25 }, (_, i) =>
      request.post('/api/bookings').send({
        parentName: `Day Race Parent ${i}`,
        parentEmail: `dayrace${i}@test.com`,
        parentTimezone: 'America/New_York',
        slotStartUtc: baseTime.plus({ minutes: i * 30 }).toISO()!,
      })
    );

    const results = await Promise.all(promises);

    const successes = results.filter((r) => r.status === 201);

    // 3 mentors × 2 per day = 6 max
    expect(successes.length).toBeLessThanOrEqual(6);
    expect(successes.length).toBeGreaterThanOrEqual(1);

    // Verify the hard constraint: no mentor > 2 per day
    const dailyLoads = await MentorDailyLoad.find({}).lean();
    for (const load of dailyLoads) {
      expect(load.count).toBeLessThanOrEqual(2);
    }

    // Cross-check with actual bookings
    const mentors = await Mentor.find({}).lean();
    for (const mentor of mentors) {
      const bookingCount = await Booking.countDocuments({
        mentorId: mentor._id,
        status: 'CONFIRMED',
      });
      expect(bookingCount).toBeLessThanOrEqual(2);
    }
  }, 30000);
});

describe('Backend Edge Cases (Assignment Specification)', () => {
  it('counts a US evening slot falling on next IST calendar date against mentor IST date, not parent date', async () => {
    // Parent in America/New_York (EDT, UTC-4).
    // Parent evening: 2026-10-18 at 21:00 EDT = 2026-10-19 01:00:00 UTC = 2026-10-19 06:30:00 IST (+05:30)
    // Parent local date: 2026-10-18. Mentor local date: 2026-10-19.
    const eveningSlotUtc = '2026-10-19T01:00:00.000Z';

    const res = await request.post('/api/bookings').send({
      parentName: 'Evening Parent',
      parentEmail: 'evening@test.com',
      parentTimezone: 'America/New_York',
      slotStartUtc: eveningSlotUtc,
    });

    expect(res.status).toBe(201);
    expect(res.body.booking.mentorLocalDate).toBe('2026-10-19');

    // Verify MentorDailyLoad record is stored under mentor IST date '2026-10-19', NOT '2026-10-18'
    const istLoad = await MentorDailyLoad.findOne({ mentorLocalDate: '2026-10-19' });
    expect(istLoad).toBeDefined();
    expect(istLoad!.count).toBe(1);

    const parentDateLoad = await MentorDailyLoad.findOne({ mentorLocalDate: '2026-10-18' });
    expect(parentDateLoad).toBeNull();
  });

  it('skips a mentor with 2 bookings on one IST date, but that mentor is still available the next IST date', async () => {
    // Use Mentor A alone
    const mentors = await Mentor.find({}).lean();
    const mentorA = mentors[0];
    // Deactivate all others so only mentor A is considered
    await Mentor.updateMany({ _id: { $ne: mentorA._id } }, { $set: { isActive: false } });

    const day1Slot1 = '2026-10-18T10:00:00.000Z'; // 15:30 IST on 2026-10-18
    const day1Slot2 = '2026-10-18T10:30:00.000Z';
    const day1Slot3 = '2026-10-18T11:00:00.000Z';
    const day2Slot = '2026-10-19T10:00:00.000Z'; // 15:30 IST on 2026-10-19

    // Book 2 slots on day 1
    const res1 = await request.post('/api/bookings').send({
      parentName: 'P1',
      parentEmail: 'p1@test.com',
      parentTimezone: 'America/New_York',
      slotStartUtc: day1Slot1,
    });
    expect(res1.status).toBe(201);

    const res2 = await request.post('/api/bookings').send({
      parentName: 'P2',
      parentEmail: 'p2@test.com',
      parentTimezone: 'America/New_York',
      slotStartUtc: day1Slot2,
    });
    expect(res2.status).toBe(201);

    // 3rd booking on day 1 fails because mentor A has 2 bookings on that IST date
    const res3 = await request.post('/api/bookings').send({
      parentName: 'P3',
      parentEmail: 'p3@test.com',
      parentTimezone: 'America/New_York',
      slotStartUtc: day1Slot3,
    });
    expect(res3.status).toBe(409);
    expect(res3.body.error.code).toBe('SLOT_UNAVAILABLE');

    // Booking on day 2 SUCCEEDS with mentor A
    const res4 = await request.post('/api/bookings').send({
      parentName: 'P4',
      parentEmail: 'p4@test.com',
      parentTimezone: 'America/New_York',
      slotStartUtc: day2Slot,
    });
    expect(res4.status).toBe(201);
    expect(res4.body.booking.mentor.name).toBe(mentorA.name);
  });

  it('returns 409 SLOT_UNAVAILABLE with a non-empty alternatives array sorted by closeness when all 10 mentors are booked', async () => {
    // Clear and insert all 10 mentors
    await Mentor.deleteMany({});
    const tenMentors = Array.from({ length: 10 }, (_, i) => ({
      name: `Mentor ${i + 1}`,
      email: `mentor${i + 1}@codeyoung.in`,
      timezone: 'Asia/Kolkata',
      workingWindows: [{ startLocal: '00:00', endLocal: '23:59' }],
      bio: `Mentor bio ${i + 1}`,
      isActive: true,
    }));
    await Mentor.insertMany(tenMentors);

    const targetSlot = '2026-10-18T14:00:00.000Z';

    // Book all 10 mentors for targetSlot
    for (let i = 0; i < 10; i++) {
      const res = await request.post('/api/bookings').send({
        parentName: `Parent ${i}`,
        parentEmail: `parent${i}@example.com`,
        parentTimezone: 'America/New_York',
        slotStartUtc: targetSlot,
      });
      expect(res.status).toBe(201);
    }

    // 11th booking attempt for same slot
    const fullRes = await request.post('/api/bookings').send({
      parentName: 'Parent 11',
      parentEmail: 'parent11@example.com',
      parentTimezone: 'America/New_York',
      slotStartUtc: targetSlot,
    });

    expect(fullRes.status).toBe(409);
    expect(fullRes.body.error.code).toBe('SLOT_UNAVAILABLE');

    const alternatives = fullRes.body.error.alternatives || fullRes.body.error.details?.alternatives;
    expect(Array.isArray(alternatives)).toBe(true);
    expect(alternatives.length).toBeGreaterThan(0);

    // Verify alternatives are sorted by closeness to targetSlot
    const targetMs = new Date(targetSlot).getTime();
    for (let i = 0; i < alternatives.length - 1; i++) {
      const distA = Math.abs(new Date(alternatives[i].slotStartUtc).getTime() - targetMs);
      const distB = Math.abs(new Date(alternatives[i + 1].slotStartUtc).getTime() - targetMs);
      expect(distA).toBeLessThanOrEqual(distB);
    }
  });

  it('prevents the same parent email from booking the same slot twice with DUPLICATE_BOOKING', async () => {
    const slot = futureSlot(4, 15, 0);

    const first = await request.post('/api/bookings').send({
      parentName: 'Duplicate Test',
      parentEmail: 'duplicate.parent@example.com',
      parentTimezone: 'America/New_York',
      slotStartUtc: slot,
    });
    expect(first.status).toBe(201);

    const second = await request.post('/api/bookings').send({
      parentName: 'Duplicate Test',
      parentEmail: 'DUPLICATE.PARENT@example.com',
      parentTimezone: 'America/New_York',
      slotStartUtc: slot,
    });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('DUPLICATE_BOOKING');
  });

  it('frees both the slot and daily counter on cancel, and cancelling twice is safe (idempotent)', async () => {
    const slot = futureSlot(4, 16, 0);

    const bookRes = await request.post('/api/bookings').send({
      parentName: 'Idemp Cancel',
      parentEmail: 'cancel.idemp@example.com',
      parentTimezone: 'America/New_York',
      slotStartUtc: slot,
    });
    expect(bookRes.status).toBe(201);
    const bookingRef = bookRes.body.booking.bookingRef;
    const mentorId = bookRes.body.booking.mentor.id;
    const mentorLocalDate = bookRes.body.booking.mentorLocalDate;

    const loadBefore = await MentorDailyLoad.findOne({ mentorId, mentorLocalDate });
    expect(loadBefore!.count).toBe(1);

    // First cancel
    const cancel1 = await request.delete(`/api/bookings/${bookingRef}`);
    expect(cancel1.status).toBe(200);
    expect(cancel1.body.booking.status).toBe('CANCELLED');

    const loadAfter1 = await MentorDailyLoad.findOne({ mentorId, mentorLocalDate });
    expect(loadAfter1!.count).toBe(0);

    // Second cancel (idempotent)
    const cancel2 = await request.delete(`/api/bookings/${bookingRef}`);
    expect(cancel2.status).toBe(200);
    expect(cancel2.body.booking.status).toBe('CANCELLED');

    const loadAfter2 = await MentorDailyLoad.findOne({ mentorId, mentorLocalDate });
    expect(loadAfter2!.count).toBe(0); // Did not go negative
  });

  it('returns proper error codes: SLOT_IN_PAST for past slots, TOO_SOON for <2h lead time, VALIDATION_ERROR for invalid IANA timezone', async () => {
    // 1. Past slot
    const pastSlot = getClock().now().minus({ hours: 3 }).toUTC().toISO()!;
    const pastRes = await request.post('/api/bookings').send({
      parentName: 'Past Parent',
      parentEmail: 'past@test.com',
      parentTimezone: 'America/New_York',
      slotStartUtc: pastSlot,
    });
    expect(pastRes.status).toBe(400);
    expect(pastRes.body.error.code).toBe('SLOT_IN_PAST');

    // 2. Too soon (1 hour lead time < 2 hours)
    const soonSlot = getClock().now().plus({ hours: 1 }).toUTC().toISO()!;
    const soonRes = await request.post('/api/bookings').send({
      parentName: 'Soon Parent',
      parentEmail: 'soon@test.com',
      parentTimezone: 'America/New_York',
      slotStartUtc: soonSlot,
    });
    expect(soonRes.status).toBe(400);
    expect(soonRes.body.error.code).toBe('TOO_SOON');

    // 3. Invalid IANA timezone
    const validFutureSlot = futureSlot(3, 15, 0);
    const tzRes = await request.post('/api/bookings').send({
      parentName: 'Invalid TZ Parent',
      parentEmail: 'badtz@test.com',
      parentTimezone: 'Mars/Curiosity_Rover',
      slotStartUtc: validFutureSlot,
    });
    expect(tzRes.status).toBe(400);
    expect(tzRes.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('writes 2 notifications to outbox: parent gets local time with zone abbreviation, mentor gets IST time', async () => {
    // Relative slot 3 days ahead at 14:00 UTC (9:00 AM EST or 10:00 AM EDT, 7:30 PM IST)
    const slot = futureSlot(3, 14, 0);

    const bookRes = await request.post('/api/bookings').send({
      parentName: 'Notification Parent',
      parentEmail: 'outbox.parent@test.com',
      parentTimezone: 'America/New_York',
      slotStartUtc: slot,
    });
    expect(bookRes.status).toBe(201);
    const bookingRef = bookRes.body.booking.bookingRef;

    const outboxNotes = await Notification.find({
      'payload.bookingRef': bookingRef,
    }).lean();

    expect(outboxNotes.length).toBe(2);

    const parentNote = outboxNotes.find((n) => n.recipient === 'outbox.parent@test.com');
    expect(parentNote).toBeDefined();
    expect(parentNote!.type).toBe('BOOKING_CONFIRMED');
    expect((parentNote!.payload as any).parentLocalTime).toMatch(/(EDT|EST)/);

    const mentorNote = outboxNotes.find((n) => n.recipient !== 'outbox.parent@test.com');
    expect(mentorNote).toBeDefined();
    expect(mentorNote!.type).toBe('NEW_BOOKING_MENTOR');
    expect((mentorNote!.payload as any).mentorLocalTime).toMatch(/IST/);
  });

  it('formats parentLocalTime and notification payload with BST for London and IST (Ireland) for Dublin in summer', async () => {
    const summerNow = DateTime.fromISO('2026-07-10T10:00:00.000Z');
    setClock(new FixedClock(summerNow));

    const slotLondon = '2026-07-14T14:00:00.000Z';
    const londonRes = await request.post('/api/bookings').send({
      parentName: 'London Parent',
      parentEmail: 'london.parent@test.com',
      parentTimezone: 'Europe/London',
      slotStartUtc: slotLondon,
    });
    expect(londonRes.status).toBe(201);
    expect(londonRes.body.booking.parentLocalTime).toContain('BST');

    const londonNotes = await Notification.find({
      recipient: 'london.parent@test.com',
    }).lean();
    expect(londonNotes.length).toBe(1);
    expect((londonNotes[0].payload as any).parentLocalTime).toContain('BST');

    const slotDublin = '2026-07-14T14:30:00.000Z';
    const dublinRes = await request.post('/api/bookings').send({
      parentName: 'Dublin Parent',
      parentEmail: 'dublin.parent@test.com',
      parentTimezone: 'Europe/Dublin',
      slotStartUtc: slotDublin,
    });
    expect(dublinRes.status).toBe(201);
    expect(dublinRes.body.booking.parentLocalTime).toContain('IST (Ireland)');

    const dublinNotes = await Notification.find({
      recipient: 'dublin.parent@test.com',
    }).lean();
    expect(dublinNotes.length).toBe(1);
    expect((dublinNotes[0].payload as any).parentLocalTime).toContain('IST (Ireland)');
  });

  it('ensures slots endpoint and booking endpoint agree when a slot is outside all mentor working windows (no availability and no booking)', async () => {
    // Seed the 10 mentors: 4 work 15:00-00:00 IST, 3 work 20:00-05:00 IST, 3 work 22:00-08:00 IST
    await Mentor.deleteMany({});
    const realMentors = [
      ...Array.from({ length: 4 }, (_, i) => ({
        name: `Day Mentor ${i + 1}`,
        email: `day${i + 1}@codeyoung.in`,
        timezone: 'Asia/Kolkata',
        workingWindows: [{ startLocal: '15:00', endLocal: '00:00' }],
        isActive: true,
      })),
      ...Array.from({ length: 3 }, (_, i) => ({
        name: `Night Mentor ${i + 1}`,
        email: `night${i + 1}@codeyoung.in`,
        timezone: 'Asia/Kolkata',
        workingWindows: [{ startLocal: '20:00', endLocal: '05:00' }],
        isActive: true,
      })),
      ...Array.from({ length: 3 }, (_, i) => ({
        name: `Late Mentor ${i + 1}`,
        email: `late${i + 1}@codeyoung.in`,
        timezone: 'Asia/Kolkata',
        workingWindows: [{ startLocal: '22:00', endLocal: '08:00' }],
        isActive: true,
      })),
    ];
    await Mentor.insertMany(realMentors);

    // Dynamic slot inside the 14-day window: pick date 3 days ahead at 14:30 IST.
    // 14:30 IST is outside 15:00-00:00, 20:00-05:00, and 22:00-08:00 for ALL 10 mentors!
    const targetDate = getClock().now().plus({ days: 3 }).toFormat('yyyy-MM-dd');
    const targetSlotUtc = DateTime.fromISO(targetDate, { zone: 'America/New_York' })
      .setZone('Asia/Kolkata')
      .set({ hour: 14, minute: 30, second: 0, millisecond: 0 })
      .toUTC()
      .toISO()!;

    // 1. GET /api/slots endpoint check: slot is NOT offered / not available
    const slotsRes = await request.get(`/api/slots?date=${targetDate}&tz=America/New_York`);
    expect(slotsRes.status).toBe(200);
    const slot = slotsRes.body.slots.find(
      (s: any) => new Date(s.startUtc).getTime() === new Date(targetSlotUtc).getTime()
    );
    expect(slot?.available).toBeFalsy();

    // 2. POST /api/bookings endpoint check: booking MUST be rejected with 409
    const bookRes = await request.post('/api/bookings').send({
      parentName: 'Early Parent',
      parentEmail: 'early@example.com',
      parentTimezone: 'America/New_York',
      slotStartUtc: targetSlotUtc,
    });
    expect(bookRes.status).toBe(409);
    expect(bookRes.body.error.code).toBe('SLOT_UNAVAILABLE');
    expect(bookRes.body.error.message).toMatch(/No mentors are available at this time/i);
  });

  it('rejects a slot beyond the 14-day bookable horizon in BOTH the slots endpoint and POST /api/bookings (relative to clock)', async () => {
    // Dynamically calculate 24 days ahead (beyond the 14-day horizon) relative to current clock
    const futureDate = getClock().now().plus({ days: 24 }).toFormat('yyyy-MM-dd');
    const futureSlotUtc = getClock().now().plus({ days: 24 }).set({ hour: 15, minute: 0, second: 0, millisecond: 0 }).toUTC().toISO()!;

    // 1. GET /api/slots MUST reject with 400 VALIDATION_ERROR
    const slotsRes = await request.get(`/api/slots?date=${futureDate}&tz=America/New_York`);
    expect(slotsRes.status).toBe(400);
    expect(slotsRes.body.error.code).toBe('VALIDATION_ERROR');
    expect(slotsRes.body.error.message).toMatch(/within the next 14 days/i);

    // 2. POST /api/bookings MUST reject with 400 VALIDATION_ERROR
    const bookRes = await request.post('/api/bookings').send({
      parentName: 'Far Future Parent',
      parentEmail: 'farfuture@example.com',
      parentTimezone: 'America/New_York',
      slotStartUtc: futureSlotUtc,
    });
    expect(bookRes.status).toBe(400);
    expect(bookRes.body.error.code).toBe('VALIDATION_ERROR');
    expect(bookRes.body.error.message).toMatch(/within the next 14 days/i);
  });

  it('generates bookingRef in CY-XXXXXXXX format with uppercase letters and digits only, excluding I, O, 0, and 1', async () => {
    // 1. Unit check: test 1,000 generated booking refs
    for (let i = 0; i < 1000; i++) {
      const ref = generateBookingRef();
      expect(ref).toMatch(BOOKING_REF_REGEX);
      expect(ref).not.toMatch(/[IO01]/);
      expect(ref.length).toBe(11); // "CY-" (3) + 8 chars = 11
    }

    // 2. Integration check: verify booking endpoint returns conforming reference
    const slot = futureSlot(3, 16, 0);
    const bookRes = await request.post('/api/bookings').send({
      parentName: 'Ref Format Parent',
      parentEmail: 'ref.parent@example.com',
      parentTimezone: 'America/New_York',
      slotStartUtc: slot,
    });
    expect(bookRes.status).toBe(201);
    const ref = bookRes.body.booking.bookingRef;
    expect(ref).toMatch(BOOKING_REF_REGEX);
    expect(ref).not.toMatch(/[IO01]/);
  });

  it('ensures alternatives on a 409 never include slots beyond the 14-day horizon or inside the 2-hour lead time', async () => {
    // Satiate all 10 mentors on day 13 (edge of 14-day horizon)
    await Mentor.deleteMany({});
    const tenMentors = Array.from({ length: 10 }, (_, i) => ({
      name: `Mentor ${i + 1}`,
      email: `mentor${i + 1}@codeyoung.in`,
      timezone: 'Asia/Kolkata',
      workingWindows: [{ startLocal: '00:00', endLocal: '23:59' }],
      isActive: true,
    }));
    await Mentor.insertMany(tenMentors);

    // Target slot on day 13 (near horizon boundary)
    const boundarySlot = futureSlot(13, 16, 0);
    for (let i = 0; i < 10; i++) {
      await request.post('/api/bookings').send({
        parentName: `Parent Edge ${i}`,
        parentEmail: `parent.edge${i}@example.com`,
        parentTimezone: 'America/New_York',
        slotStartUtc: boundarySlot,
      });
    }

    // 11th booking creates 409 conflict
    const conflictRes = await request.post('/api/bookings').send({
      parentName: 'Conflict Parent',
      parentEmail: 'conflict@example.com',
      parentTimezone: 'America/New_York',
      slotStartUtc: boundarySlot,
    });

    expect(conflictRes.status).toBe(409);
    expect(conflictRes.body.error.code).toBe('SLOT_UNAVAILABLE');
    const alternatives = conflictRes.body.error.alternatives;
    expect(alternatives.length).toBeGreaterThan(0);

    const now = getClock().now();
    for (const alt of alternatives) {
      const altUtc = DateTime.fromISO(alt.slotStartUtc);
      // Constraint 1: Must be at least 2 hours from now
      expect(altUtc.diff(now, 'hours').hours).toBeGreaterThanOrEqual(2);

      // Constraint 2: Must be within 14-day bookable window
      const parentDate = altUtc.setZone('America/New_York').toFormat('yyyy-MM-dd');
      const nowDate = now.setZone('America/New_York').toFormat('yyyy-MM-dd');
      const daysDiff = DateTime.fromISO(parentDate).diff(DateTime.fromISO(nowDate), 'days').days;
      expect(daysDiff).toBeLessThanOrEqual(14);
      expect(daysDiff).toBeGreaterThanOrEqual(0);
    }
  });
});

