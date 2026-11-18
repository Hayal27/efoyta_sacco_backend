import { Worker, Queue } from 'bullmq';
import { redis } from '../../config/redis';
import { prisma } from '../../config/prisma';
import { daysBetween } from '@coop/utils';

export const loanClassifierQueue = new Queue('loan-classifier', { connection: redis });
loanClassifierQueue.on('error', () => {});

/**
 * Asset Quality & Provisioning Classifier Batch Runner
 * Evaluates active loans daily, updates Days Past Due (DPD), asset quality category,
 * calculates required loan loss provisioning (1%, 5%, 20%, 50%, 100%), and flags NPL status.
 */
export async function runAssetQualityClassificationBatch() {
  console.info('[loan-classifier] Starting asset quality & provisioning batch scan...');
  const today = new Date();

  const activeLoans = await prisma.loan.findMany({
    where: {
      status: { in: ['active', 'defaulted'] },
    },
    select: {
      id: true,
      dueDate: true,
      outstanding: true,
      principal: true,
      status: true,
    },
  });

  let reclassifiedCount = 0;
  let totalProvisioningCalculated = 0;

  for (const loan of activeLoans) {
    if (!loan.dueDate) continue;

    const dpd = Math.max(0, daysBetween(loan.dueDate, today));
    const outstanding = Number(loan.outstanding);

    let assetQuality = 'pass';
    let provisionRate = 0.01; // 1% for performing loans

    if (dpd > 180) {
      assetQuality = 'loss';
      provisionRate = 1.00; // 100% loss provision
    } else if (dpd > 90) {
      assetQuality = 'doubtful';
      provisionRate = 0.50; // 50% provision
    } else if (dpd > 60) {
      assetQuality = 'substandard';
      provisionRate = 0.20; // 20% provision
    } else if (dpd > 30) {
      assetQuality = 'special_mention';
      provisionRate = 0.05; // 5% provision
    }

    const provisionAmount = parseFloat((outstanding * provisionRate).toFixed(2));
    const newStatus = dpd > 90 ? 'defaulted' : loan.status;

    await prisma.loan.update({
      where: { id: loan.id },
      data: {
        daysPastDue: dpd,
        assetQuality,
        provisionAmount,
        status: newStatus,
      },
    });

    reclassifiedCount++;
    totalProvisioningCalculated += provisionAmount;
  }

  console.info(
    `[loan-classifier] Asset classification complete. Scanned: ${reclassifiedCount}, Total Provisions: ETB ${totalProvisioningCalculated.toFixed(2)}`
  );

  return {
    scannedCount: activeLoans.length,
    reclassifiedCount,
    totalProvisioningCalculated,
  };
}

export const loanClassifierWorker = new Worker(
  'loan-classifier',
  async (job) => {
    console.info(`[loan-classifier] Running BullMQ job ${job.id}`);
    await runAssetQualityClassificationBatch();
  },
  { connection: redis }
);
loanClassifierWorker.on('error', () => {});
