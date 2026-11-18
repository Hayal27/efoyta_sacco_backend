import { Worker, Queue } from 'bullmq';
import { redis } from '../../config/redis';
import { prisma } from '../../config/prisma';
import { getAccountBalance } from '../../modules/savings/savings.repository';

export const interestAccrualQueue = new Queue('interest-accrual', { connection: redis });
interestAccrualQueue.on('error', () => {});

/**
 * Interest Accrual Job
 * Scheduled daily — calculates fractional daily interest exposures:
 * Daily Interest = (Current Balance * Annual Interest Rate) / (365 * 100)
 */
export async function runDailyInterestAccrual() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const accounts = await prisma.savingsAccount.findMany({
    include: { product: true },
  });

  let processedCount = 0;
  for (const account of accounts) {
    const rate = Number(account.product.interestRate || 0);
    if (rate <= 0) continue;

    const balance = await getAccountBalance(account.id);
    const minBal = Number(account.product.minBalance || 0);
    if (balance < minBal || balance <= 0) continue;

    // Fractional Daily Interest: (Balance * Rate / 100) / 365
    const dailyInterest = (balance * (rate / 100)) / 365;
    if (dailyInterest <= 0) continue;

    // Log AccruedInterest entry if not already logged today
    const existing = await prisma.accruedInterest.findFirst({
      where: {
        accountId: account.id,
        accrualDate: today,
      }
    });

    if (!existing) {
      await prisma.accruedInterest.create({
        data: {
          accountId: account.id,
          accrualDate: today,
          balance,
          annualRate: rate,
          dailyInterest,
          isCapitalized: false,
        }
      });
      processedCount++;
    }
  }
  return { processedCount, totalAccounts: accounts.length };
}

export const interestAccrualWorker = new Worker(
  'interest-accrual',
  async (job) => {
    console.info(`[interest-accrual] Running job ${job.id}`);
    const res = await runDailyInterestAccrual();
    console.info(`[interest-accrual] Processed ${res.processedCount} of ${res.totalAccounts} accounts`);
  },
  { connection: redis },
);
interestAccrualWorker.on('error', () => {});
