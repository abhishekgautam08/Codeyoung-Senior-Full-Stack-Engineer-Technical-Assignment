/**
 * Seed script: creates 10 mentors and optionally ~20 demo bookings.
 *
 * Usage:
 *   npm run seed        # mentors only (idempotent)
 *   npm run seed:demo   # mentors + sample bookings
 *
 * Idempotent: uses email as the unique key, upserts mentors.
 */

import mongoose from 'mongoose';
import { DateTime } from 'luxon';
import { nanoid } from 'nanoid';
import { config } from '../config/index.js';
import { Mentor, Booking, MentorDailyLoad, Notification } from '../models/index.js';
import { getMentorLocalDate } from '../domain/slots.js';
import { logger } from '../utils/logger.js';

export const MENTOR_SEED_DATA = [
  // 6 mentors: 15:00–00:00 IST (covers US morning / UK evening)
  {
    name: 'Aarav Sharma',
    email: 'aarav.sharma@codeyoung.in',
    bio: 'Full-stack developer with 5+ years of experience in React, Node.js, and Python. Loves teaching kids to code!',
    workingWindows: [{ startLocal: '15:00', endLocal: '00:00' }],
  },
  {
    name: 'Priya Patel',
    email: 'priya.patel@codeyoung.in',
    bio: 'CS graduate from IIT Delhi. Passionate about making complex concepts simple for young learners.',
    workingWindows: [{ startLocal: '15:00', endLocal: '00:00' }],
  },
  {
    name: 'Rohan Gupta',
    email: 'rohan.gupta@codeyoung.in',
    bio: 'Game developer turned educator. Teaches coding through fun projects and interactive challenges.',
    workingWindows: [{ startLocal: '15:00', endLocal: '00:00' }],
  },
  {
    name: 'Ananya Iyer',
    email: 'ananya.iyer@codeyoung.in',
    bio: 'Data science enthusiast who brings creativity to every coding lesson. Expert in Python and Scratch.',
    workingWindows: [{ startLocal: '15:00', endLocal: '00:00' }],
  },
  {
    name: 'Vikram Reddy',
    email: 'vikram.reddy@codeyoung.in',
    bio: 'Former software engineer at a top startup. Specializes in web development and app design.',
    workingWindows: [{ startLocal: '15:00', endLocal: '00:00' }],
  },
  {
    name: 'Neha Krishnan',
    email: 'neha.krishnan@codeyoung.in',
    bio: 'Award-winning coding instructor with a talent for inspiring young minds to build amazing projects.',
    workingWindows: [{ startLocal: '15:00', endLocal: '00:00' }],
  },

  // 4 mentors: 20:00–05:00 IST (covers US evening/night)
  {
    name: 'Arjun Nair',
    email: 'arjun.nair@codeyoung.in',
    bio: 'Night owl coder and mentor. Expert in JavaScript, robotics, and competitive programming.',
    workingWindows: [{ startLocal: '20:00', endLocal: '05:00' }],
  },
  {
    name: 'Kavya Deshmukh',
    email: 'kavya.deshmukh@codeyoung.in',
    bio: 'Full-stack developer passionate about AI and machine learning. Makes learning fun and accessible.',
    workingWindows: [{ startLocal: '20:00', endLocal: '05:00' }],
  },
  {
    name: 'Siddharth Joshi',
    email: 'siddharth.joshi@codeyoung.in',
    bio: 'Mobile app developer who loves creating interactive learning experiences for young coders.',
    workingWindows: [{ startLocal: '20:00', endLocal: '05:00' }],
  },
  {
    name: 'Divya Menon',
    email: 'divya.menon@codeyoung.in',
    bio: 'Cybersecurity researcher and coding mentor. Teaches responsible coding practices from day one.',
    workingWindows: [{ startLocal: '20:00', endLocal: '05:00' }],
  },
];

function generateAvatarUrl(name: string): string {
  const encoded = encodeURIComponent(name);
  return `https://api.dicebear.com/9.x/initials/svg?seed=${encoded}&backgroundColor=6366f1,8b5cf6,a855f7,ec4899,f43f5e&backgroundType=gradientLinear`;
}

