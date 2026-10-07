import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/codeyoung-trial-booking',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  // Booking configuration
  slotDurationMinutes: parseInt(process.env.SLOT_DURATION_MINUTES || '30', 10),
  slotIntervalMinutes: parseInt(process.env.SLOT_INTERVAL_MINUTES || '30', 10),
  maxBookingsPerMentorPerDay: parseInt(process.env.MAX_BOOKINGS_PER_MENTOR_PER_DAY || '2', 10),
  minLeadTimeHours: parseInt(process.env.MIN_LEAD_TIME_HOURS || '2', 10),
  bookableWindowDays: parseInt(process.env.BOOKABLE_WINDOW_DAYS || '14', 10),

  // Rate limiting
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '10', 10),
} as const;

export type Config = typeof config;
