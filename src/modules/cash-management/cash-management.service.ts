import { BusinessRuleError, NotFoundError, ForbiddenError, BadRequestError } from '../../shared/errors/app-error';
import { prisma } from '../../config/prisma';
import { cashManagementRepo } from './cash-management.repository';
import { accountingRepo } from '../accounting/accounting.repository';
import {
  DenominationItem,
  OpenTillSessionInput,
  CloseTillSessionInput,
  CreateTransferInput,
  BankMovementInput,
  VaultDailyCheckInput,
  ResolveVarianceInput,
} from './cash-management.types';
import { Prisma } from '@prisma/client';

// ─── Constants & GL Account Codes ─────────────────────────────────────────────
export const GL_CODES = {
  VAULT: '1011',       // Cash in Vault
  TILL: '1012',        // Cash in Till
  BANK: '1020',        // Bank Account - CBE
  OVERAGE: '4040',     // Cash Over/Short Income (Revenue)
  SHORTAGE: '5050',    // Cash Over/Short Expense (Expense)
};

export const STANDARD_DENOMINATIONS = [200, 100, 50, 10, 5, 1, 0.5, 0.25];

// ─── Initialization & Seeding ────────────────────────────────────────────────
export async function ensureCashManagementGLAccounts() {
  const accountsToEnsure = [
    { code: GL_CODES.VAULT, name: 'Cash in Vault', type: 'asset' as const, parentCode: '1000', description: 'Branch Vault Cash Reserves' },
    { code: GL_CODES.TILL, name: 'Cash in Till', type: 'asset' as const, parentCode: '1000', description: 'Teller Drawer Operating Cash' },
    { code: GL_CODES.BANK, name: 'Bank Account - CBE', type: 'asset' as const, parentCode: '1000', description: 'Commercial Bank of Ethiopia' },
    { code: GL_CODES.OVERAGE, name: 'Cash Over/Short Income', type: 'revenue' as const, parentCode: '4000', description: 'Till Session Cash Overage Income' },
    { code: GL_CODES.SHORTAGE, name: 'Cash Over/Short Expense', type: 'expense' as const, parentCode: '5000', description: 'Till Session Cash Shortage Expense' },
  ];

  for (const acc of accountsToEnsure) {
    const existing = await accountingRepo.findGLAccountByCode(acc.code);
    if (!existing) {
      let parentId: string | undefined;
      if (acc.parentCode) {
        const parent = await accountingRepo.findGLAccountByCode(acc.parentCode);
        if (parent) parentId = parent.id;
      }
      await accountingRepo.createGLAccount({
        code: acc.code,
        name: acc.name,
        type: acc.type,
        parentId,
        isHeader: false,
        description: acc.description,
      });
    }
  }
}

export async function ensureVaultForBranch(branchId: string) {
  await ensureCashManagementGLAccounts();
  let vault = await cashManagementRepo.findVaultByBranch(branchId);
  if (!vault) {
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) throw new NotFoundError('Branch');

    const vaultGl = await accountingRepo.findGLAccountByCode(GL_CODES.VAULT);
    vault = await cashManagementRepo.createVault({
      name: `${branch.name} Vault`,
      code: `VLT-${branch.code.replace(/\s+/g, '')}`,
      branch: { connect: { id: branchId } },
      glAccount: vaultGl ? { connect: { id: vaultGl.id } } : undefined,
      balance: new Prisma.Decimal(0),
      maxLimit: new Prisma.Decimal(2000000), // Default 2,000,000 ETB
      status: 'open',
    }) as any;
  }
  return vault;
}

export async function ensureTillForUser(userId: string, branchId: string) {
  await ensureCashManagementGLAccounts();
  const vault = await ensureVaultForBranch(branchId);
  let till = await cashManagementRepo.findTillByUserAndBranch(userId, branchId);
  if (!till) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User');

    const tillGl = await accountingRepo.findGLAccountByCode(GL_CODES.TILL);
    const tillCode = `TILL-${user.fullName ? user.fullName.slice(0, 3).toUpperCase() : 'TEL'}-${Date.now().toString().slice(-4)}`;
    
    till = await cashManagementRepo.createTill({
      name: `${user.fullName || user.email}'s Till`,
      code: tillCode,
      user: { connect: { id: userId } },
      vault: { connect: { id: vault.id } },
      branch: { connect: { id: branchId } },
      glAccount: tillGl ? { connect: { id: tillGl.id } } : undefined,
      balance: new Prisma.Decimal(0),
      maxLimit: new Prisma.Decimal(250000), // Default 250,000 ETB
      isActive: true,
    }) as any;
  }
  return till;
}

