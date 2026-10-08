import mongoose from 'mongoose';
import { Booking, MentorDailyLoad } from '../models/index.js';
import { logger } from '../utils/logger.js';

export interface ReconciliationDetail {
  mentorId: string;
  mentorLocalDate: string;
  oldCount: number;
  newCount: number;
}

export interface ReconciliationResult {
  reconciled: number;
  driftsCorrected: number;
  details: ReconciliationDetail[];
}

/**
 * Reconciles MentorDailyLoad counters with actual CONFIRMED bookings in MongoDB.
 *
 * Mitigates potential counter drift caused by unexpected server crashes
 * between counter increment and booking document creation.
 *
 * @param mentorLocalDate Optional date filter (YYYY-MM-DD in mentor's local IST).
 * If omitted, reconciles all dates present in the system.
 */
export async function reconcileMentorDailyLoad(
  mentorLocalDate?: string
): Promise<ReconciliationResult> {
  const matchFilter: Record<string, unknown> = { status: 'CONFIRMED' };
  if (mentorLocalDate) {
    matchFilter.mentorLocalDate = mentorLocalDate;
  }

  // 1. Group confirmed bookings by mentorId and mentorLocalDate
  const actualCounts = await Booking.aggregate<{
    _id: { mentorId: mongoose.Types.ObjectId; mentorLocalDate: string };
    actualCount: number;
  }>([
    { $match: matchFilter },
    {
      $group: {
        _id: {
          mentorId: '$mentorId',
          mentorLocalDate: '$mentorLocalDate',
        },
        actualCount: { $sum: 1 },
      },
    },
  ]);

  const actualMap = new Map<string, number>();
  for (const item of actualCounts) {
    const key = `${item._id.mentorId.toString()}_${item._id.mentorLocalDate}`;
    actualMap.set(key, item.actualCount);
  }

  // 2. Fetch all existing MentorDailyLoad records matching the filter
  const loadFilter: Record<string, unknown> = {};
  if (mentorLocalDate) {
    loadFilter.mentorLocalDate = mentorLocalDate;
  }
  const existingLoads = await MentorDailyLoad.find(loadFilter);

  const checkedKeys = new Set<string>();
  const details: ReconciliationDetail[] = [];
  let driftsCorrected = 0;

  // 3. Compare existing daily load records against actual booking counts
  for (const load of existingLoads) {
    const key = `${load.mentorId.toString()}_${load.mentorLocalDate}`;
    checkedKeys.add(key);
    const actual = actualMap.get(key) || 0;

    if (load.count !== actual) {
      const oldCount = load.count;
      load.count = actual;
      await load.save();
      driftsCorrected++;
      details.push({
        mentorId: load.mentorId.toString(),
        mentorLocalDate: load.mentorLocalDate,
        oldCount,
        newCount: actual,
      });
      logger.warn(
        { mentorId: load.mentorId, date: load.mentorLocalDate, oldCount, newCount: actual },
        'Reconciled drifted MentorDailyLoad counter'
      );
    }
  }

  // 4. For any actual bookings that don't have a MentorDailyLoad document yet, upsert one
  for (const item of actualCounts) {
    const key = `${item._id.mentorId.toString()}_${item._id.mentorLocalDate}`;
    if (!checkedKeys.has(key)) {
      await MentorDailyLoad.create({
        mentorId: item._id.mentorId,
        mentorLocalDate: item._id.mentorLocalDate,
        count: item.actualCount,
      });
      driftsCorrected++;
      details.push({
        mentorId: item._id.mentorId.toString(),
        mentorLocalDate: item._id.mentorLocalDate,
        oldCount: 0,
        newCount: item.actualCount,
      });
      logger.info(
        { mentorId: item._id.mentorId, date: item._id.mentorLocalDate, count: item.actualCount },
        'Created missing MentorDailyLoad record during reconciliation'
      );
    }
  }

  const totalReconciled = checkedKeys.size + (actualCounts.length - checkedKeys.size);

  return {
    reconciled: totalReconciled,
    driftsCorrected,
    details,
  };
}
