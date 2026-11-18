import path from 'path';
import fs from 'fs';
import { prisma } from '../../config/prisma';
import { NotFoundError, BadRequestError } from '../../shared/errors/app-error';
import { DividendStrategy, DividendRunStatus } from '@coop/types';
import { PrismaClient } from '@prisma/client';
import { resolveUploadDir } from '../../shared/utils/upload.utils';

function getDividendRunModel() {
  if (!(prisma as any).dividendRun) {
    globalThis.__prisma = new PrismaClient();
  }
  return (prisma as any).dividendRun;
}

function getDividendPayoutModel() {
  if (!(prisma as any).dividendPayout) {
    globalThis.__prisma = new PrismaClient();
  }
  return (prisma as any).dividendPayout;
}

export async function calculateDividends(input: {
  fiscalYear: number;
  totalPool: number;
  distributionStrategy: DividendStrategy;
}) {
  const { fiscalYear, totalPool, distributionStrategy } = input;

  if (totalPool <= 0) {
    throw new BadRequestError('Dividend total pool must be greater than zero.');
  }

  // Fetch all share accounts with member info
  const shareAccounts = await prisma.shareAccount.findMany({
    include: {
      member: true,
      txns: true
    }
  });

  const activeAccounts = shareAccounts.filter(acc => acc.balance > 0 && acc.member.status === 'active');
  if (activeAccounts.length === 0) {
    throw new BadRequestError('No active member share accounts found for dividend distribution.');
  }

  let totalSharesEligible = 0;
  let payoutsData: Array<{
    memberId: string;
    shareBalance: number;
    weightedShareBalance: number;
    payoutAmount: number;
  }> = [];

  if (distributionStrategy === 'flat_rate') {
    totalSharesEligible = activeAccounts.reduce((sum, acc) => sum + acc.balance, 0);

    payoutsData = activeAccounts.map(acc => {
      const shareRatio = acc.balance / totalSharesEligible;
      const payoutAmount = parseFloat((totalPool * shareRatio).toFixed(2));
      return {
        memberId: acc.memberId,
        shareBalance: acc.balance,
        weightedShareBalance: acc.balance,
        payoutAmount
      };
    });
  } else {
    // Time-Weighted Strategy: calculate daily holding weights across the fiscal year
    const yearStart = new Date(fiscalYear, 0, 1);
    const yearEnd = new Date(fiscalYear, 11, 31);
    const totalDaysInYear = (yearEnd.getTime() - yearStart.getTime()) / (1000 * 3600 * 24) + 1;

    let grandTotalWeightedBalance = 0;

    const weightedResults = activeAccounts.map(acc => {
      // Reconstruct daily balances during the fiscal year using txns
      let weightedBalance = 0;

      // Filter txns up to yearEnd sorted by date
      const txns = acc.txns
        .filter(t => new Date(t.txnDate) <= yearEnd)
        .sort((a, b) => new Date(a.txnDate).getTime() - new Date(b.txnDate).getTime());

      let currentBalance = 0;
      let txnIndex = 0;

      for (let day = 0; day < totalDaysInYear; day++) {
        const currentDate = new Date(yearStart.getTime() + day * 24 * 3600 * 1000);
        
        while (txnIndex < txns.length && new Date(txns[txnIndex].txnDate) <= currentDate) {
          const t = txns[txnIndex];
          if (t.type === 'purchase' || t.type === 'transfer_in') {
            currentBalance += t.shares;
          } else if (t.type === 'transfer_out') {
            currentBalance -= t.shares;
          }
          txnIndex++;
        }
        weightedBalance += Math.max(0, currentBalance);
      }

      const timeWeightedScore = weightedBalance / totalDaysInYear;
      grandTotalWeightedBalance += timeWeightedScore;

      return {
        memberId: acc.memberId,
        shareBalance: acc.balance,
        timeWeightedScore
      };
    });

    totalSharesEligible = activeAccounts.reduce((sum, acc) => sum + acc.balance, 0);

    payoutsData = weightedResults.map(item => {
      const weightRatio = grandTotalWeightedBalance > 0 ? item.timeWeightedScore / grandTotalWeightedBalance : 0;
      const payoutAmount = parseFloat((totalPool * weightRatio).toFixed(2));
      return {
        memberId: item.memberId,
        shareBalance: item.shareBalance,
        weightedShareBalance: parseFloat(item.timeWeightedScore.toFixed(4)),
        payoutAmount
      };
    });
  }

  // Create or update DividendRun record in database
  const runModel = getDividendRunModel();
  const payoutModel = getDividendPayoutModel();

  const existingRun = await runModel.findUnique({
    where: {
      fiscalYear_distributionStrategy: {
        fiscalYear,
        distributionStrategy
      }
    }
  });

  const postedRunForYear = await runModel.findFirst({
    where: { fiscalYear, status: 'posted' }
  });

  if (postedRunForYear) {
    throw new BadRequestError(`Dividends for Fiscal Year ${fiscalYear} have already been posted and finalized in the member savings ledger. Re-running computation for this fiscal year is locked.`);
  }

  if (existingRun) {
    // Delete existing draft payouts and update run
    await payoutModel.deleteMany({ where: { dividendRunId: existingRun.id } });
    
    return runModel.update({
      where: { id: existingRun.id },
      data: {
        totalPool,
        status: 'calculated',
        totalSharesEligible,
        totalDividendPaid: payoutsData.reduce((s, p) => s + p.payoutAmount, 0),
        calculatedAt: new Date(),
        payouts: {
          create: payoutsData
        }
      },
      include: {
        payouts: {
          include: { member: true }
        }
      }
    });
  }

  return runModel.create({
    data: {
      fiscalYear,
      totalPool,
      distributionStrategy,
      status: 'calculated',
      totalSharesEligible,
      totalDividendPaid: payoutsData.reduce((s, p) => s + p.payoutAmount, 0),
      calculatedAt: new Date(),
      payouts: {
        create: payoutsData
      }
    },
    include: {
      payouts: {
        include: { member: true }
      }
    }
  });
}