// ─── GL Journal Helper ───────────────────────────────────────────────────────
async function postDoubleEntryJournal(params: {
  description: string;
  reference: string;
  postedById: string;
  debitAccountCode: string;
  creditAccountCode: string;
  amount: number;
}) {
  const debitAcc = await accountingRepo.findGLAccountByCode(params.debitAccountCode);
  const creditAcc = await accountingRepo.findGLAccountByCode(params.creditAccountCode);

  if (!debitAcc || !creditAcc) {
    console.warn(`GL Account missing for journal: ${params.debitAccountCode} or ${params.creditAccountCode}`);
    return null;
  }

  const entryNumber = `JE-CASH-${Date.now().toString().slice(-8)}`;
  return accountingRepo.createJournalEntry({
    entryNumber,
    entryDate: new Date(),
    description: params.description,
    reference: params.reference,
    postedById: params.postedById,
    lines: [
      {
        glAccountId: debitAcc.id,
        debit: params.amount,
        credit: 0,
        memo: params.description,
      },
      {
        glAccountId: creditAcc.id,
        debit: 0,
        credit: params.amount,
        memo: params.description,
      },
    ],
  });
}

// ─── Overview & Dashboard ────────────────────────────────────────────────────
export async function getCashDashboardOverview(branchId: string) {
  const vault = await ensureVaultForBranch(branchId);
  const tills = await cashManagementRepo.findAllTills(branchId);

  const totalVaultBalance = Number(vault.balance);
  const totalTillsBalance = tills.reduce((sum, t) => sum + Number(t.balance), 0);
  const totalCashOnHand = totalVaultBalance + totalTillsBalance;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const pendingTransfersCount = await cashManagementRepo.countPendingTransfers(branchId);

  const todayTransfers = await prisma.cashTransfer.findMany({
    where: { branchId, createdAt: { gte: today } },
  });

  const todayVariances = await prisma.cashVariance.findMany({
    where: {
      createdAt: { gte: today },
      OR: [{ session: { branchId } }, { vaultCheck: { branchId } }],
    },
  });

  const totalVariancesAmount = todayVariances.reduce((acc, v) => acc + Number(v.amount), 0);

  return {
    vault: {
      id: vault.id,
      name: vault.name,
      code: vault.code,
      balance: totalVaultBalance,
      maxLimit: Number(vault.maxLimit),
      status: vault.status,
      isExceeded: totalVaultBalance > Number(vault.maxLimit),
    },
    totalCashOnHand,
    totalVaultBalance,
    totalTillsBalance,
    activeTillsCount: tills.filter((t) => t.sessions && t.sessions.length > 0).length,
    totalTillsCount: tills.length,
    pendingTransfersCount,
    todayTransfersCount: todayTransfers.length,
    todayTransfersVolume: todayTransfers.filter((t) => t.status === 'completed').reduce((sum, t) => sum + Number(t.amount), 0),
    todayVariancesCount: todayVariances.length,
    todayVariancesAmount: totalVariancesAmount,
    tills: tills.map((t) => ({
      id: t.id,
      name: t.name,
      code: t.code,
      tellerName: t.user.fullName || t.user.email,
      tellerEmail: t.user.email,
      balance: Number(t.balance),
      maxLimit: Number(t.maxLimit),
      isExceeded: Number(t.balance) > Number(t.maxLimit),
      isOpen: t.sessions && t.sessions.length > 0,
      activeSessionId: t.sessions?.[0]?.id || null,
      sessionOpenedAt: t.sessions?.[0]?.openedAt || null,
    })),
  };
}