async function seedMentors() {
  const mentorDocs = [];
  for (const data of MENTOR_SEED_DATA) {
    const mentor = await Mentor.findOneAndUpdate(
      { email: data.email },
      {
        $set: {
          name: data.name,
          bio: data.bio,
          workingWindows: data.workingWindows,
          timezone: 'Asia/Kolkata',
          avatarUrl: generateAvatarUrl(data.name),
          isActive: true,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    mentorDocs.push(mentor);
    logger.info(`✓ Mentor: ${mentor.name} (${mentor.email})`);
  }
  return mentorDocs;
}

async function seedDemoBookings(mentors: any[]) {
  // Clear existing demo data
  await Booking.deleteMany({});
  await MentorDailyLoad.deleteMany({});
  await Notification.deleteMany({});

  const parentNames = [
    'Sarah Johnson', 'Michael Chen', 'Emily Williams', 'David Brown',
    'Jessica Garcia', 'Christopher Lee', 'Amanda Wilson', 'Daniel Martinez',
    'Laura Anderson', 'Robert Taylor', 'Jennifer Thomas', 'James Jackson',
    'Maria White', 'William Harris', 'Elizabeth Clark', 'John Lewis',
    'Patricia Robinson', 'Richard Walker', 'Linda Hall', 'Joseph Allen',
  ];

  const parentTimezones = [
    'America/New_York', 'America/Chicago', 'America/Denver',
    'America/Los_Angeles', 'Europe/London', 'Europe/Dublin',
  ];

  let bookingsCreated = 0;
  const now = DateTime.utc();

  // Spread bookings across the next 7 days
  for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
    const day = now.plus({ days: dayOffset });

    // 2-4 bookings per day
    const bookingsForDay = 2 + Math.floor(Math.random() * 3);

    for (let b = 0; b < bookingsForDay && bookingsCreated < 20; b++) {
      const mentor = mentors[bookingsCreated % mentors.length];

      // Pick a slot during mentor's working hours
      const window = mentor.workingWindows[0];
      const [startH] = window.startLocal.split(':').map(Number);
      const slotHour = startH + Math.floor(Math.random() * 4);
      const slotMinute = Math.random() > 0.5 ? 30 : 0;

      const slotStartMentorLocal = day.setZone('Asia/Kolkata').set({
        hour: slotHour,
        minute: slotMinute,
        second: 0,
        millisecond: 0,
      });

      const slotStartUtc = slotStartMentorLocal.toUTC();
      const slotEndUtc = slotStartUtc.plus({ minutes: config.slotDurationMinutes });
      const mentorLocalDate = getMentorLocalDate(slotStartUtc.toJSDate(), 'Asia/Kolkata');
      const parentTz = parentTimezones[bookingsCreated % parentTimezones.length];
      const parentName = parentNames[bookingsCreated];
      const bookingRef = `CY-${nanoid(8).toUpperCase()}`;

      try {
        await Booking.create({
          bookingRef,
          parentName,
          parentEmail: `${parentName.toLowerCase().replace(' ', '.')}@example.com`,
          parentTimezone: parentTz,
          childName: `${parentName.split(' ')[0]}'s child`,
          slotStartUtc: slotStartUtc.toJSDate(),
          slotEndUtc: slotEndUtc.toJSDate(),
          mentorId: mentor._id,
          mentorLocalDate,
          meetingLink: `https://meet.codeyoung.demo/trial/${bookingRef}-${nanoid(6)}`,
          status: 'CONFIRMED',
        });

        // Update the daily load counter
        await MentorDailyLoad.findOneAndUpdate(
          { mentorId: mentor._id, mentorLocalDate },
          { $inc: { count: 1 } },
          { upsert: true }
        );

        bookingsCreated++;
        logger.info(`  ✓ Booking: ${parentName} with ${mentor.name} on ${mentorLocalDate}`);
      } catch (err: unknown) {
        // Skip duplicate key errors silently (idempotency)
        if (err instanceof Error && 'code' in err && (err as { code: number }).code === 11000) {
          continue;
        }
        throw err;
      }
    }
  }

  logger.info(`\n✓ Created ${bookingsCreated} demo bookings`);
}

async function main() {
  const isDemo = process.argv.includes('--demo');

  logger.info('🌱 Seeding database...');
  logger.info(`   MongoDB: ${config.mongodbUri}`);
  logger.info(`   Mode: ${isDemo ? 'mentors + demo bookings' : 'mentors only'}`);

  await mongoose.connect(config.mongodbUri);
  logger.info('   Connected to MongoDB\n');

  const mentors = await seedMentors();
  logger.info(`\n✓ Seeded ${mentors.length} mentors`);

  if (isDemo) {
    logger.info('\n📋 Creating demo bookings...\n');
    await seedDemoBookings(mentors);
  }

  await mongoose.disconnect();
  logger.info('\n✅ Seed complete!');
}

const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('seed/index.ts') || process.argv[1]?.replace(/\\/g, '/').endsWith('seed/index.js');
if (isMain) {
  main().catch((err) => {
    logger.error(err, 'Seed failed');
    process.exit(1);
  });
}
