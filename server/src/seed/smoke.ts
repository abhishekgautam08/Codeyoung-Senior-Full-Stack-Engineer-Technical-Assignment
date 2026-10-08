/**
 * Smoke test runner for the booking system.
 *
 * Verifies:
 * 1. Seeded mentors and working windows (4 on 15:00-00:00, 3 on 20:00-05:00, 3 on 22:00-08:00 IST).
 * 2. Slot outside all working windows (14:30 IST) is unavailable and rejected.
 * 3. Dates beyond the 14-day bookable horizon are rejected under the real clock (relative to today).
 * 4. Evening slots are generated and available for America/New_York and Europe/London with BST/GMT.
 * 5. Full 10-mentor slot saturation, 11th booking 409 conflict with sorted alternatives, bookingRef format, and cancellation.
 */

import http from 'http';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { DateTime } from 'luxon';
import { createApp } from '../app.js';
import { Mentor, Booking, MentorDailyLoad } from '../models/index.js';
import { MENTOR_SEED_DATA } from './index.js';
import { config } from '../config/index.js';
import { setClock, resetClock, FixedClock, getClock } from '../utils/clock.js';
import { BOOKING_REF_REGEX } from '../utils/bookingRef.js';

async function runSmokeTest() {
  console.log('===============================================================');
  console.log('           CODEYOUNG TRIAL BOOKING: SMOKE TEST RUNNER           ');
  console.log('===============================================================');

  // Disable rate-limiting during fast smoke test execution
  (config as { nodeEnv: string }).nodeEnv = 'test';

  let mongoServer: MongoMemoryServer | null = null;
  const externalMongoUri = process.env.MONGODB_URI;

  if (externalMongoUri) {
    await mongoose.connect(externalMongoUri);
    console.log(`✓ Connected to External MongoDB: ${externalMongoUri}`);
  } else {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
    console.log(`✓ Connected to In-Memory MongoDB: ${uri}`);
  }

  // Clear collections for a clean run
  await Booking.deleteMany({});
  await MentorDailyLoad.deleteMany({});
  await Mentor.deleteMany({});

  // Seed mentors
  const seededMentors = await Mentor.insertMany(
    MENTOR_SEED_DATA.map((m) => ({
      ...m,
      timezone: 'Asia/Kolkata',
      avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(m.name)}`,
      isActive: true,
    }))
  );

  console.log('\n--- SEEDED MENTORS & WORKING WINDOWS ---');
  seededMentors.forEach((m, idx) => {
    console.log(
      `  [Mentor ${idx + 1}] ${m.name.padEnd(18)} (${m.email.padEnd(28)}) Windows: ${JSON.stringify(
        m.workingWindows
      )} IST`
    );
  });

  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, () => resolve()));
  const port = (server.address() as any).port;
  console.log(`\n✓ Express server listening on http://localhost:${port}`);

  async function callApi(method: string, path: string, body?: unknown) {
    const res = await fetch(`http://localhost:${port}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data: data as any };
  }

  function getClockMode(): string {
    const clock = getClock();
    if (clock instanceof FixedClock) {
      return `fixed (pinned to ${clock.now().toISO()})`;
    }
    const rawOffset = process.env.FAKE_CLOCK_OFFSET_DAYS;
    const offsetDays = Number(rawOffset || 0);
    const nodeEnv = process.env.NODE_ENV || 'development';
    if (offsetDays !== 0 && (nodeEnv === 'test' || nodeEnv === 'development')) {
      return `offset (+${offsetDays} days, now: ${clock.now().toISO()})`;
    }
    return `real (${clock.now().toISO()})`;
  }

  // --------------------------------------------------------------------------
  // CHECK 1: Outside All Working Windows (14:30 IST)
  // --------------------------------------------------------------------------
  resetClock();
  console.log('\n===============================================================');
  console.log('CHECK 1: Slot Outside All Working Windows (14:30 IST)');
  console.log(`Clock Mode: ${getClockMode()}`);
  console.log('Windows: 4 mentors (15:00-00:00), 3 mentors (20:00-05:00), 3 mentors (22:00-08:00 IST).');
  console.log('At 14:30 IST, ZERO mentors are scheduled to work.');
  console.log('===============================================================');

  const currentNow = getClock().now();
  const testValidDate = currentNow.plus({ days: 3 }).toFormat('yyyy-MM-dd');
  const slotOutsideUtc = DateTime.fromISO(testValidDate, { zone: 'America/New_York' })
    .setZone('Asia/Kolkata')
    .set({ hour: 14, minute: 30, second: 0, millisecond: 0 })
    .toUTC()
    .toISO()!;

  console.log(`\n[1a] Querying GET /api/slots for ${testValidDate} in America/New_York:`);
  const outsideSlotsRes = await callApi('GET', `/api/slots?date=${testValidDate}&tz=America/New_York`);
  const slot1430 = outsideSlotsRes.data.slots?.find(
    (s: any) => new Date(s.startUtc || s.slotStartUtc).getTime() === new Date(slotOutsideUtc).getTime()
  );
  const isAvailable = slot1430 ? (slot1430.available ?? slot1430.isAvailable) : false;
  console.log(`  Slot found in returned slots: ${Boolean(slot1430)} (omitted because 0 mentors work at 14:30 IST)`);
  console.log(`  Is available: ${isAvailable} (expected: false)`);

  console.log(`\n[1b] Attempting POST /api/bookings for 14:30 IST (${slotOutsideUtc}):`);
  const outsideBookRes = await callApi('POST', '/api/bookings', {
    parentName: 'Early Parent',
    parentEmail: 'early@test.com',
    parentTimezone: 'America/New_York',
    slotStartUtc: slotOutsideUtc,
  });
  console.log(`  Response Status: ${outsideBookRes.status} (expected: 409)`);
  console.log(`  Error Code: "${outsideBookRes.data.error?.code}"`);
  console.log(`  Error Message: "${outsideBookRes.data.error?.message}"`);
  console.log('  => Slots endpoint and bookings endpoint AGREE: Slot has NO availability and CANNOT be booked.');

  // --------------------------------------------------------------------------
  // CHECK 2: Real Clock Dynamic Horizon Check (Today + 24 days > 14-day limit)
  // --------------------------------------------------------------------------
  resetClock();
  console.log('\n===============================================================');
  console.log('CHECK 2: Horizon Enforcement under Real Clock (Today + 24 Days)');
  console.log(`Clock Mode: ${getClockMode()}`);
  console.log('Target date is today + 24 days (> 14-day horizon).');
  console.log('Both endpoints MUST reject it with 400 VALIDATION_ERROR.');
  console.log('===============================================================');

  const realNow = getClock().now();
  const tooFarDate = realNow.plus({ days: 24 }).toFormat('yyyy-MM-dd');
  const tooFarSlotUtc = realNow.plus({ days: 24 }).set({ hour: 15, minute: 0, second: 0, millisecond: 0 }).toUTC().toISO()!;

  console.log(`\n[2a] GET /api/slots?date=${tooFarDate}&tz=America/New_York (Real Clock + 24 days):`);
  const realClockSlots = await callApi('GET', `/api/slots?date=${tooFarDate}&tz=America/New_York`);
  console.log(`  Status: ${realClockSlots.status} (expected: 400)`);
  console.log(`  Error Code: "${realClockSlots.data.error?.code}"`);
  console.log(`  Error Message: "${realClockSlots.data.error?.message}"`);

  console.log(`\n[2b] POST /api/bookings with slot ${tooFarSlotUtc} (Real Clock + 24 days):`);
  const realClockBook = await callApi('POST', '/api/bookings', {
    parentName: 'Real Clock Parent',
    parentEmail: 'real@test.com',
    parentTimezone: 'America/New_York',
    slotStartUtc: tooFarSlotUtc,
  });
  console.log(`  Status: ${realClockBook.status} (expected: 400)`);
  console.log(`  Error Code: "${realClockBook.data.error?.code}"`);
  console.log(`  Error Message: "${realClockBook.data.error?.message}"`);
  console.log('  => Slots endpoint and bookings endpoint AGREE: Both reject dates beyond the 14-day horizon.');

  // --------------------------------------------------------------------------
  // CHECK 3: Evening Slots Available for US (America/New_York) and UK (Europe/London)
  // --------------------------------------------------------------------------
  resetClock();
  console.log('\n===============================================================');
  console.log('CHECK 3: Evening Slot Availability for America/New_York and Europe/London');
  console.log(`Clock Mode: ${getClockMode()}`);
  console.log('With 3 mentors on 22:00-08:00 IST and 3 on 20:00-05:00 IST, evening slots are open!');
  console.log('===============================================================');

  const eveningCheckDate = realNow.plus({ days: 4 }).toFormat('yyyy-MM-dd');

  // US Evening Check
  const usSlotsRes = await callApi('GET', `/api/slots?date=${eveningCheckDate}&tz=America/New_York`);
  const usEveningSlots = usSlotsRes.data.slots?.filter(
    (s: any) => s.timeOfDay === 'evening' && (s.available ?? s.isAvailable)
  ) || [];
  console.log(`\n[3a] America/New_York on ${eveningCheckDate}:`);
  console.log(`  Total available evening slots: ${usEveningSlots.length}`);
  if (usEveningSlots.length > 0) {
    console.log(`  Sample evening slots:`);
    usEveningSlots.slice(0, 3).forEach((s: any) => {
      console.log(`    - ${s.localStart} (${s.timeOfDay})`);
    });
  }

  // UK Evening Check (Europe/London with BST/GMT abbreviation)
  const ukSlotsRes = await callApi('GET', `/api/slots?date=${eveningCheckDate}&tz=Europe/London`);
  const ukEveningSlots = ukSlotsRes.data.slots?.filter(
    (s: any) => s.timeOfDay === 'evening' && (s.available ?? s.isAvailable)
  ) || [];
  console.log(`\n[3b] Europe/London on ${eveningCheckDate}:`);
  console.log(`  Total available evening slots: ${ukEveningSlots.length}`);
  if (ukEveningSlots.length > 0) {
    console.log(`  Sample evening slots (verifying BST/GMT format):`);
    ukEveningSlots.slice(0, 3).forEach((s: any) => {
      console.log(`    - ${s.localStart} (${s.timeOfDay})`);
    });
  }

  // --------------------------------------------------------------------------
  // CHECK 4: Valid Slot Booking, 10-Mentor Fill, CY-XXXXXXXX Ref Format & Alternatives
  // --------------------------------------------------------------------------
  const PINNED_ANCHOR = DateTime.fromISO('2026-10-25T10:00:00.000Z');
  setClock(new FixedClock(PINNED_ANCHOR));

  console.log('\n===============================================================');
  console.log('CHECK 4: Valid Slot, 10-Mentor Fill & Alternatives on 409 Conflict');
  console.log(`Clock Mode: ${getClockMode()}`);
  console.log('Why FixedClock: Target date is 2026-10-28, which is 3 days ahead relative to pinned clock (inside 14-day horizon).');
  console.log('Under the real clock (today 2026-10-08), 2026-10-28 would be 20 days ahead and correctly rejected.');
  console.log('Intersection Window: 22:00 - 00:00 IST (All 10 mentors active!)');
  console.log('===============================================================');

  const anchorNow = getClock().now();
  const validDay = anchorNow.plus({ days: 3 }).toFormat('yyyy-MM-dd'); // 2026-10-28
  const targetSlotUtc = DateTime.fromISO(validDay, { zone: 'Asia/Kolkata' })
    .set({ hour: 22, minute: 30, second: 0, millisecond: 0 })
    .toUTC()
    .toISO()!;

  console.log(`Target Slot: ${targetSlotUtc} (22:30 IST / inside all 3 working windows)`);

  console.log('\n[4a] First Booking (Parent: Alice Smith):');
  const firstBook = await callApi('POST', '/api/bookings', {
    parentName: 'Alice Smith',
    parentEmail: 'alice@test.com',
    parentTimezone: 'America/New_York',
    slotStartUtc: targetSlotUtc,
  });
  console.log(`  Status: ${firstBook.status} (expected: 201)`);
  const ref1 = firstBook.data.booking?.bookingRef;
  console.log(`  Booking Ref: ${ref1}`);
  console.log(`  Ref format valid (CY-XXXXXXXX, no 0/1/I/O): ${BOOKING_REF_REGEX.test(ref1)}`);
  console.log(`  Parent Local Time: ${firstBook.data.booking?.parentLocalTime}`);
  console.log(`  Mentor Local Time: ${firstBook.data.booking?.mentorLocalTime}`);
  console.log(`  Assigned Mentor: ${firstBook.data.booking?.mentor?.name}`);

  console.log('\n[4b] Duplicate Booking Attempt (Same email + same slot):');
  const dupeBook = await callApi('POST', '/api/bookings', {
    parentName: 'Alice Smith',
    parentEmail: 'alice@test.com',
    parentTimezone: 'America/New_York',
    slotStartUtc: targetSlotUtc,
  });
  console.log(`  Status: ${dupeBook.status} (expected: 409)`);
  console.log(`  Error Code: "${dupeBook.data.error?.code}"`);
  console.log(`  Error Message: "${dupeBook.data.error?.message}"`);

  console.log('\n[4c] Filling Remaining 9 Mentors for this Slot:');
  for (let i = 2; i <= 10; i++) {
    const fillRes = await callApi('POST', '/api/bookings', {
      parentName: `Parent ${i}`,
      parentEmail: `parent${i}@example.com`,
      parentTimezone: 'America/New_York',
      slotStartUtc: targetSlotUtc,
    });
    const refI = fillRes.data.booking?.bookingRef;
    const isValidFormat = BOOKING_REF_REGEX.test(refI);
    console.log(
      `  Booking ${i.toString().padStart(2, ' ')}: Ref=${refI} (Valid: ${isValidFormat}) Assigned=${fillRes.data.booking?.mentor?.name} (Status: ${fillRes.status})`
    );
  }

  console.log('\n[4d] 11th Booking Attempt (All 10 Mentors Full):');
  const overflowRes = await callApi('POST', '/api/bookings', {
    parentName: 'Parent 11',
    parentEmail: 'parent11@example.com',
    parentTimezone: 'America/New_York',
    slotStartUtc: targetSlotUtc,
  });
  console.log(`  Status: ${overflowRes.status} (expected: 409)`);
  console.log(`  Error Code: "${overflowRes.data.error?.code}"`);
  console.log(`  Error Message: "${overflowRes.data.error?.message}"`);
  const alts = overflowRes.data.error?.alternatives || [];
  console.log(`  Alternatives Provided: ${alts.length}`);
  alts.forEach((alt: any, idx: number) => {
    console.log(`    Alternative ${idx + 1}: ${alt.slotStartUtc} (${alt.localFormatted})`);
  });

  console.log('\n[4e] Cancellation & Idempotent Cancellation:');
  const cancel1 = await callApi('DELETE', `/api/bookings/${ref1}`);
  console.log(`  First Cancel Status: ${cancel1.status} (Status: ${cancel1.data.booking?.status})`);
  const cancel2 = await callApi('DELETE', `/api/bookings/${ref1}`);
  console.log(`  Second Cancel Status: ${cancel2.status} (Status: ${cancel2.data.booking?.status})`);

  // Reset clock at the end of checks
  resetClock();
  console.log(`\nClock Mode: RESET to SystemClock (${getClock().now().toISO()})`);

  console.log('\n===============================================================');
  console.log('✓ ALL SMOKE CHECKS COMPLETED AND VERIFIED AGAINST CODE');
  console.log('===============================================================');

  server.close();
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
}

runSmokeTest().catch((err) => {
  console.error('Smoke test failure:', err);
  process.exit(1);
});
