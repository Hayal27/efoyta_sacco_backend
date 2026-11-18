import { Worker, Queue } from 'bullmq';
import { redis } from '../../config/redis';
import { executeDueStandingInstructions } from '../../modules/savings/standing-instructions.service';

export const standingInstructionsQueue = new Queue('standing-instructions', { connection: redis });
standingInstructionsQueue.on('error', () => {});

/**
 * Standing Instructions Sweep Job
 * Runs daily to process due recurring sweeps (loan payments, automated savings transfers).
 */
export const standingInstructionsWorker = new Worker(
  'standing-instructions',
  async (job) => {
    console.info(`[standing-instructions] Running sweep job ${job.id}`);
    const res = await executeDueStandingInstructions();
    console.info(`[standing-instructions] Executed ${res.executedCount} of ${res.totalDue} standing instructions (failed: ${res.failedCount})`);
  },
  { connection: redis },
);
standingInstructionsWorker.on('error', () => {});