// ─── Till Session Operations ─────────────────────────────────────────────────
export async function getActiveTillSession(userId: string) {
  const session = await cashManagementRepo.findActiveSessionByUser(userId);
  if (!session) return null;

  const today = new Date(session.openedAt);
  today.setHours(0, 0, 0, 0);

  // Compute live movements since session opened
  const [transfersIn, transfersOut, savingsTxns, repayments, sharesTxns] = await Promise.all([
    // Transfers into till
    prisma.cashTransfer.findMany({
      where: { toTillId: session.tillId, status: 'completed', createdAt: { gte: session.openedAt } },
    }),
    // Transfers out of till
    prisma.cashTransfer.findMany({
      where: { fromTillId: session.tillId, status: 'completed', createdAt: { gte: session.openedAt } },
    }),
    // Savings cash deposits/withdrawals by this teller
    prisma.savingsTxn.findMany({
      where: { recordedBy: userId, txnDate: { gte: session.openedAt }, paymentMethod: 'cash' },
    }),
    // Repayments in cash by this teller
    prisma.repayment.findMany({
      where: { recordedBy: userId, paidDate: { gte: session.openedAt } },
    }),
    // Share purchases in cash by this teller
    prisma.shareTxn.findMany({
      where: { recordedBy: userId, txnDate: { gte: session.openedAt }, paymentMethod: 'cash', type: 'purchase' },
    }),
  ]);

  const totalTransfersIn = transfersIn.reduce((sum, t) => sum + Number(t.amount), 0);
  const totalTransfersOut = transfersOut.reduce((sum, t) => sum + Number(t.amount), 0);

  const totalSavingsDeposits = savingsTxns.filter((s) => s.type === 'deposit').reduce((sum, s) => sum + Number(s.amount), 0);
  const totalSavingsWithdrawals = savingsTxns.filter((s) => s.type === 'withdrawal').reduce((sum, s) => sum + Number(s.amount), 0);
  const totalLoanRepayments = repayments.reduce((sum, r) => sum + Number(r.amount), 0);
  const totalSharePurchases = sharesTxns.reduce((sum, s) => sum + Number(s.totalAmount), 0);

  const totalCashCollected = totalSavingsDeposits + totalLoanRepayments + totalSharePurchases;
  const totalCashDisbursed = totalSavingsWithdrawals;

  const computedExpected = Number(session.openingBalance) + totalTransfersIn + totalCashCollected - totalTransfersOut - totalCashDisbursed;

  return {
    ...session,
    till: {
      ...session.till,
      balance: Number(session.till.balance),
      maxLimit: Number(session.till.maxLimit),
    },
    openingBalance: Number(session.openingBalance),
    expectedClose: computedExpected,
    metrics: {
      totalTransfersIn,
      totalTransfersOut,
      totalSavingsDeposits,
      totalSavingsWithdrawals,
      totalLoanRepayments,
      totalSharePurchases,
      totalCashCollected,
      totalCashDisbursed,
    },
  };
}

export async function openTillSession(userId: string, input: OpenTillSessionInput) {
  const existing = await cashManagementRepo.findActiveSessionByUser(userId);
  if (existing) {
    throw new BusinessRuleError('You already have an active open till session. Please close it before opening a new one.');
  }

  const till = await ensureTillForUser(userId, input.branchId);

  // Compute total counted amount from denominations
  const countedAmount = (input.denominations || []).reduce((acc, item) => {
    return acc + Number(item.denomination) * Number(item.quantity);
  }, 0);

  const sessionNumber = `SES-${Date.now().toString().slice(-8)}`;

  return prisma.$transaction(async (tx) => {
    const session = await cashManagementRepo.createSession(
      {
        sessionNumber,
        till: { connect: { id: till.id } },
        user: { connect: { id: userId } },
        branch: { connect: { id: input.branchId } },
        openingBalance: new Prisma.Decimal(countedAmount),
        expectedClose: new Prisma.Decimal(countedAmount),
        status: 'open',
        notes: input.notes,
      },
      tx,
    );

    // Save opening denominations
    if (input.denominations && input.denominations.length > 0) {
      await cashManagementRepo.createDenominationCounts(
        'till_open',
        session.id,
        input.denominations,
        { tillSessionId: session.id },
        tx,
      );
    }

    // Update till current balance to counted amount
    await cashManagementRepo.updateTillBalance(till.id, new Prisma.Decimal(countedAmount), tx);

    return session;
  });
}

