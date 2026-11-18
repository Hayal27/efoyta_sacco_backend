import { prisma } from '../../config/prisma';
import type { DashboardKpi } from '@coop/types';
import { getUserScope } from '../../shared/utils/branch.utils';

export async function getDashboardKpis(): Promise<DashboardKpi> {
  const [
    totalMembers,
    activeMembers,
    totalSavings,
    totalLoansOutstanding,
    totalLoansActive,
    overdueLoans,
  ] = await Promise.all([
    prisma.member.count(),
    prisma.member.count({ where: { status: 'active' } }),
    prisma.savingsTxn.aggregate({ _sum: { amount: true } }), // Simplified: need to subtract withdrawals in reality
    prisma.loan.aggregate({ _sum: { outstanding: true } }),
    prisma.loan.count({ where: { status: 'active' } }),
    prisma.loan.count({ where: { status: 'active', dueDate: { lt: new Date() } } }),
  ]);

  return {
    totalMembers,
    activeMembers,
    totalSavings: Number(totalSavings._sum.amount || 0),
    totalLoansOutstanding: Number(totalLoansOutstanding._sum.outstanding || 0),
    totalLoansActive,
    overdueLoans,
    collectionsTodayTotal: 0, // TODO
    collectionsTodayCount: 0, // TODO
  };
}

