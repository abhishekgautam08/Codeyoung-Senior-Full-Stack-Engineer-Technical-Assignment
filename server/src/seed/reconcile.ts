/**
 * CLI Runner for mentor daily load reconciliation.
 *
 * Usage:
 *   npm run reconcile
 *   npm run reconcile -- 2026-10-18
 */

import mongoose from 'mongoose';
import { config } from '../config/index.js';
import { reconcileMentorDailyLoad } from '../services/reconciliation.js';
import { logger } from '../utils/logger.js';

async function main() {
  const targetDate = process.argv[2];

  logger.info(
    { targetDate: targetDate || 'ALL_DATES', uri: config.mongodbUri },
    'Starting MentorDailyLoad reconciliation...'
  );

  await mongoose.connect(config.mongodbUri);

  try {
    const result = await reconcileMentorDailyLoad(targetDate);
    logger.info(
      {
        reconciled: result.reconciled,
        driftsCorrected: result.driftsCorrected,
        details: result.details,
      },
      `Reconciliation complete: ${result.driftsCorrected} drift(s) corrected across ${result.reconciled} record(s).`
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  logger.error({ err }, 'Reconciliation failed');
  process.exit(1);
});