export async function closeTillSession(userId: string, sessionId: string, input: CloseTillSessionInput) {
  const session = await cashManagementRepo.findSessionById(sessionId);
  if (!session) throw new NotFoundError('Till Session');
  if (session.status === 'closed') {
    throw new BusinessRuleError('This till session is already closed.');
  }
  if (session.userId !== userId) {
    throw new ForbiddenError('You can only close your own till session.');
  }

  // Business Rule: "The day cannot close if transfers are pending or unconfirmed."
  const pendingTransfers = await cashManagementRepo.countPendingTransfers(session.branchId, session.tillId);
  if (pendingTransfers > 0) {
    throw new BusinessRuleError(`Cannot close session: There are ${pendingTransfers} pending or unconfirmed transfers. Resolve them first.`);
  }

  // Calculate live expected close
  const activeDetails = await getActiveTillSession(userId);
  const expectedClose = activeDetails ? activeDetails.expectedClose : Number(session.expectedClose);

  // Calculate counted close from denominations
  const countedClose = (input.denominations || []).reduce((acc, item) => {
    return acc + Number(item.denomination) * Number(item.quantity);
  }, 0);

  const variance = countedClose - expectedClose; // positive = overage, negative = shortage

  return prisma.$transaction(async (tx) => {
    let varianceRecord = null;
    let journalEntryId: string | null = null;

    // Handle variance if non-zero
    if (Math.abs(variance) >= 0.01) {
      const isShortage = variance < 0;
      const varianceType = isShortage ? 'shortage' : 'overage';
      const absAmount = Math.abs(variance);

      // Post GL entry
      let journal = null;
      if (isShortage) {
        // Dr Cash Over/Short (expense), Cr Cash in Till
        journal = await postDoubleEntryJournal({
          description: `Till shortage on closing session ${session.sessionNumber}`,
          reference: session.sessionNumber,
          postedById: userId,
          debitAccountCode: GL_CODES.SHORTAGE,
          creditAccountCode: GL_CODES.TILL,
          amount: absAmount,
        });
      } else {
        // Dr Cash in Till, Cr Cash Over/Short (income)
        journal = await postDoubleEntryJournal({
          description: `Till overage on closing session ${session.sessionNumber}`,
          reference: session.sessionNumber,
          postedById: userId,
          debitAccountCode: GL_CODES.TILL,
          creditAccountCode: GL_CODES.OVERAGE,
          amount: absAmount,
        });
      }

      if (journal) journalEntryId = journal.id;

      varianceRecord = await cashManagementRepo.createVariance(
        {
          session: { connect: { id: session.id } },
          amount: new Prisma.Decimal(variance),
          type: varianceType,
          status: 'pending',
          reason: input.notes || (isShortage ? 'Cash Shortage at closing' : 'Cash Overage at closing'),
          journalEntryId,
        },
        tx,
      );
    }

    // Save closing denominations
    if (input.denominations && input.denominations.length > 0) {
      await cashManagementRepo.createDenominationCounts(
        'till_close',
        session.id,
        input.denominations,
        { tillSessionId: session.id },
        tx,
      );
    }

    // Update till balance to physical cash counted
    await cashManagementRepo.updateTillBalance(session.tillId, new Prisma.Decimal(countedClose), tx);

    // Update session record to closed
    const closedSession = await cashManagementRepo.updateSession(
      session.id,
      {
        expectedClose: new Prisma.Decimal(expectedClose),
        countedClose: new Prisma.Decimal(countedClose),
        variance: new Prisma.Decimal(variance),
        closedAt: new Date(),
        status: 'closed',
        notes: input.notes,
      },
      tx,
    );

    // If teller requests returning all remaining cash to the vault
    let returnTransfer = null;
    if (input.returnRemainingCashToVault && countedClose > 0) {
      const transferNumber = `TRF-RET-${Date.now().toString().slice(-8)}`;
      returnTransfer = await cashManagementRepo.createTransfer(
        {
          transferNumber,
          type: 'till_to_vault',
          fromTill: { connect: { id: session.tillId } },
          toVault: { connect: { id: session.till.vaultId } },
          amount: new Prisma.Decimal(countedClose),
          status: 'approved', // Pre-approved by teller handover, waiting head cashier confirmation
          requestedBy: { connect: { id: userId } },
          branch: { connect: { id: session.branchId } },
          notes: `Automatic till cash handover to vault at session close: ${session.sessionNumber}`,
        },
        tx,
      );
    }

    return {
      session: closedSession,
      variance: varianceRecord,
      returnTransfer,
    };
  });
}

// ─── Cash Transfers (Vault ↔ Till Workflow) ──────────────────────────────────
export async function requestCashFromVault(tellerId: string, input: CreateTransferInput) {
  if (!tellerId) {
    throw new BadRequestError('Teller user ID is required.');
  }
  if (!input?.branchId) {
    throw new BadRequestError('Branch ID is required for cash transfer.');
  }

  const till = await ensureTillForUser(tellerId, input.branchId);
  const vault = await ensureVaultForBranch(input.branchId);

  const amount = Number(input.amount);
  if (isNaN(amount) || amount <= 0) {
    throw new BusinessRuleError('Transfer amount must be greater than zero.');
  }

  // Check vault balance availability
  if (Number(vault.balance) < amount) {
    throw new BusinessRuleError(`Vault has insufficient balance. Available: ${vault.balance} ETB, Requested: ${amount} ETB.`);
  }

  const transferNumber = `TRF-ISS-${Date.now().toString().slice(-8)}`;

  return prisma.$transaction(async (tx) => {
    const transfer = await cashManagementRepo.createTransfer(
      {
        transferNumber,
        type: 'vault_to_till',
        fromVault: { connect: { id: vault.id } },
        toTill: { connect: { id: till.id } },
        amount: new Prisma.Decimal(input.amount),
        status: 'pending',
        requestedBy: { connect: { id: tellerId } },
        branch: { connect: { id: input.branchId } },
        notes: input.notes,
      },
      tx,
    );

    if (input.denominations && input.denominations.length > 0) {
      await cashManagementRepo.createDenominationCounts(
        'transfer',
        transfer.id,
        input.denominations,
        { cashTransferId: transfer.id },
        tx,
      );
    }

    return transfer;
  });
}