export async function getGrandSummary(branchIds?: string[] | null, startDate?: Date, endDate?: Date) {
  const whereTxn: any = {};
  const whereDate: any = {};
  if (startDate || endDate) {
    if (startDate) whereDate.gte = startDate;
    if (endDate) whereDate.lte = endDate;
    whereTxn.txnDate = whereDate;
  }

  const hasBranchFilter = Array.isArray(branchIds) && branchIds.length > 0;

  // 1. Savings Txns (deposits & interest)
  const savingsWhere = hasBranchFilter ? { account: { branchId: { in: branchIds! } } } : {};
  const savingsTxns = await prisma.savingsTxn.findMany({
    where: { type: { in: ['deposit', 'interest'] }, ...whereTxn, ...savingsWhere },
    include: { account: { include: { product: true, member: { select: { id: true, fullName: true, focalAgent: { select: { fullName: true } } } } } } }
  });

  // 2. Loan Repayments (includes principal + interest + upfront fee deductions)
  const loanWhere = hasBranchFilter ? { loan: { branchId: { in: branchIds! } } } : {};
  const repayments = await prisma.repayment.findMany({
    where: { ...(startDate || endDate ? { paidDate: whereDate } : {}), ...loanWhere },
    include: { loan: { include: { member: { select: { id: true, fullName: true, focalAgent: { select: { fullName: true } } } } } } }
  });

  // 3. Share Purchases
  const sharesWhere = hasBranchFilter ? { account: { branchId: { in: branchIds! } } } : {};
  const shareTxns = await prisma.shareTxn.findMany({
    where: { type: 'purchase', ...whereTxn, ...sharesWhere },
    include: { account: { include: { member: { select: { id: true, fullName: true, focalAgent: { select: { fullName: true } } } } } } }
  });

  // 4. Member Registrations
  const memberWhere = hasBranchFilter ? { branchId: { in: branchIds! } } : {};
  const registrations = await prisma.member.findMany({
    where: { registrationFee: { gt: 0 }, ...(startDate || endDate ? { joinDate: whereDate } : {}), ...memberWhere },
    include: { focalAgent: { select: { fullName: true } } }
  });

  // 5. Loans (for Book Fee and Disbursed Loan Amount)
  const loans = await prisma.loan.findMany({
    where: { ...(startDate || endDate ? { createdAt: whereDate } : {}), ...loanWhere },
    include: { member: { select: { id: true, fullName: true, focalAgent: { select: { fullName: true } } } } }
  });

  // 6. Daily Collection Entries (from focal agent collection sessions)
  const entryWhere = hasBranchFilter ? { branchId: { in: branchIds! } } : {};
  const collectionEntries = await prisma.dailyCollectionEntry.findMany({
    where: { ...(startDate || endDate ? { createdAt: whereDate } : {}), ...entryWhere },
    include: { member: { select: { id: true, fullName: true, focalAgent: { select: { fullName: true } } } } }
  });

  const memberMap = new Map<string, any>();
  const getMemberEntry = (m: any) => {
    if (!m || !m.id) return null;
    if (!memberMap.has(m.id)) {
      memberMap.set(m.id, {
        id: m.id,
        memberFullName: m.fullName,
        receiptNo: 'N/A',
        focal: m.focalAgent?.fullName || 'Unknown',
        voluntarySaving: 0, interestFromVoluntary: 0, loanSaving: 0, regularSaving: 0,
        interestFromRegular: 0, childrensSaving: 0, loanAmount: 0, dailyLoanRepayment: 0,
        bookFee: 0, dailyCollectedShare: 0, registrationFee: 0, loanInterestAmount: 0, totalAmount: 0,
      });
    }
    return memberMap.get(m.id);
  };

  // Process Savings
  for (const txn of savingsTxns) {
    if (!txn.account?.member) continue;
    const entry = getMemberEntry(txn.account.member);
    if (!entry) continue;
    const amount = Number(txn.amount);
    const type = txn.account.product?.type;
    const isInterest = txn.type === 'interest';
    
    if (type === 'voluntary') {
      if (isInterest) entry.interestFromVoluntary += amount;
      else entry.voluntarySaving += amount;
    } else if (type === 'regular') {
      if (isInterest) entry.interestFromRegular += amount;
      else entry.regularSaving += amount;
    } else if (type === 'children') {
      entry.childrensSaving += amount;
    } else if (type === 'loan_saving') {
      entry.loanSaving += amount;
    } else {
      entry.voluntarySaving += amount;
    }

    entry.totalAmount += amount;
  }

  // Process Repayments (Principal & Interest / Upfront Fees)
  for (const rep of repayments) {
    if (!rep.loan?.member) continue;
    const entry = getMemberEntry(rep.loan.member);
    if (!entry) continue;
    const principal = Number(rep.principalPortion || 0);
    const interest = Number(rep.interestPortion || 0);
    const amount = Number(rep.amount || (principal + interest));

    entry.dailyLoanRepayment += principal;
    entry.loanInterestAmount += interest;
    entry.totalAmount += amount;
  }

  // Process Shares
  for (const st of shareTxns) {
    if (!st.account?.member) continue;
    const entry = getMemberEntry(st.account.member);
    if (!entry) continue;
    const amount = Number(st.totalAmount || 0);
    entry.dailyCollectedShare += amount;
    entry.totalAmount += amount;
  }

  // Process Registration Fees
  for (const reg of registrations) {
    const entry = getMemberEntry(reg);
    if (!entry) continue;
    const amount = Number(reg.registrationFee || 0);
    entry.registrationFee += amount;
    entry.totalAmount += amount;
  }

  // Process Loans (Disbursed Loan Amount & Book Fees)
  for (const l of loans) {
    if (!l.member) continue;
    const entry = getMemberEntry(l.member);
    if (!entry) continue;
    const principal = Number(l.principal || 0);
    const bookFee = Number(l.bookFee || 0);
    
    entry.loanAmount += principal;
    if (bookFee > 0) {
      entry.bookFee += bookFee;
      entry.totalAmount += bookFee;
    }
  }

  // Process Collection Entries (for any extra fees like bookFee, interestFromVoluntary, etc. recorded on entries)
  for (const ce of collectionEntries) {
    if (!ce.member) continue;
    const entry = getMemberEntry(ce.member);
    if (!entry) continue;

    if (Number(ce.bookFee || 0) > 0 && entry.bookFee === 0) {
      const bFee = Number(ce.bookFee);
      entry.bookFee += bFee;
      entry.totalAmount += bFee;
    }
    if (Number(ce.interestFromVoluntary || 0) > 0 && entry.interestFromVoluntary === 0) {
      const iv = Number(ce.interestFromVoluntary);
      entry.interestFromVoluntary += iv;
      entry.totalAmount += iv;
    }
    if (Number(ce.interestFromRegular || 0) > 0 && entry.interestFromRegular === 0) {
      const ir = Number(ce.interestFromRegular);
      entry.interestFromRegular += ir;
      entry.totalAmount += ir;
    }
  }

  const totals = {
    voluntarySaving: 0, interestFromVoluntary: 0, loanSaving: 0, regularSaving: 0,
    interestFromRegular: 0, childrensSaving: 0, loanAmount: 0, dailyLoanRepayment: 0,
    bookFee: 0, dailyCollectedShare: 0, registrationFee: 0, loanInterestAmount: 0, totalAmount: 0,
  };

  const formattedItems = Array.from(memberMap.values());
  for (const item of formattedItems) {
    totals.voluntarySaving += item.voluntarySaving;
    totals.interestFromVoluntary += item.interestFromVoluntary;
    totals.loanSaving += item.loanSaving;
    totals.regularSaving += item.regularSaving;
    totals.interestFromRegular += item.interestFromRegular;
    totals.childrensSaving += item.childrensSaving;
    totals.loanAmount += item.loanAmount;
    totals.dailyLoanRepayment += item.dailyLoanRepayment;
    totals.bookFee += item.bookFee;
    totals.dailyCollectedShare += item.dailyCollectedShare;
    totals.registrationFee += item.registrationFee;
    totals.loanInterestAmount += item.loanInterestAmount;
    totals.totalAmount += item.totalAmount;
  }

  return { totals, items: formattedItems };
}

