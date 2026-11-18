import { prisma } from '../../config/prisma';
import { NotFoundError, BusinessRuleError } from '../../shared/errors/app-error';
import { getAccountBalance } from './savings.repository';
import { transfer } from './savings.service';
import { recordRepayment } from '../loans/loans.service';

export async function createStandingInstruction(input: {
  sourceAccountId: string;
  destinationType: 'savings_account' | 'loan_repayment';
  targetAccountId?: string;
  targetLoanId?: string;
  amount: number;
  frequency: 'daily' | 'weekly' | 'monthly';
  startDate?: string | Date;
}, recordedBy: string) {
  if (input.amount <= 0) throw new BusinessRuleError('Instruction amount must be greater than zero');

  const sourceAccount = await prisma.savingsAccount.findUnique({
    where: { id: input.sourceAccountId },
  });
  if (!sourceAccount) throw new NotFoundError('Source Savings Account');

  if (input.destinationType === 'savings_account') {
    if (!input.targetAccountId) throw new BusinessRuleError('Target Savings Account is required');
    if (input.targetAccountId === input.sourceAccountId) throw new BusinessRuleError('Source and Target accounts cannot be identical');
    const targetAccount = await prisma.savingsAccount.findUnique({ where: { id: input.targetAccountId } });
    if (!targetAccount) throw new NotFoundError('Target Savings Account');
  } else if (input.destinationType === 'loan_repayment') {
    if (!input.targetLoanId) throw new BusinessRuleError('Target Loan is required');
    const targetLoan = await prisma.loan.findUnique({ where: { id: input.targetLoanId } });
    if (!targetLoan) throw new NotFoundError('Target Loan');
  }

  const nextRunDate = input.startDate ? new Date(input.startDate) : new Date();

  return prisma.standingInstruction.create({
    data: {
      sourceAccountId: input.sourceAccountId,
      destinationType: input.destinationType,
      targetAccountId: input.targetAccountId || null,
      targetLoanId: input.targetLoanId || null,
      amount: input.amount,
      frequency: input.frequency,
      nextRunDate,
      status: 'active',
    },
    include: {
      sourceAccount: { include: { member: { select: { fullName: true } } } },
      targetAccount: { include: { member: { select: { fullName: true } } } },
      targetLoan: { include: { member: { select: { fullName: true } } } },
    }
  });
}

export async function listStandingInstructions(memberId?: string) {
  return prisma.standingInstruction.findMany({
    where: memberId ? { sourceAccount: { memberId } } : undefined,
    include: {
      sourceAccount: { select: { accountNumber: true, member: { select: { fullName: true, memberCode: true } } } },
      targetAccount: { select: { accountNumber: true, member: { select: { fullName: true, memberCode: true } } } },
      targetLoan: { select: { id: true, outstanding: true, member: { select: { fullName: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function updateInstructionStatus(id: string, status: 'active' | 'paused' | 'failed' | 'completed') {
  const existing = await prisma.standingInstruction.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Standing Instruction');

  return prisma.standingInstruction.update({
    where: { id },
    data: { status }
  });
}

export async function deleteStandingInstruction(id: string) {
  const existing = await prisma.standingInstruction.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Standing Instruction');

  return prisma.standingInstruction.delete({ where: { id } });
}

/**
 * Sweeps and executes all active standing instructions due for execution (nextRunDate <= TODAY)
 */
export async function executeDueStandingInstructions(systemUserId?: string) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const adminUser = systemUserId || (await prisma.user.findFirst({ select: { id: true } }))?.id || 'system';

  const dueInstructions = await prisma.standingInstruction.findMany({
    where: {
      status: 'active',
      nextRunDate: { lte: today },
    },
    include: {
      sourceAccount: true,
      targetAccount: true,
      targetLoan: true,
    }
  });

  let executedCount = 0;
  let failedCount = 0;

  for (const inst of dueInstructions) {
    try {
      const balance = await getAccountBalance(inst.sourceAccountId);
      const amount = Number(inst.amount);

      if (balance < amount) {
        await prisma.standingInstruction.update({
          where: { id: inst.id },
          data: { failureReason: 'Insufficient balance in source savings account', lastRunAt: now }
        });
        failedCount++;
        continue;
      }

      if (inst.destinationType === 'savings_account' && inst.targetAccountId) {
        await transfer({
          fromAccountId: inst.sourceAccountId,
          toAccountId: inst.targetAccountId,
          amount,
          reasonCode: 'standing_instruction_sweep',
        }, adminUser);
      } else if (inst.destinationType === 'loan_repayment' && inst.targetLoanId) {
        // Record repayment from savings sweep
        await recordRepayment({
          loanId: inst.targetLoanId,
          amount,
          paidDate: now,
          focalAgentId: inst.sourceAccount.memberId ? null : null,
        }, adminUser);
      }

      // Compute next run date based on frequency
      const nextRun = new Date(inst.nextRunDate);
      if (inst.frequency === 'daily') nextRun.setDate(nextRun.getDate() + 1);
      else if (inst.frequency === 'weekly') nextRun.setDate(nextRun.getDate() + 7);
      else if (inst.frequency === 'monthly') nextRun.setMonth(nextRun.getMonth() + 1);

      await prisma.standingInstruction.update({
        where: { id: inst.id },
        data: {
          nextRunDate: nextRun,
          lastRunAt: now,
          failureReason: null,
        }
      });

      executedCount++;
    } catch (err: any) {
      await prisma.standingInstruction.update({
        where: { id: inst.id },
        data: { failureReason: err.message || 'Sweep execution error', lastRunAt: now }
      });
      failedCount++;
    }
  }

  return { executedCount, failedCount, totalDue: dueInstructions.length };
}
