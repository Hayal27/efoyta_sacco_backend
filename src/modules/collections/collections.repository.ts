import { prisma } from '../../config/prisma';
import type { Prisma } from '@prisma/client';

export async function createSession(data: Prisma.DailyCollectionUncheckedCreateInput) {
  return prisma.dailyCollection.create({ data });
}

const sessionInclude = {
  focalAgent: { include: { user: { select: { id: true } } } },
  entries: {
    include: {
      member: {
        select: { id: true, fullName: true, memberCode: true, phone: true }
      },
      recordedByUser: {
        select: { id: true, fullName: true }
      }
    },
    orderBy: { createdAt: 'asc' as const }
  }
};

export async function findSessionById(id: string) {
  return prisma.dailyCollection.findUnique({
    where: { id },
    include: sessionInclude,
  });
}

export async function findSessionByAgentAndDate(focalAgentId: string, collectionDate: Date) {
  return prisma.dailyCollection.findFirst({
    where: { focalAgentId, collectionDate },
  });
}

export async function createCollectionEntry(data: {
  sessionId: string;
  memberId: string;
  voluntarySaving: number;
  interestFromVoluntary: number;
  loanSaving: number;
  regularSaving: number;
  interestFromRegular: number;
  childrensSaving: number;
  loanAmount: number;
  dailyLoanRepayment: number;
  bookFee: number;
  dailyCollectedShare: number;
  registrationFee: number;
  loanInterestAmount: number;
  totalAmount: number;
  recordedBy: string;
  receiptNo?: string;
  focalAgentId?: string | null;
  branchId?: string | null;
}) {
  return prisma.dailyCollectionEntry.create({ data });
}

export async function updateSessionTotals(id: string, amount: number, membersServedIncrement: number) {
  return prisma.dailyCollection.update({
    where: { id },
    data: {
      totalCollected: { increment: amount },
      membersServed: { increment: membersServedIncrement },
    },
  });
}

export async function markReconciled(id: string) {
  return prisma.dailyCollection.update({
    where: { id },
    data: { reconciled: true },
  });
}

export async function updateHandoverStatus(id: string, handoverStatus: string, receivedById?: string, receivedAt?: Date) {
  return prisma.dailyCollection.update({
    where: { id },
    data: { handoverStatus, receivedById, receivedAt },
  });
}

export async function listSessionsByHandoverStatus(handoverStatus: string, branchIds?: string[] | null) {
  const hasBranchFilter = Array.isArray(branchIds) && branchIds.length > 0;
  const where: Prisma.DailyCollectionWhereInput = { handoverStatus };
  if (hasBranchFilter) where.branchId = { in: branchIds! };

  return prisma.dailyCollection.findMany({
    where,
    include: sessionInclude,
    orderBy: { collectionDate: 'desc' },
  });
}

export async function listSessions(branchIds?: string[] | null) {
  const hasBranchFilter = Array.isArray(branchIds) && branchIds.length > 0;
  const where: Prisma.DailyCollectionWhereInput = {};
  if (hasBranchFilter) where.branchId = { in: branchIds! };

  return prisma.dailyCollection.findMany({
    where,
    include: sessionInclude,
    orderBy: { collectionDate: 'desc' },
  });
}

/**
 * Fetch the real transaction breakdown for a collection session from
 * savings_txn, repayments, and share_txn. Groups by member.
 */
export async function getAgentDailySummaries(focalAgentId: string, recordedByUserId: string) {
  // Query all transactions
  const savingsTxns = await prisma.savingsTxn.findMany({
    where: { recordedBy: recordedByUserId, type: 'deposit' },
    select: { txnDate: true, amount: true, account: { select: { memberId: true } } }
  });

  const repayments = await prisma.repayment.findMany({
    where: { recordedBy: recordedByUserId },
    select: { paidDate: true, amount: true, loan: { select: { memberId: true } } }
  });

  const shareTxns = await prisma.shareTxn.findMany({
    where: { recordedBy: recordedByUserId, type: 'purchase' },
    select: { txnDate: true, totalAmount: true, account: { select: { memberId: true } } }
  });

  const memberRegistrations = await prisma.member.findMany({
    where: { createdBy: recordedByUserId, registrationFee: { gt: 0 } },
    select: { joinDate: true, registrationFee: true, id: true }
  });

  // Group by date
  const summaries = new Map<string, {
    date: string;
    totalCollected: number;
    memberIds: Set<string>;
  }>();

  const add = (d: Date, amt: number, memberId: string) => {
    const dateStr = d.toISOString().split('T')[0];
    if (!summaries.has(dateStr)) {
      summaries.set(dateStr, { date: dateStr, totalCollected: 0, memberIds: new Set() });
    }
    const s = summaries.get(dateStr)!;
    s.totalCollected += Number(amt);
    s.memberIds.add(memberId);
  };

  for (const tx of savingsTxns) add(tx.txnDate, Number(tx.amount), tx.account.memberId);
  for (const tx of repayments) add(tx.paidDate, Number(tx.amount), tx.loan.memberId);
  for (const tx of shareTxns) add(tx.txnDate, Number(tx.totalAmount), tx.account.memberId);
  for (const reg of memberRegistrations) add(reg.joinDate, Number(reg.registrationFee), reg.id);

  // Get existing DailyCollection records for this agent
  const collections = await prisma.dailyCollection.findMany({
    where: { focalAgentId }
  });
  const collectionMap = new Map(collections.map(c => [c.collectionDate.toISOString().split('T')[0], c]));

  // Merge
  return Array.from(summaries.values()).map(s => {
    const coll = collectionMap.get(s.date);
    return {
      date: s.date,
      totalCollected: s.totalCollected,
      membersServed: s.memberIds.size,
      handoverStatus: coll ? coll.handoverStatus : 'pending',
      reconciled: coll ? coll.reconciled : false,
      collectionId: coll ? coll.id : null,
      focalAgentId,
    };
  }).sort((a, b) => b.date.localeCompare(a.date));
}