export async function getCollectionsReport(branchIds?: string[] | null) {
  const hasBranchFilter = Array.isArray(branchIds) && branchIds.length > 0;
  const sessionWhere: any = hasBranchFilter ? { branchId: { in: branchIds! } } : {};

  // 1. Fetch all DailyCollection sessions with detailed entries
  const sessions = await prisma.dailyCollection.findMany({
    where: sessionWhere,
    include: {
      focalAgent: { select: { fullName: true, user: { select: { fullName: true } } } },
      entries: {
        include: {
          member: { select: { id: true, fullName: true, memberCode: true } }
        },
        orderBy: { createdAt: 'asc' }
      }
    },
    orderBy: { collectionDate: 'desc' }
  });

  const sessionList = sessions.map(s => {
    let savings = 0;
    let repayments = 0;
    let interestAndFees = 0;
    let shares = 0;
    let registrationAndBookFees = 0;

    const formattedEntries = (s.entries || []).map((e: any) => {
      const eSavings = Number(e.voluntarySaving || 0) + Number(e.regularSaving || 0) + Number(e.childrensSaving || 0) + Number(e.loanSaving || 0);
      const eRepay = Number(e.dailyLoanRepayment || 0);
      const eInterest = Number(e.loanInterestAmount || 0) + Number(e.interestFromVoluntary || 0) + Number(e.interestFromRegular || 0);
      const eShares = Number(e.dailyCollectedShare || 0);
      const eRegBook = Number(e.registrationFee || 0) + Number(e.bookFee || 0);
      const eTotal = Number(e.totalAmount || (eSavings + eRepay + eInterest + eShares + eRegBook));

      savings += eSavings;
      repayments += eRepay;
      interestAndFees += eInterest;
      shares += eShares;
      registrationAndBookFees += eRegBook;

      return {
        id: e.id,
        memberName: e.member?.fullName || 'Member',
        memberCode: e.member?.memberCode || '',
        savings: eSavings,
        repayments: eRepay,
        interestAndFees: eInterest,
        shares: eShares,
        registrationAndBookFees: eRegBook,
        totalAmount: eTotal,
      };
    });

    const calcTotal = savings + repayments + interestAndFees + shares + registrationAndBookFees;
    const totalAmount = Number(s.totalCollected || 0) > 0 ? Number(s.totalCollected) : (calcTotal > 0 ? calcTotal : 0);

    return {
      id: s.id,
      focalAgent: { fullName: s.focalAgent?.fullName || s.focalAgent?.user?.fullName || 'Focal Agent' },
      agentName: s.focalAgent?.fullName || s.focalAgent?.user?.fullName || 'Focal Agent',
      createdAt: s.collectionDate || s.createdAt,
      totalAmount,
      savings,
      repayments,
      interestAndFees,
      shares,
      registrationAndBookFees,
      entriesCount: s.entries?.length || s.membersServed || 0,
      status: s.reconciled ? 'reconciled' : 'pending',
      isReconciled: s.reconciled,
      entries: formattedEntries,
    };
  });

  // 2. Fetch direct cashier collection activity
  const directTxnsWhere = hasBranchFilter ? { branchId: { in: branchIds! } } : {};

  const [savingsTxns, repayments, shareTxns, members] = await Promise.all([
    prisma.savingsTxn.findMany({
      where: { type: 'deposit', ...directTxnsWhere },
      select: { amount: true, createdAt: true, recordedByUser: { select: { fullName: true } } }
    }),
    prisma.repayment.findMany({
      where: directTxnsWhere,
      select: { amount: true, principalPortion: true, interestPortion: true, paidDate: true, createdAt: true, recordedByUser: { select: { fullName: true } } }
    }),
    prisma.shareTxn.findMany({
      where: { type: 'purchase', ...directTxnsWhere },
      select: { totalAmount: true, createdAt: true, recordedByUser: { select: { fullName: true } } }
    }),
    prisma.member.findMany({
      where: { registrationFee: { gt: 0 }, ...(hasBranchFilter ? { branchId: { in: branchIds! } } : {}) },
      select: { registrationFee: true, joinDate: true, createdAt: true, createdByUser: { select: { fullName: true } } }
    })
  ]);

  const dateMap = new Map<string, {
    total: number;
    savings: number;
    repayments: number;
    interestAndFees: number;
    shares: number;
    registrationAndBookFees: number;
    count: number;
    actor: string;
    date: Date;
  }>();
  
  const getOrCreateDate = (dateObj: Date, actorName: string) => {
    const dateStr = new Date(dateObj).toISOString().split('T')[0];
    let existing = dateMap.get(dateStr);
    if (!existing) {
      existing = {
        total: 0, savings: 0, repayments: 0, interestAndFees: 0,
        shares: 0, registrationAndBookFees: 0, count: 0,
        actor: actorName || 'Cashier / HQ', date: dateObj
      };
      dateMap.set(dateStr, existing);
    }
    return existing;
  };

  for (const s of savingsTxns) {
    const amt = Number(s.amount || 0);
    if (amt <= 0) continue;
    const item = getOrCreateDate(s.createdAt, s.recordedByUser?.fullName || 'Cashier');
    item.savings += amt;
    item.total += amt;
    item.count += 1;
  }
  for (const r of repayments) {
    const amt = Number(r.amount || 0);
    if (amt <= 0) continue;
    const item = getOrCreateDate(r.paidDate || r.createdAt, r.recordedByUser?.fullName || 'Cashier');
    const pPortion = Number(r.principalPortion || 0);
    const iPortion = Number(r.interestPortion || 0);
    item.repayments += pPortion;
    item.interestAndFees += iPortion;
    item.total += amt;
    item.count += 1;
  }
  for (const st of shareTxns) {
    const amt = Number(st.totalAmount || 0);
    if (amt <= 0) continue;
    const item = getOrCreateDate(st.createdAt, st.recordedByUser?.fullName || 'Cashier');
    item.shares += amt;
    item.total += amt;
    item.count += 1;
  }
  for (const m of members) {
    const amt = Number(m.registrationFee || 0);
    if (amt <= 0) continue;
    const item = getOrCreateDate(m.joinDate || m.createdAt, m.createdByUser?.fullName || 'Cashier');
    item.registrationAndBookFees += amt;
    item.total += amt;
    item.count += 1;
  }

  const standaloneSessions = Array.from(dateMap.entries()).map(([dateStr, info]) => ({
    id: `DIR-${dateStr.replace(/-/g, '')}`,
    focalAgent: { fullName: `Direct Collections (${info.actor})` },
    agentName: `Direct Collections (${info.actor})`,
    createdAt: info.date,
    totalAmount: parseFloat(info.total.toFixed(2)),
    savings: parseFloat(info.savings.toFixed(2)),
    repayments: parseFloat(info.repayments.toFixed(2)),
    interestAndFees: parseFloat(info.interestAndFees.toFixed(2)),
    shares: parseFloat(info.shares.toFixed(2)),
    registrationAndBookFees: parseFloat(info.registrationAndBookFees.toFixed(2)),
    entriesCount: info.count,
    status: 'reconciled',
    isReconciled: true,
    entries: [],
  }));

  // Combine: sessions + standalone sessions
  const combined = [...sessionList];
  for (const st of standaloneSessions) {
    if (!combined.some(c => new Date(c.createdAt).toISOString().split('T')[0] === new Date(st.createdAt).toISOString().split('T')[0])) {
      combined.push(st);
    }
  }

  return combined.length > 0 ? combined : standaloneSessions;
}