export async function approveVaultCashIssue(transferId: string, approverId: string) {
  const transfer = await cashManagementRepo.findTransferById(transferId);
  if (!transfer) throw new NotFoundError('Cash Transfer');
  if (transfer.status !== 'pending') {
    throw new BusinessRuleError(`Transfer is already ${transfer.status}`);
  }

  if (!transfer.fromVaultId) {
    throw new BusinessRuleError('Invalid vault transfer source.');
  }

  const vault = await cashManagementRepo.findVaultById(transfer.fromVaultId);
  if (!vault) throw new NotFoundError('Vault');

  if (Number(vault.balance) < Number(transfer.amount)) {
    throw new BusinessRuleError(`Insufficient vault balance (${vault.balance} ETB) to issue ${transfer.amount} ETB.`);
  }

  return cashManagementRepo.updateTransfer(transferId, {
    status: 'approved',
    approvedBy: { connect: { id: approverId } },
    approvedAt: new Date(),
  });
}

export async function confirmCashReceipt(transferId: string, receiverId: string) {
  const transfer = await cashManagementRepo.findTransferById(transferId);
  if (!transfer) throw new NotFoundError('Cash Transfer');
  if (transfer.status !== 'approved') {
    throw new BusinessRuleError(`Transfer must be in 'approved' status to confirm receipt. Current status: ${transfer.status}`);
  }

  const amount = Number(transfer.amount);

  return prisma.$transaction(async (tx) => {
    let journal = null;

    if (transfer.type === 'vault_to_till') {
      // 1. Vault -> Till issue confirmation by Teller
      const vault = await tx.vault.findUnique({ where: { id: transfer.fromVaultId! } });
      const till = await tx.till.findUnique({ where: { id: transfer.toTillId! } });
      if (!vault || !till) throw new NotFoundError('Vault or Till');

      if (Number(vault.balance) < amount) {
        throw new BusinessRuleError(`Vault balance cannot go negative. Current: ${vault.balance}, Transfer: ${amount}`);
      }

      // Deduct from Vault, Add to Till
      await tx.vault.update({
        where: { id: vault.id },
        data: { balance: { decrement: new Prisma.Decimal(amount) } },
      });

      await tx.till.update({
        where: { id: till.id },
        data: { balance: { increment: new Prisma.Decimal(amount) } },
      });

      // Post GL entry: Dr Cash in Till (1012), Cr Cash in Vault (1011)
      journal = await postDoubleEntryJournal({
        description: `Cash issue: Vault ${vault.code} to Till ${till.code}`,
        reference: transfer.transferNumber,
        postedById: receiverId,
        debitAccountCode: GL_CODES.TILL,
        creditAccountCode: GL_CODES.VAULT,
        amount,
      });
    } else if (transfer.type === 'till_to_vault') {
      // 2. Till -> Vault return confirmation by Head Cashier
      const till = await tx.till.findUnique({ where: { id: transfer.fromTillId! } });
      const vault = await tx.vault.findUnique({ where: { id: transfer.toVaultId! } });
      if (!till || !vault) throw new NotFoundError('Till or Vault');

      if (Number(till.balance) < amount) {
        throw new BusinessRuleError(`Till balance cannot go negative. Current: ${till.balance}, Return: ${amount}`);
      }

      // Deduct from Till, Add to Vault
      await tx.till.update({
        where: { id: till.id },
        data: { balance: { decrement: new Prisma.Decimal(amount) } },
      });

      await tx.vault.update({
        where: { id: vault.id },
        data: { balance: { increment: new Prisma.Decimal(amount) } },
      });

      // Post GL entry: Dr Cash in Vault (1011), Cr Cash in Till (1012)
      journal = await postDoubleEntryJournal({
        description: `Cash return: Till ${till.code} to Vault ${vault.code}`,
        reference: transfer.transferNumber,
        postedById: receiverId,
        debitAccountCode: GL_CODES.VAULT,
        creditAccountCode: GL_CODES.TILL,
        amount,
      });
    }

    const completed = await tx.cashTransfer.update({
      where: { id: transferId },
      data: {
        status: 'completed',
        receivedBy: { connect: { id: receiverId } },
        confirmedAt: new Date(),
        journalEntryId: journal?.id,
      },
    });

    return completed;
  });
}

