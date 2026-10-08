import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { Booking, MentorDailyLoad, Mentor } from '../models/index.js';
import { reconcileMentorDailyLoad } from './reconciliation.js';

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

beforeEach(async () => {
  await Booking.deleteMany({});
  await MentorDailyLoad.deleteMany({});
  await Mentor.deleteMany({});
});

describe('reconcileMentorDailyLoad', () => {
  it('detects and corrects counter drift caused by leaked counter increments', async () => {
    const mentorId1 = new mongoose.Types.ObjectId();
    const mentorId2 = new mongoose.Types.ObjectId();
    const mentorId3 = new mongoose.Types.ObjectId();
    const testDate = '2026-10-18';

    // 1. Mentor 1: has 1 CONFIRMED booking, but daily load leaked to count: 3
    await Booking.create({
      bookingRef: 'CY-TEST001',
      parentName: 'Test Parent',
      parentEmail: 'test@example.com',
      parentTimezone: 'America/New_York',
      slotStartUtc: new Date('2026-10-18T14:00:00.000Z'),
      slotEndUtc: new Date('2026-10-18T14:30:00.000Z'),
      mentorId: mentorId1,
      mentorLocalDate: testDate,
      meetingLink: 'https://meet.codeyoung.demo/test-1',
      status: 'CONFIRMED',
    });

    await MentorDailyLoad.create({
      mentorId: mentorId1,
      mentorLocalDate: testDate,
      count: 3, // Drift! Should be 1
    });

    // 2. Mentor 2: has 0 bookings, but daily load document exists with count: 2 (e.g. crash after inc)
    await MentorDailyLoad.create({
      mentorId: mentorId2,
      mentorLocalDate: testDate,
      count: 2, // Drift! Should be 0
    });

    // 3. Mentor 3: has 1 CONFIRMED booking, but missing MentorDailyLoad document completely
    await Booking.create({
      bookingRef: 'CY-TEST002',
      parentName: 'Test Parent 2',
      parentEmail: 'test2@example.com',
      parentTimezone: 'America/New_York',
      slotStartUtc: new Date('2026-10-18T15:00:00.000Z'),
      slotEndUtc: new Date('2026-10-18T15:30:00.000Z'),
      mentorId: mentorId3,
      mentorLocalDate: testDate,
      meetingLink: 'https://meet.codeyoung.demo/test-2',
      status: 'CONFIRMED',
    });

    // Run reconciliation for testDate
    const result = await reconcileMentorDailyLoad(testDate);

    expect(result.driftsCorrected).toBe(3);

    // Verify Mentor 1 corrected to 1
    const load1 = await MentorDailyLoad.findOne({ mentorId: mentorId1, mentorLocalDate: testDate });
    expect(load1).toBeDefined();
    expect(load1!.count).toBe(1);

    // Verify Mentor 2 corrected to 0
    const load2 = await MentorDailyLoad.findOne({ mentorId: mentorId2, mentorLocalDate: testDate });
    expect(load2).toBeDefined();
    expect(load2!.count).toBe(0);

    // Verify Mentor 3 created with count 1
    const load3 = await MentorDailyLoad.findOne({ mentorId: mentorId3, mentorLocalDate: testDate });
    expect(load3).toBeDefined();
    expect(load3!.count).toBe(1);

    // Running a second time should detect 0 drifts (idempotent)
    const secondRun = await reconcileMentorDailyLoad(testDate);
    expect(secondRun.driftsCorrected).toBe(0);
  });

  it('ignores CANCELLED bookings when reconciling', async () => {
    const mentorId = new mongoose.Types.ObjectId();
    const testDate = '2026-10-19';

    // 1 CONFIRMED, 1 CANCELLED booking
    await Booking.create({
      bookingRef: 'CY-TEST003',
      parentName: 'Confirmed Parent',
      parentEmail: 'conf@example.com',
      parentTimezone: 'America/New_York',
      slotStartUtc: new Date('2026-10-19T14:00:00.000Z'),
      slotEndUtc: new Date('2026-10-19T14:30:00.000Z'),
      mentorId,
      mentorLocalDate: testDate,
      meetingLink: 'https://meet.codeyoung.demo/test-3',
      status: 'CONFIRMED',
    });

    await Booking.create({
      bookingRef: 'CY-TEST004',
      parentName: 'Cancelled Parent',
      parentEmail: 'canc@example.com',
      parentTimezone: 'America/New_York',
      slotStartUtc: new Date('2026-10-19T14:30:00.000Z'),
      slotEndUtc: new Date('2026-10-19T15:00:00.000Z'),
      mentorId,
      mentorLocalDate: testDate,
      meetingLink: 'https://meet.codeyoung.demo/test-4',
      status: 'CANCELLED',
    });

    // Daily load incorrectly set to 2
    await MentorDailyLoad.create({
      mentorId,
      mentorLocalDate: testDate,
      count: 2,
    });

    const result = await reconcileMentorDailyLoad(testDate);
    expect(result.driftsCorrected).toBe(1);

    const load = await MentorDailyLoad.findOne({ mentorId, mentorLocalDate: testDate });
    expect(load!.count).toBe(1); // Only counts CONFIRMED
  });
});
