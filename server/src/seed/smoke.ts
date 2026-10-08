process.env.NODE_ENV = 'test';

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { DateTime } from 'luxon';
import { createApp } from '../app.js';
import { Mentor } from '../models/index.js';
import { setClock, FixedClock } from '../utils/clock.js';
import http from 'http';

const MENTOR_DATA = Array.from({ length: 10 }, (_, i) => ({
  name: `Mentor ${i + 1}`,
  email: `mentor${i + 1}@codeyoung.in`,
  timezone: 'Asia/Kolkata',
  workingWindows: [{ startLocal: '00:00', endLocal: '23:59' }],
  bio: `Mentor ${i + 1} bio`,
  isActive: true,
}));

async function run() {
  console.log('=== STARTING SEEDED SMOKE TEST SERVER ===');
  
  // 1. Pinned Clock: 2026-10-25 so that 2026-11-01 is within 7 days (inside 14-day horizon)
  const pinnedNow = DateTime.fromISO('2026-10-25T10:00:00.000Z', { zone: 'utc' });
  setClock(new FixedClock(pinnedNow));

  const mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  console.log('Connected to In-Memory MongoDB at', mongoServer.getUri());

  // 2. Seed Mentors
  await Mentor.deleteMany({});
  await Mentor.insertMany(MENTOR_DATA);
  console.log('Seeded 10 active mentors.');

  // 3. Start Express server on 3001
  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(3001, () => resolve()));
  console.log('Express API listening on http://localhost:3001');

  async function callApi(method: string, path: string, body?: unknown) {
    const res = await fetch(`http://localhost:3001${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data: data as any };
  }

  console.log('\n--- 1. CURL SMOKE TEST: Slots for America/New_York on 2026-11-01 (Fall-back Day) ---');
  console.log('curl -X GET "http://localhost:3001/api/slots?date=2026-11-01&tz=America/New_York"');
  const slotsRes = await callApi('GET', '/api/slots?date=2026-11-01&tz=America/New_York');
  console.log(`Status: ${slotsRes.status}`);
  console.log(`Total slots returned: ${slotsRes.data.slots?.length}`);
  const fallBackSlots = slotsRes.data.slots?.filter((s: any) => s.localStart.includes('1:30 AM'));
  console.log('1:30 AM slots found (distinct EDT vs EST):', fallBackSlots?.map((s: any) => ({ startUtc: s.startUtc, localStart: s.localStart, tzAbbr: s.tzAbbr })));

  console.log('\n--- 2. CURL SMOKE TEST: Booking a slot ---');
  const targetSlot = slotsRes.data.slots[10].startUtc;
  console.log(`curl -X POST "http://localhost:3001/api/bookings" -d '{"parentName":"Alice Smith","parentEmail":"alice@test.com","parentTimezone":"America/New_York","slotStartUtc":"${targetSlot}"}'`);
  const bookRes = await callApi('POST', '/api/bookings', {
    parentName: 'Alice Smith',
    parentEmail: 'alice@test.com',
    parentTimezone: 'America/New_York',
    slotStartUtc: targetSlot,
  });
  console.log(`Status: ${bookRes.status}`);
  console.log(`Booking Ref: ${bookRes.data.booking?.bookingRef}`);
  console.log(`Parent Time: ${bookRes.data.booking?.parentLocalTime}`);
  console.log(`Mentor Time: ${bookRes.data.booking?.mentorLocalTime}`);
  console.log(`Mentor Assigned: ${bookRes.data.booking?.mentor?.name}`);
  const bookingRef = bookRes.data.booking?.bookingRef;

  console.log('\n--- 3. CURL SMOKE TEST: Duplicate Booking ---');
  console.log(`curl -X POST "http://localhost:3001/api/bookings" -d '{"parentName":"Alice Smith","parentEmail":"alice@test.com","parentTimezone":"America/New_York","slotStartUtc":"${targetSlot}"}'`);
  const dupeRes = await callApi('POST', '/api/bookings', {
    parentName: 'Alice Smith',
    parentEmail: 'alice@test.com',
    parentTimezone: 'America/New_York',
    slotStartUtc: targetSlot,
  });
  console.log(`Status: ${dupeRes.status}`);
  console.log(`Error Code: ${dupeRes.data.error?.code}`);
  console.log(`Error Message: ${dupeRes.data.error?.message}`);

  console.log('\n--- 4. CURL SMOKE TEST: Booking for a Full Slot (All 10 mentors booked) ---');
  // Book the remaining 9 mentors on this slot
  for (let i = 1; i <= 9; i++) {
    await callApi('POST', '/api/bookings', {
      parentName: `Parent ${i}`,
      parentEmail: `parent${i}@test.com`,
      parentTimezone: 'America/New_York',
      slotStartUtc: targetSlot,
    });
  }
  console.log(`All 10 mentors booked for slot ${targetSlot}. Attempting 11th booking...`);
  console.log(`curl -X POST "http://localhost:3001/api/bookings" -d '{"parentName":"Overflow Parent","parentEmail":"overflow@test.com","parentTimezone":"America/New_York","slotStartUtc":"${targetSlot}"}'`);
  const fullRes = await callApi('POST', '/api/bookings', {
    parentName: 'Overflow Parent',
    parentEmail: 'overflow@test.com',
    parentTimezone: 'America/New_York',
    slotStartUtc: targetSlot,
  });
  console.log(`Status: ${fullRes.status}`);
  console.log(`Error Code: ${fullRes.data.error?.code}`);
  console.log(`Alternatives count: ${fullRes.data.error?.alternatives?.length}`);
  console.log(`Top alternative:`, fullRes.data.error?.alternatives?.[0]);

  console.log('\n--- 5. CURL SMOKE TEST: Cancellation ---');
  console.log(`curl -X DELETE "http://localhost:3001/api/bookings/${bookingRef}"`);
  const cancelRes = await callApi('DELETE', `/api/bookings/${bookingRef}`);
  console.log(`Status: ${cancelRes.status}`);
  console.log(`Cancelled Booking Ref: ${cancelRes.data.booking?.bookingRef}`);
  console.log(`Status: ${cancelRes.data.booking?.status}`);

  console.log('\n--- 6. CURL SMOKE TEST: Idempotent Cancellation ---');
  console.log(`curl -X DELETE "http://localhost:3001/api/bookings/${bookingRef}" (Second Time)`);
  const cancel2Res = await callApi('DELETE', `/api/bookings/${bookingRef}`);
  console.log(`Status: ${cancel2Res.status}`);
  console.log(`Status: ${cancel2Res.data.booking?.status}`);

  console.log('\n=== SMOKE TESTS COMPLETED SUCCESSFULLY ===');
  server.close();
  await mongoose.disconnect();
  await mongoServer.stop();
  process.exit(0);
}

run().catch((err) => {
  console.error('Smoke test runner failed:', err);
  process.exit(1);
});