export async function uploadSignedSchedule(dividendRunId: string, fileName: string, fileData: string) {
  const runModel = getDividendRunModel();
  const run = await runModel.findUnique({ where: { id: dividendRunId } });
  if (!run) throw new NotFoundError('Dividend Run');

  // Save file to disk
  const uploadDir = resolveUploadDir(path.join('dividends', dividendRunId));

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const diskPath = path.join(uploadDir, safeName);
  
  const base64 = fileData.replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(base64, 'base64');
  fs.writeFileSync(diskPath, buffer);

  const docUrl = `/uploads/dividends/${dividendRunId}/${safeName}`;

  return runModel.update({
    where: { id: dividendRunId },
    data: { signedDocUrl: docUrl }
  });
}

export async function approveDividendRun(dividendRunId: string) {
  const runModel = getDividendRunModel();
  const run = await runModel.findUnique({ where: { id: dividendRunId } });
  if (!run) throw new NotFoundError('Dividend Run');

  if (!run.signedDocUrl) {
    throw new BadRequestError('Cannot approve run until the signed audit schedule is uploaded.');
  }

  if (run.status === 'posted') throw new BadRequestError('Dividend run is already posted.');

  return runModel.update({
    where: { id: dividendRunId },
    data: {
      status: 'approved',
      approvedAt: new Date()
    }
  });
}

export async function postDividendsToSavings(dividendRunId: string, recordedBy: string) {
  const runModel = getDividendRunModel();
  const payoutModel = getDividendPayoutModel();

  const run = await runModel.findUnique({
    where: { id: dividendRunId },
    include: {
      payouts: { include: { member: { include: { savingsAccounts: true } } } }
    }
  });

  if (!run) throw new NotFoundError('Dividend Run');

  if (run.status !== 'approved' && run.status !== 'posted') {
    throw new BadRequestError('Dividend run must be approved by board before posting payouts to member ledgers.');
  }

  // Find or fallback to first SavingsProduct for members who don't have an open account yet
  let defaultProduct = await prisma.savingsProduct.findFirst();
  if (!defaultProduct) {
    defaultProduct = await prisma.savingsProduct.create({
      data: {
        name: 'Regular Savings',
        type: 'voluntary',
        interestRate: 5.0,
        minBalance: 0,
      }
    });
  }

  const postResults = [];
  for (const payout of run.payouts) {
    if (payout.isPosted || payout.payoutAmount <= 0) continue;

    let savingsAcc = payout.member.savingsAccounts[0]; // Primary savings account

    // Auto-create savings account for member if they don't have one open yet
    if (!savingsAcc) {
      const accNumber = `SA-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
      savingsAcc = await prisma.savingsAccount.create({
        data: {
          accountNumber: accNumber,
          memberId: payout.memberId,
          productId: defaultProduct.id,
          branchId: payout.member.branchId,
        }
      });
    }

    if (savingsAcc) {
      const receiptNo = `DIV-${run.fiscalYear}-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
      
      await prisma.savingsTxn.create({
        data: {
          accountId: savingsAcc.id,
          type: 'deposit',
          amount: payout.payoutAmount,
          receiptNo,
          paymentMethod: 'transfer',
          txnDate: new Date(),
          reasonCode: `DIVIDEND_FY${run.fiscalYear}`,
          recordedBy
        }
      });

      await payoutModel.update({
        where: { id: payout.id },
        data: {
          isPosted: true,
          postedAt: new Date()
        }
      });
      postResults.push({ memberId: payout.memberId, amount: payout.payoutAmount, status: 'posted' });
    }
  }

  await runModel.update({
    where: { id: dividendRunId },
    data: {
      status: 'posted',
      postedAt: new Date()
    }
  });

  return { dividendRunId, totalPosted: postResults.length, payouts: postResults };
}