export async function getSessionTransactionBreakdown(sessionId: string) {
  const session = await prisma.dailyCollection.findUnique({
    where: { id: sessionId },
    include: { focalAgent: { include: { user: { select: { id: true } } } } }
  });
  if (!session) return null;
  return getAgentTransactionBreakdown(
    session.focalAgentId,
    session.focalAgent.user.id,
    session.collectionDate.toISOString().split('T')[0]
  );
}

export async function getAgentTransactionBreakdown(focalAgentId: string, recordedByUserId: string, collectionDateStr: string) {
  const collectionDate = new Date(collectionDateStr);

  // ── 1. Savings deposits by this focal agent on collection date ──────────
  const savingsTxns = await prisma.savingsTxn.findMany({
    where: {
      recordedBy: recordedByUserId,
      txnDate: collectionDate,
      type: 'deposit',
    },
    include: {
      account: {
        include: {
          product: { select: { name: true } },
          member: { select: { id: true, fullName: true, memberCode: true, phone: true } }
        }
      }
    }
  });

  // ── 2. Loan repayments recorded by this agent's user on that date ────────
  const repayments = await prisma.repayment.findMany({
    where: {
      recordedBy: recordedByUserId,
      paidDate: collectionDate,
    },
    include: {
      loan: {
        include: {
          member: { select: { id: true, fullName: true, memberCode: true, phone: true } }
        }
      }
    }
  });

  // ── 3. Share purchases by this focal agent on collection date ────────────
  const shareTxns = await prisma.shareTxn.findMany({
    where: {
      recordedBy: recordedByUserId,
      txnDate: collectionDate,
      type: 'purchase',
    },
    include: {
      account: {
        include: {
          member: { select: { id: true, fullName: true, memberCode: true, phone: true } }
        }
      }
    }
  });

  // ── Group by member ──────────────────────────────────────────────────────
  const memberMap = new Map<string, {
    member: { id: string; fullName: string; memberCode: string; phone: string };
    savingsAmount: number;
    loanRepaymentAmount: number;
    sharesAmount: number;
    totalAmount: number;
    details: { label: string; amount: number }[];
  }>();

  for (const txn of savingsTxns) {
    const m = txn.account.member;
    const productName = txn.account.product?.name || 'Savings';
    const label = txn.reasonCode === 'account_opening_fee'
      ? `${productName} Opening Fee`
      : productName;
    if (!memberMap.has(m.id)) memberMap.set(m.id, { member: m, savingsAmount: 0, loanRepaymentAmount: 0, sharesAmount: 0, totalAmount: 0, details: [] });
    const entry = memberMap.get(m.id)!;
    entry.savingsAmount += Number(txn.amount);
    entry.totalAmount += Number(txn.amount);
    entry.details.push({ label, amount: Number(txn.amount) });
  }

  for (const r of repayments) {
    const m = r.loan.member;
    if (!memberMap.has(m.id)) memberMap.set(m.id, { member: m, savingsAmount: 0, loanRepaymentAmount: 0, sharesAmount: 0, totalAmount: 0, details: [] });
    const entry = memberMap.get(m.id)!;
    entry.loanRepaymentAmount += Number(r.amount);
    entry.totalAmount += Number(r.amount);
    entry.details.push({ label: 'Loan Repayment', amount: Number(r.amount) });
  }

  for (const txn of shareTxns) {
    const m = txn.account.member;
    if (!memberMap.has(m.id)) memberMap.set(m.id, { member: m, savingsAmount: 0, loanRepaymentAmount: 0, sharesAmount: 0, totalAmount: 0, details: [] });
    const entry = memberMap.get(m.id)!;
    entry.sharesAmount += Number(txn.totalAmount);
    entry.totalAmount += Number(txn.totalAmount);
    entry.details.push({ label: 'Share Purchase', amount: Number(txn.totalAmount) });
  }

  // ── 4. Member Registration Fees ──────────────────────────────────────────
  const newMembers = await prisma.member.findMany({
    where: {
      createdBy: recordedByUserId,
      joinDate: collectionDate,
      registrationFee: { gt: 0 }
    },
    select: { id: true, fullName: true, memberCode: true, phone: true, registrationFee: true }
  });

  for (const m of newMembers) {
    if (!memberMap.has(m.id)) memberMap.set(m.id, { member: m as any, savingsAmount: 0, loanRepaymentAmount: 0, sharesAmount: 0, totalAmount: 0, details: [] });
    const entry = memberMap.get(m.id)!;
    entry.totalAmount += Number(m.registrationFee);
    entry.details.push({ label: 'Registration Fee', amount: Number(m.registrationFee) });
  }

  return {
    breakdown: Array.from(memberMap.values()),
    totals: {
      savingsTotal: Array.from(memberMap.values()).reduce((s, e) => s + e.savingsAmount, 0),
      loanRepayTotal: Array.from(memberMap.values()).reduce((s, e) => s + e.loanRepaymentAmount, 0),
      sharesTotal: Array.from(memberMap.values()).reduce((s, e) => s + e.sharesAmount, 0),
      grandTotal: Array.from(memberMap.values()).reduce((s, e) => s + e.totalAmount, 0),
    }
  };
}

export async function listAllEntries() {
  return prisma.dailyCollectionEntry.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      member: { select: { id: true, fullName: true, memberCode: true } },
    },
  });
}

