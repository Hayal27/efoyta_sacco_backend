import { Worker, Queue } from 'bullmq';
import { redis } from '../../config/redis';
import { prisma } from '../../config/prisma';
import { eventBus } from '../events/event-bus';
import { daysBetween } from '@coop/utils';

export const overdueCheckQueue = new Queue('overdue-check', { connection: redis });
overdueCheckQueue.on('error', () => {});

/**
 * Overdue Loan Check Job
 * Runs daily (cron: '0 6 * * *') — 6:00 AM.
 * Finds loans past due date and emits loan.overdue events at 7/14/30-day thresholds.
 */
export const overdueCheckWorker = new Worker(
  'overdue-check',
  async (job) => {
    console.info(`[overdue-check] Running job ${job.id}`);
    const today = new Date();

    const overdueLoans = await prisma.loan.findMany({
      where: {
        status: 'active',
        dueDate: { lt: today },
      },
      select: { id: true, memberId: true, dueDate: true },
    });

    const THRESHOLDS = [7, 14, 30];

    for (const loan of overdueLoans) {
      if (!loan.dueDate) continue;
      const daysOverdue = daysBetween(loan.dueDate, today);

      if (THRESHOLDS.includes(daysOverdue)) {
        eventBus.emit({
          type: 'loan.overdue',
          payload: { loanId: loan.id, memberId: loan.memberId, daysOverdue },
        });
      }
    }

    console.info(`[overdue-check] Checked ${overdueLoans.length} overdue loans`);
  },
  { connection: redis },
);
overdueCheckWorker.on('error', () => {});