export async function getSavingsReport(branchIds?: string[] | null) {
  const hasBranchFilter = Array.isArray(branchIds) && branchIds.length > 0;
  const where: any = hasBranchFilter ? { branchId: { in: branchIds! } } : {};

  const accounts = await prisma.savingsAccount.findMany({
    where,
    include: {
      member: { select: { id: true, fullName: true, memberCode: true, phone: true } },
      product: { select: { name: true, type: true, interestRate: true } },
      branch: { select: { name: true } },
      txns: { select: { type: true, amount: true, txnDate: true } }
    },
    orderBy: { openedAt: 'desc' }
  });

  return accounts.map(a => {
    const totalDeposits = a.txns.filter(t => t.type === 'deposit').reduce((s, t) => s + Number(t.amount), 0);
    const totalWithdrawals = a.txns.filter(t => t.type === 'withdrawal').reduce((s, t) => s + Number(t.amount), 0);
    return {
      id: a.id,
      accountNumber: a.accountNumber,
      memberName: a.member?.fullName,
      memberCode: a.member?.memberCode,
      productName: a.product?.name,
      productType: a.product?.type,
      branchName: a.branch?.name || 'N/A',
      totalDeposits,
      totalWithdrawals,
      balance: totalDeposits - totalWithdrawals,
      openedAt: a.openedAt,
    };
  });
}

