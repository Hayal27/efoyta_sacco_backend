import { Worker, Queue } from 'bullmq';
import { redis } from '../../config/redis';
import { prisma } from '../../config/prisma';
import { generateReceiptNo } from '../../shared/utils/receipt.utils';

export const interestCapitalizationQueue = new Queue('interest-capitalization', { connection: redis });
interestCapitalizationQueue.on('error', () => {});

/**
 * Periodic Capitalization Engine
 * Batches and posts accumulated accrued interest to savings accounts.
 */
export async function runInterestCapitalizationBatch(systemUserId?: string) {
  const adminUser = systemUserId || (await prisma.user.findFirst({ select: { id: true } }))?.id || 'system';

  const uncapitalizedAccounts = await prisma.accruedInterest.groupBy({
    by: ['accountId'],
    where: { isCapitalized: false },
    _sum: { dailyInterest: true },
    _count: { id: true },
  });

  let capitalizedCount = 0;
  let totalAmountCapitalized = 0;

  for (const group of uncapitalizedAccounts) {
    const totalRaw = Number(group._sum.dailyInterest || 0);
    const amountToPost = parseFloat(totalRaw.toFixed(2));
    if (amountToPost <= 0) continue;

    const account = await prisma.savingsAccount.findUnique({
      where: { id: group.accountId },
      select: { id: true, branchId: true }
    });
    if (!account) continue;

    const now = new Date();
    const receiptNo = generateReceiptNo();

    await prisma.$transaction(async (tx) => {
      // 1. Post interest transaction into savings account
      await tx.savingsTxn.create({
        data: {
          accountId: account.id,
          type: 'interest',
          amount: amountToPost,
          paymentMethod: 'transfer',
          txnDate: now,
          receiptNo,
          reasonCode: 'periodic_interest_capitalization',
          recordedBy: adminUser,
          branchId: account.branchId,
        }
      });

      // 2. Mark accrued entries as capitalized
      await tx.accruedInterest.updateMany({
        where: {
          accountId: account.id,
          isCapitalized: false,
        },
        data: {
          isCapitalized: true,
          capitalizedAt: now,
        }
      });
    });

    capitalizedCount++;
    totalAmountCapitalized += amountToPost;
  }

  return { capitalizedCount, totalAmountCapitalized };
}

export const interestCapitalizationWorker = new Worker(
  'interest-capitalization',
  async (job) => {
    console.info(`[interest-capitalization] Running job ${job.id}`);
    const res = await runInterestCapitalizationBatch();
    console.info(`[interest-capitalization] Capitalized ${res.capitalizedCount} accounts with total ETB ${res.totalAmountCapitalized}`);
  },
  { connection: redis },
);
interestCapitalizationWorker.on('error', () => {});
