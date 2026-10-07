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
  await mongoServer.stop();
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