export async function listDividendRuns() {
  const runModel = getDividendRunModel();
  if (!runModel) return [];
  return runModel.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      payouts: {
        include: { member: true }
      }
    }
  });
}

export async function deleteDividendRun(dividendRunId: string) {
  const runModel = getDividendRunModel();
  const payoutModel = getDividendPayoutModel();

  const run = await runModel.findUnique({ where: { id: dividendRunId } });
  if (run && run.status === 'posted') {
    throw new BadRequestError('Cannot delete a dividend run that has already been posted to member savings ledgers.');
  }

  // Delete all payouts under this run first
  await payoutModel.deleteMany({
    where: { dividendRunId }
  });

  // Delete the run
  await runModel.delete({
    where: { id: dividendRunId }
  });

  return { id: dividendRunId, deleted: true };
}


/* ─────────────────────────────────────────────────────────────────────────────
   computeProfitSummary
   Aggregates all cooperative income sources for a given fiscal year from the
   actual transaction records so admin can see the real profit pool available
   to distribute as dividends.
───────────────────────────────────────────────────────────────────────────── */
export async function computeProfitSummary(fiscalYear: number, operatingExpenses: number = 0) {
  const yearStart = new Date(`${fiscalYear}-01-01T00:00:00.000Z`);
  const yearEnd   = new Date(`${fiscalYear}-12-31T23:59:59.999Z`);

  // 1. Loan Interest Income — sum of interestPortion on all repayments in the year
  const interestAgg = await prisma.repayment.aggregate({
    _sum: { interestPortion: true },
    where: {
      paidDate: { gte: yearStart, lte: yearEnd }
    }
  });
  const loanInterestIncome = Number(interestAgg._sum.interestPortion || 0);

  // 2. Loan Service Fees & Insurance — from loans disbursed in the year (totalFees)
  const loansAgg = await prisma.loan.aggregate({
    _sum: { totalFees: true, bookFee: true },
    where: {
      status: { in: ['active', 'closed'] },
      disbursedDate: { gte: yearStart, lte: yearEnd }
    }
  });
  const serviceAndInsuranceFees = Number(loansAgg._sum.totalFees || 0);
  const bookFeeIncome           = Number(loansAgg._sum.bookFee   || 0);

  // 3. Member Registration Fees — from members who joined in the year
  const registrationAgg = await prisma.member.aggregate({
    _sum: { registrationFee: true },
    where: {
      joinDate: { gte: yearStart, lte: yearEnd }
    }
  });
  const registrationFeeIncome = Number(registrationAgg._sum.registrationFee || 0);

  // 4. Share Capital Inflow — total share purchases in year (Equity)
  const sharePurchasesAgg = await prisma.shareTxn.aggregate({
    _sum: { totalAmount: true },
    where: {
      type: 'purchase',
      txnDate: { gte: yearStart, lte: yearEnd }
    }
  });
  const shareCapitalIncome = Number(sharePurchasesAgg._sum.totalAmount || 0);

  // Gross Operational Revenue (Revenue generated from operations)
  const grossRevenue = loanInterestIncome + serviceAndInsuranceFees + bookFeeIncome + registrationFeeIncome;

  // Net Operational Surplus (Net Profit) = Gross Revenue - Operating Expenses (Salaries, Rent, Utilities, Admin)
  const safeExpenses = Math.max(0, Number(operatingExpenses) || 0);
  const netSurplus   = Math.max(0, grossRevenue - safeExpenses);

  // Allocation percentages calculated on NET SURPLUS (Net Profit):
  // 30% → Statutory Reserve Fund (mandatory legal reserve)
  // 10% → Social & Community Development Fund
  // 60% → Member Dividend Pool (distributable net surplus)
  const statutoryReserveFund    = parseFloat((netSurplus * 0.30).toFixed(2));
  const socialDevelopmentFund   = parseFloat((netSurplus * 0.10).toFixed(2));
  const recommendedDividendPool = parseFloat((netSurplus * 0.60).toFixed(2));

  return {
    fiscalYear,
    periodStart: yearStart.toISOString().split('T')[0],
    periodEnd:   yearEnd.toISOString().split('T')[0],
    incomeBreakdown: {
      loanInterestIncome:     parseFloat(loanInterestIncome.toFixed(2)),
      serviceAndInsuranceFees: parseFloat(serviceAndInsuranceFees.toFixed(2)),
      bookFeeIncome:          parseFloat(bookFeeIncome.toFixed(2)),
      registrationFeeIncome:  parseFloat(registrationFeeIncome.toFixed(2)),
      shareCapitalIncome:     parseFloat(shareCapitalIncome.toFixed(2)),
    },
    grossRevenue:            parseFloat(grossRevenue.toFixed(2)),
    operatingExpenses:       parseFloat(safeExpenses.toFixed(2)),
    netSurplus:              parseFloat(netSurplus.toFixed(2)),
    allocationBreakdown: {
      statutoryReserveFund,
      socialDevelopmentFund,
      recommendedDividendPool,
    },
    recommendedDividendPool,
  };
}