export async function getLoansReport(branchIds?: string[] | null) {
  const hasBranchFilter = Array.isArray(branchIds) && branchIds.length > 0;
  const where: any = hasBranchFilter ? { branchId: { in: branchIds! } } : {};

  const loans = await prisma.loan.findMany({
    where,
    include: {
      member: { select: { id: true, fullName: true, memberCode: true } },
      loanProduct: { select: { name: true, loanType: true } },
      branch: { select: { name: true } },
      repayments: { select: { amount: true, principalPortion: true, interestPortion: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  return loans.map(l => {
    const totalRepaid = l.repayments.reduce((s, r) => s + Number(r.amount), 0);
    const interestRepaid = l.repayments.reduce((s, r) => s + Number(r.interestPortion || 0), 0);
    return {
      id: l.id,
      memberName: l.member?.fullName,
      memberCode: l.member?.memberCode,
      productName: l.loanProduct?.name,
      loanType: l.loanType,
      principal: Number(l.principal),
      upfrontDeduction: Number(l.upfrontDeduction || 0),
      outstanding: Number(l.outstanding),
      totalRepaid,
      interestRepaid,
      status: l.status,
      dueDate: l.dueDate,
      createdAt: l.createdAt,
    };
  });
}

export async function getMemberTxnDetail(memberId: string, startDate?: Date, endDate?: Date) {
  const dateFilter = (startDate || endDate) 
    ? { gte: startDate, lte: endDate }
    : undefined;

  const [savingsTxns, repayments, shareTxns] = await Promise.all([
    prisma.savingsTxn.findMany({
      where: {
        type: 'deposit',
        account: { memberId },
        ...(dateFilter ? { txnDate: dateFilter } : {}),
      },
      include: {
        account: { include: { product: true, branch: { select: { name: true } } } },
        branch: { select: { name: true } },
        recordedByUser: { select: { fullName: true } },
        focalAgent: { select: { fullName: true } },
      },
      orderBy: { txnDate: 'desc' },
    }),
    prisma.repayment.findMany({
      where: {
        loan: { memberId },
        ...(dateFilter ? { paidDate: dateFilter } : {}),
      },
      include: {
        loan: { select: { id: true, branch: { select: { name: true } } } },
        branch: { select: { name: true } },
        recordedByUser: { select: { fullName: true } },
        focalAgent: { select: { fullName: true } },
      },
      orderBy: { paidDate: 'desc' },
    }),
    prisma.shareTxn.findMany({
      where: {
        type: 'purchase',
        account: { memberId },
        ...(dateFilter ? { txnDate: dateFilter } : {}),
      },
      include: {
        account: { select: { branch: { select: { name: true } } } },
        branch: { select: { name: true } },
        recordedByUser: { select: { fullName: true } },
        focalAgent: { select: { fullName: true } },
      },
      orderBy: { txnDate: 'desc' },
    }),
  ]);

  const transactions = [
    ...savingsTxns.map(t => ({
      id: t.id,
      date: t.txnDate,
      type: 'Savings Deposit',
      category: t.account.product?.name || 'Savings',
      amount: Number(t.amount),
      receiptNo: t.receiptNo || 'System Gen',
      branch: t.branch?.name || t.account.branch?.name || 'N/A',
      paymentMethod: t.paymentMethod,
      reasonCode: t.reasonCode || null,
      recordedBy: t.focalAgent?.fullName || t.recordedByUser?.fullName || 'System',
    })),
    ...repayments.map(r => ({
      id: r.id,
      date: r.paidDate,
      type: 'Loan Repayment',
      category: 'Loan',
      amount: Number(r.amount),
      receiptNo: r.receiptNo || 'System Gen',
      branch: r.branch?.name || r.loan.branch?.name || 'N/A',
      paymentMethod: r.paymentMethod,
      reasonCode: null,
      recordedBy: r.focalAgent?.fullName || r.recordedByUser?.fullName || 'System',
    })),
    ...shareTxns.map(s => ({
      id: s.id,
      date: s.txnDate,
      type: 'Share Purchase',
      category: 'Shares',
      amount: Number(s.totalAmount),
      receiptNo: s.receiptNo || 'System Gen',
      branch: s.branch?.name || s.account?.branch?.name || 'N/A',
      paymentMethod: s.paymentMethod,
      reasonCode: null,
      recordedBy: s.focalAgent?.fullName || s.recordedByUser?.fullName || 'System',
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalAmount = transactions.reduce((s, t) => s + t.amount, 0);
  return { transactions, totalAmount };
}

export async function getCrmFollowUpStats(userId: string) {
  const scope = await getUserScope(userId);
  let fids: string[] = [];

  if (scope.type === 'crm') {
    fids = scope.focalAgentIds;
  } else if (scope.type === 'all') {
    const allFocals = await prisma.focalAgent.findMany({ select: { id: true } });
    fids = allFocals.map(f => f.id);
  } else if (scope.type === 'focal') {
    fids = [scope.focalAgentId];
  } else {
    return [];
  }

  if (fids.length === 0) return [];

  const focalAgents = await prisma.focalAgent.findMany({
    where: { id: { in: fids } },
    include: {
      user: { select: { fullName: true, phone: true } },
    }
  });

  const results = [];
  for (const fa of focalAgents) {
    const depositAgg = await prisma.savingsTxn.aggregate({
      _sum: { amount: true },
      where: { focalAgentId: fa.id, type: 'deposit' }
    });
    const withdrawAgg = await prisma.savingsTxn.aggregate({
      _sum: { amount: true },
      where: { focalAgentId: fa.id, type: 'withdrawal' }
    });
    const membersCount = await prisma.member.count({
      where: { focalAgentId: fa.id }
    });
    const savingsAccountsCount = await prisma.savingsAccount.count({
      where: { member: { focalAgentId: fa.id } }
    });
    const shareAccountsCount = await prisma.shareAccount.count({
      where: { member: { focalAgentId: fa.id } }
    });
    const repayAgg = await prisma.repayment.aggregate({
      _sum: { amount: true },
      where: { focalAgentId: fa.id }
    });
    const shareAgg = await prisma.shareTxn.aggregate({
      _sum: { totalAmount: true },
      where: { focalAgentId: fa.id, type: 'purchase' }
    });
    const sessionsCount = await prisma.dailyCollection.count({
      where: { focalAgentId: fa.id }
    });
    const reconciledCount = await prisma.dailyCollection.count({
      where: { focalAgentId: fa.id, reconciled: true }
    });
    const lastSession = await prisma.dailyCollection.findFirst({
      where: { focalAgentId: fa.id },
      orderBy: { collectionDate: 'desc' },
      select: { collectionDate: true }
    });

    const members = await prisma.member.findMany({
      where: { focalAgentId: fa.id },
      select: {
        id: true,
        fullName: true,
        memberCode: true,
        phone: true,
        status: true,
        registrationFee: true,
        joinDate: true,
      },
      orderBy: { joinDate: 'desc' },
      take: 50,
    });

    results.push({
      id: fa.id,
      fullName: fa.fullName || fa.user?.fullName || 'Unknown Agent',
      phone: fa.phone || fa.user?.phone || 'N/A',
      region: fa.region || 'HQ',
      depositSum: Number(depositAgg._sum.amount || 0),
      withdrawSum: Number(withdrawAgg._sum.amount || 0),
      memberRegCount: membersCount,
      accountCreations: savingsAccountsCount + shareAccountsCount,
      loanRepayments: Number(repayAgg._sum.amount || 0),
      shareSum: Number(shareAgg._sum.totalAmount || 0),
      sessionsCount,
      reconciledSessionsCount: reconciledCount,
      lastCollectionDate: lastSession?.collectionDate || null,
      members: members.map(m => ({
        id: m.id,
        fullName: m.fullName,
        memberCode: m.memberCode,
        phone: m.phone,
        status: m.status,
        registrationFee: Number(m.registrationFee || 0),
        joinDate: m.joinDate,
      })),
    });
  }

  return results;
}