export async function initiateReturnToVault(tellerId: string, input: CreateTransferInput) {
  if (!tellerId) {
    throw new BadRequestError('Teller user ID is required.');
  }
  if (!input?.branchId) {
    throw new BadRequestError('Branch ID is required for cash return.');
  }

  const till = await ensureTillForUser(tellerId, input.branchId);
  const vault = await ensureVaultForBranch(input.branchId);

  const amount = Number(input.amount);
  if (isNaN(amount) || amount <= 0) {
    throw new BusinessRuleError('Return amount must be greater than zero.');
  }

  if (Number(till.balance) < amount) {
    throw new BusinessRuleError(`Till has insufficient balance (${till.balance} ETB) to return ${amount} ETB.`);
  }

  const transferNumber = `TRF-RET-${Date.now().toString().slice(-8)}`;

  return prisma.$transaction(async (tx) => {
    const transfer = await cashManagementRepo.createTransfer(
      {
        transferNumber,
        type: 'till_to_vault',
        fromTill: { connect: { id: till.id } },
        toVault: { connect: { id: vault.id } },
        amount: new Prisma.Decimal(input.amount),
        status: 'approved', // Ready for Head Cashier to count and confirm receipt
        requestedBy: { connect: { id: tellerId } },
        branch: { connect: { id: input.branchId } },
        notes: input.notes,
      },
      tx,
    );

    if (input.denominations && input.denominations.length > 0) {
      await cashManagementRepo.createDenominationCounts(
        'transfer',
        transfer.id,
        input.denominations,
        { cashTransferId: transfer.id },
        tx,
      );
    }

    return transfer;
  });
}

export async function rejectTransfer(transferId: string, userId: string, reason?: string) {
  const transfer = await cashManagementRepo.findTransferById(transferId);
  if (!transfer) throw new NotFoundError('Cash Transfer');
  if (['completed', 'rejected', 'cancelled'].includes(transfer.status)) {
    throw new BusinessRuleError(`Transfer cannot be rejected because it is already ${transfer.status}`);
  }

  return cashManagementRepo.updateTransfer(transferId, {
    status: 'rejected',
    rejectionReason: reason || 'Rejected by authorized personnel',
    receivedBy: { connect: { id: userId } },
  });
}

// ─── Bank Movements ──────────────────────────────────────────────────────────
export async function bankDeposit(branchId: string, input: BankMovementInput, userId: string) {
  const vault = await ensureVaultForBranch(branchId);
  const amount = Number(input.amount);

  if (amount <= 0) {
    throw new BusinessRuleError('Bank deposit amount must be greater than zero.');
  }

  if (Number(vault.balance) < amount) {
    throw new BusinessRuleError(`Insufficient vault balance (${vault.balance} ETB) for bank deposit of ${amount} ETB.`);
  }

  const transferNumber = `TRF-BNK-DEP-${Date.now().toString().slice(-8)}`;

  return prisma.$transaction(async (tx) => {
    // 1. Deduct from vault
    await tx.vault.update({
      where: { id: vault.id },
      data: { balance: { decrement: new Prisma.Decimal(amount) } },
    });

    // 2. Post GL: Dr Bank (1020), Cr Cash in Vault (1011)
    const journal = await postDoubleEntryJournal({
      description: `Excess vault cash deposit to Bank. Ref: ${input.bankSlipRef || 'N/A'}`,
      reference: input.bankSlipRef || transferNumber,
      postedById: userId,
      debitAccountCode: GL_CODES.BANK,
      creditAccountCode: GL_CODES.VAULT,
      amount,
    });

    // 3. Create transfer record
    const transfer = await cashManagementRepo.createTransfer(
      {
        transferNumber,
        type: 'vault_to_bank',
        fromVault: { connect: { id: vault.id } },
        amount: new Prisma.Decimal(amount),
        status: 'completed',
        requestedBy: { connect: { id: userId } },
        approvedBy: { connect: { id: userId } },
        receivedBy: { connect: { id: userId } },
        bankSlipRef: input.bankSlipRef,
        notes: input.notes,
        journalEntryId: journal?.id,
        branch: { connect: { id: branchId } },
        approvedAt: new Date(),
        confirmedAt: new Date(),
      },
      tx,
    );

    return transfer;
  });
}

export async function bankWithdrawal(branchId: string, input: BankMovementInput, userId: string) {
  const vault = await ensureVaultForBranch(branchId);
  const amount = Number(input.amount);

  if (amount <= 0) {
    throw new BusinessRuleError('Bank withdrawal amount must be greater than zero.');
  }

  const transferNumber = `TRF-BNK-WTH-${Date.now().toString().slice(-8)}`;

  return prisma.$transaction(async (tx) => {
    // 1. Credit Bank, Add to Vault
    await tx.vault.update({
      where: { id: vault.id },
      data: { balance: { increment: new Prisma.Decimal(amount) } },
    });

    // 2. Post GL: Dr Cash in Vault (1011), Cr Bank (1020)
    const journal = await postDoubleEntryJournal({
      description: `Bank withdrawal replenishment into Vault. Ref: ${input.bankSlipRef || 'N/A'}`,
      reference: input.bankSlipRef || transferNumber,
      postedById: userId,
      debitAccountCode: GL_CODES.VAULT,
      creditAccountCode: GL_CODES.BANK,
      amount,
    });

    // 3. Create transfer record
    const transfer = await cashManagementRepo.createTransfer(
      {
        transferNumber,
        type: 'bank_to_vault',
        toVault: { connect: { id: vault.id } },
        amount: new Prisma.Decimal(amount),
        status: 'completed',
        requestedBy: { connect: { id: userId } },
        approvedBy: { connect: { id: userId } },
        receivedBy: { connect: { id: userId } },
        bankSlipRef: input.bankSlipRef,
        notes: input.notes,
        journalEntryId: journal?.id,
        branch: { connect: { id: branchId } },
        approvedAt: new Date(),
        confirmedAt: new Date(),
      },
      tx,
    );

    return transfer;
  });
}

