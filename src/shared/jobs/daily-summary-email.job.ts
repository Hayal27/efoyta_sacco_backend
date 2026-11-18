import { Worker, Queue } from 'bullmq';
import { redis } from '../../config/redis';

export const dailySummaryQueue = new Queue('daily-summary-email', { connection: redis });
dailySummaryQueue.on('error', () => {});

/**
 * Daily Summary Email Job
 * Scheduled at 08:00 AM daily (cron: '0 8 * * *').
 * Sends a daily operations summary to admin users.
 *
 * TODO (Phase 3): Implement summary query + Nodemailer dispatch.
 */
export const dailySummaryWorker = new Worker(
  'daily-summary-email',
  async (job) => {
    console.info(`[daily-summary-email] Running job ${job.id}`);
    // TODO: Query yesterday's totals (deposits, repayments, new members)
    // TODO: Format and send email via nodemailer to all admin users
  },
  { connection: redis },
);
dailySummaryWorker.on('error', () => {});
