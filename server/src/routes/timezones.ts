import { Router } from 'express';
import { SUGGESTED_TIMEZONES } from '../domain/index.js';

export const timezonesRouter = Router();

export const SUGGESTED_TIMEZONE_GROUPS = [
  {
    group: 'North America (US & Canada)',
    zones: [
      { id: 'America/New_York', label: 'US Eastern (New York, Atlanta, Miami)', offset: 'UTC-4 / UTC-5', region: 'US' },
      { id: 'America/Chicago', label: 'US Central (Chicago, Dallas, Houston)', offset: 'UTC-5 / UTC-6', region: 'US' },
      { id: 'America/Denver', label: 'US Mountain (Denver, Salt Lake City)', offset: 'UTC-6 / UTC-7', region: 'US' },
      { id: 'America/Phoenix', label: 'US Mountain - Arizona (No DST)', offset: 'UTC-7', region: 'US' },
      { id: 'America/Los_Angeles', label: 'US Pacific (Los Angeles, Seattle, SF)', offset: 'UTC-7 / UTC-8', region: 'US' },
      { id: 'America/Toronto', label: 'Canada Eastern (Toronto, Montreal)', offset: 'UTC-4 / UTC-5', region: 'CA' },
      { id: 'America/Vancouver', label: 'Canada Pacific (Vancouver)', offset: 'UTC-7 / UTC-8', region: 'CA' },
    ],
  },
  {
    group: 'Europe & United Kingdom',
    zones: [
      { id: 'Europe/London', label: 'UK (London, Edinburgh, Manchester)', offset: 'UTC+1 (BST) / UTC+0 (GMT)', region: 'UK' },
      { id: 'Europe/Dublin', label: 'Ireland (Dublin, Cork, Galway)', offset: 'UTC+1 (IST) / UTC+0 (GMT)', region: 'IE' },
      { id: 'Europe/Paris', label: 'Central European (Paris, Berlin, Amsterdam)', offset: 'UTC+2 / UTC+1', region: 'EU' },
    ],
  },
  {
    group: 'India & Asia Pacific',
    zones: [
      { id: 'Asia/Kolkata', label: 'India (IST - All Mentors Local Time)', offset: 'UTC+5:30 (Fixed)', region: 'IN' },
      { id: 'Asia/Dubai', label: 'Gulf Standard Time (Dubai, Abu Dhabi)', offset: 'UTC+4', region: 'AE' },
      { id: 'Asia/Singapore', label: 'Singapore Standard Time (SGT)', offset: 'UTC+8', region: 'SG' },
      { id: 'Australia/Sydney', label: 'Australian Eastern (Sydney, Melbourne)', offset: 'UTC+10 / UTC+11', region: 'AU' },
    ],
  },
];

timezonesRouter.get('/suggested', (_req, res) => {
  res.json({
    timezones: SUGGESTED_TIMEZONES,
    suggestedTimezones: SUGGESTED_TIMEZONE_GROUPS,
  });
});