// ─── Vault Daily Check & Closing Workflow ────────────────────────────────────
export async function recordVaultDailyCheck(branchId: string, input: VaultDailyCheckInput, userId: string) {
  const vault = await ensureVaultForBranch(branchId);

  // If checkType is closing: Business Rule: "The day cannot close if transfers are pending or unconfirmed."
  if (input.checkType === 'closing') {
    const pendingTransfers = await cashManagementRepo.countPendingTransfers(branchId);
    if (pendingTransfers > 0) {
      throw new BusinessRuleError(`Vault cannot be closed: There are ${pendingTransfers} pending or unconfirmed transfers in this branch.`);
    }
  }

  const countedBalance = (input.denominations || []).reduce((acc, it) => acc + it.denomination * it.quantity, 0);
  const systemBalance = Number(vault.balance);
  const variance = countedBalance - systemBalance;

  return prisma.$transaction(async (tx) => {
    const check = await cashManagementRepo.createVaultCheck(
      {
        vault: { connect: { id: vault.id } },
        branch: { connect: { id: branchId } },
        checkDate: new Date(),
        checkType: input.checkType,
        systemBalance: new Prisma.Decimal(systemBalance),
        countedBalance: new Prisma.Decimal(countedBalance),
        variance: new Prisma.Decimal(variance),
        performedBy: { connect: { id: userId } },
        status: Math.abs(variance) < 0.01 ? 'confirmed' : 'discrepancy_flagged',
        notes: input.notes,
      },
      tx,
    );

    if (input.denominations && input.denominations.length > 0) {
      await cashManagementRepo.createDenominationCounts(
        'vault_check',
        check.id,
        input.denominations,
        { vaultCheckId: check.id },
        tx,
      );
    }

    // Record variance if any
    let varianceRecord = null;
    if (Math.abs(variance) >= 0.01) {
      varianceRecord = await cashManagementRepo.createVariance(
        {
          vaultCheck: { connect: { id: check.id } },
          amount: new Prisma.Decimal(variance),
          type: variance < 0 ? 'shortage' : 'overage',
          status: 'pending',
          reason: `Vault discrepancy on ${input.checkType} check: ${input.notes || 'Count mismatch'}`,
        },
        tx,
      );
    }

    return { check, variance: varianceRecord };
  });
}

// ─── Variance Management ─────────────────────────────────────────────────────
export async function resolveVariance(varianceId: string, input: ResolveVarianceInput, resolverId: string) {
  const variance = await cashManagementRepo.findVarianceById(varianceId);
  if (!variance) throw new NotFoundError('Cash Variance');
  if (variance.status === 'resolved') {
    throw new BusinessRuleError('This variance is already marked as resolved.');
  }

  return cashManagementRepo.updateVariance(varianceId, {
    status: 'resolved',
    resolvedBy: { connect: { id: resolverId } },
    resolutionNotes: input.resolutionNotes || input.reason,
    resolvedAt: new Date(),
  });
}

// ─── Core Banking Validation Hooks ───────────────────────────────────────────
export async function assertActiveTillSession(userId: string) {
  const session = await cashManagementRepo.findActiveSessionByUser(userId);
  if (!session) {
    throw new BusinessRuleError('You do not have an open till session. Core banking business rules require an open till session to process physical cash transactions.');
  }
  return session;
}

export async function recordTillTransaction(userId: string, branchId: string, amount: number, type: 'in' | 'out') {
  const till = await cashManagementRepo.findTillByUserAndBranch(userId, branchId);
  if (!till) return;

  const currentBal = Number(till.balance);
  if (type === 'out' && currentBal < amount) {
    throw new BusinessRuleError(`Till balance cannot go negative. Current drawer balance is ${currentBal} ETB, requested outflow is ${amount} ETB.`);
  }

  const delta = type === 'in' ? amount : -amount;
  await cashManagementRepo.updateTillBalance(till.id, new Prisma.Decimal(currentBal + delta));
}

// ─── Reports ─────────────────────────────────────────────────────────────────
export async function getDailyVaultPositionReport(branchId: string, dateStr?: string) {
  const date = dateStr ? new Date(dateStr) : new Date();
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const vault = await ensureVaultForBranch(branchId);

  // Transfers involving vault during day
  const transfers = await prisma.cashTransfer.findMany({
    where: {
      branchId,
      status: 'completed',
      createdAt: { gte: startOfDay, lte: endOfDay },
      OR: [{ fromVaultId: vault.id }, { toVaultId: vault.id }],
    },
    include: {
      fromTill: { select: { name: true, code: true } },
      toTill: { select: { name: true, code: true } },
      requestedBy: { select: { fullName: true } },
      approvedBy: { select: { fullName: true } },
    },
  });

  const openingCheck = await prisma.vaultDailyCheck.findFirst({
    where: { vaultId: vault.id, checkType: 'opening', checkDate: startOfDay },
  });

  const closingCheck = await prisma.vaultDailyCheck.findFirst({
    where: { vaultId: vault.id, checkType: 'closing', checkDate: startOfDay },
  });

  const issuesToTills = transfers.filter((t) => t.type === 'vault_to_till').reduce((s, t) => s + Number(t.amount), 0);
  const returnsFromTills = transfers.filter((t) => t.type === 'till_to_vault').reduce((s, t) => s + Number(t.amount), 0);
  const bankDeposits = transfers.filter((t) => t.type === 'vault_to_bank').reduce((s, t) => s + Number(t.amount), 0);
  const bankWithdrawals = transfers.filter((t) => t.type === 'bank_to_vault').reduce((s, t) => s + Number(t.amount), 0);

  const totalInflow = returnsFromTills + bankWithdrawals;
  const totalOutflow = issuesToTills + bankDeposits;

  return {
    vault: { id: vault.id, name: vault.name, code: vault.code, currentBalance: Number(vault.balance), maxLimit: Number(vault.maxLimit) },
    date: startOfDay.toISOString().slice(0, 10),
    openingCheck: openingCheck ? { counted: Number(openingCheck.countedBalance), variance: Number(openingCheck.variance) } : null,
    closingCheck: closingCheck ? { counted: Number(closingCheck.countedBalance), variance: Number(closingCheck.variance) } : null,
    summary: {
      issuesToTills,
      returnsFromTills,
      bankDeposits,
      bankWithdrawals,
      totalInflow,
      totalOutflow,
      netMovement: totalInflow - totalOutflow,
    },
    transfers,
  };
}

export async function getTillSummaryReport(branchId: string, startDate?: string, endDate?: string) {
  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 86400000);
  const end = endDate ? new Date(endDate) : new Date();

  return prisma.tillSession.findMany({
    where: {
      branchId,
      openedAt: { gte: start, lte: end },
    },
    include: {
      till: { select: { id: true, name: true, code: true } },
      user: { select: { id: true, fullName: true, email: true } },
      variances: true,
    },
    orderBy: { openedAt: 'desc' },
  });
}

export async function getCashVarianceReport(branchId?: string, startDate?: string, endDate?: string) {
  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 86400000);
  const end = endDate ? new Date(endDate) : new Date();

  return prisma.cashVariance.findMany({
    where: {
      createdAt: { gte: start, lte: end },
      ...(branchId && {
        OR: [
          { session: { branchId } },
          { vaultCheck: { branchId } },
        ],
      }),
    },
    include: {
      session: {
        include: {
          till: { select: { id: true, name: true, code: true } },
          user: { select: { id: true, fullName: true, email: true } },
          branch: { select: { id: true, name: true, code: true } },
        },
      },
      vaultCheck: {
        include: {
          vault: { select: { id: true, name: true, code: true } },
          branch: { select: { id: true, name: true, code: true } },
        },
      },
      resolvedBy: { select: { id: true, fullName: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getLimitBreachesReport(branchId?: string) {
  const vaults = await prisma.vault.findMany({
    where: branchId ? { branchId } : undefined,
    include: { branch: true },
  });

  const tills = await prisma.till.findMany({
    where: branchId ? { branchId } : undefined,
    include: { branch: true, user: true },
  });

  const vaultBreaches = vaults
    .filter((v) => Number(v.balance) > Number(v.maxLimit))
    .map((v) => ({
      entityType: 'vault',
      id: v.id,
      name: v.name,
      code: v.code,
      branchName: v.branch.name,
      balance: Number(v.balance),
      maxLimit: Number(v.maxLimit),
      excessAmount: Number(v.balance) - Number(v.maxLimit),
    }));

  const tillBreaches = tills
    .filter((t) => Number(t.balance) > Number(t.maxLimit))
    .map((t) => ({
      entityType: 'till',
      id: t.id,
      name: t.name,
      code: t.code,
      tellerName: t.user.fullName || t.user.email,
      branchName: t.branch.name,
      balance: Number(t.balance),
      maxLimit: Number(t.maxLimit),
      excessAmount: Number(t.balance) - Number(t.maxLimit),
    }));

  return {
    totalBreaches: vaultBreaches.length + tillBreaches.length,
    vaultBreaches,
    tillBreaches,
  };
}
