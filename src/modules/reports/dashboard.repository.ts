import { prisma } from '../../config/prisma';
import type { Prisma } from '@prisma/client';
import type { UserScope } from '../../shared/utils/branch.utils';

/**
 * Build Prisma where-clause fragments for every major entity type
 * based on the caller's scope (all / branch / focal).
 */
function buildWheres(scope: UserScope) {
  if (scope.type === 'branch') {
    const ids = scope.branchIds;
    return {
      memberWhere:   { branchId: { in: ids } } as Prisma.MemberWhereInput,
      loanWhere:     { branchId: { in: ids } } as Prisma.LoanWhereInput,
      savingsWhere:  { account: { branchId: { in: ids } } } as Prisma.SavingsTxnWhereInput,
      sharesWhere:   { account: { branchId: { in: ids } } } as Prisma.ShareTxnWhereInput,
      repayWhere:    { loan: { branchId: { in: ids } } } as Prisma.RepaymentWhereInput,
      memberRegWhere: { branchId: { in: ids } } as Prisma.MemberWhereInput,
    };
  }

  if (scope.type === 'focal') {
    const fid = scope.focalAgentId;
    return {
      memberWhere:   { focalAgentId: fid } as Prisma.MemberWhereInput,
      loanWhere:     { member: { focalAgentId: fid } } as Prisma.LoanWhereInput,
      savingsWhere:  { focalAgentId: fid } as Prisma.SavingsTxnWhereInput,
      sharesWhere:   { focalAgentId: fid } as Prisma.ShareTxnWhereInput,
      repayWhere:    { loan: { member: { focalAgentId: fid } } } as Prisma.RepaymentWhereInput,
      memberRegWhere: { focalAgentId: fid } as Prisma.MemberWhereInput,
    };
  }

  if (scope.type === 'crm') {
    const fids = scope.focalAgentIds;
    return {
      memberWhere:   { focalAgentId: { in: fids } } as Prisma.MemberWhereInput,
      loanWhere:     { member: { focalAgentId: { in: fids } } } as Prisma.LoanWhereInput,
      savingsWhere:  { focalAgentId: { in: fids } } as Prisma.SavingsTxnWhereInput,
      sharesWhere:   { focalAgentId: { in: fids } } as Prisma.ShareTxnWhereInput,
      repayWhere:    { loan: { member: { focalAgentId: { in: fids } } } } as Prisma.RepaymentWhereInput,
      memberRegWhere: { focalAgentId: { in: fids } } as Prisma.MemberWhereInput,
    };
  }

  if (scope.type === 'self') {
    const uid = scope.userId;
    return {
      memberWhere:   { createdBy: uid } as Prisma.MemberWhereInput,
      loanWhere:     { OR: [{ reviewedBy: uid }, { approvedBy: uid }] } as Prisma.LoanWhereInput,
      savingsWhere:  { recordedBy: uid } as Prisma.SavingsTxnWhereInput,
      sharesWhere:   { recordedBy: uid } as Prisma.ShareTxnWhereInput,
      repayWhere:    { recordedBy: uid } as Prisma.RepaymentWhereInput,
      memberRegWhere: { createdBy: uid } as Prisma.MemberWhereInput,
    };
  }

  // type === 'all' — no filter
  return {
    memberWhere:   {} as Prisma.MemberWhereInput,
    loanWhere:     {} as Prisma.LoanWhereInput,
    savingsWhere:  {} as Prisma.SavingsTxnWhereInput,
    sharesWhere:   {} as Prisma.ShareTxnWhereInput,
    repayWhere:    {} as Prisma.RepaymentWhereInput,
    memberRegWhere: {} as Prisma.MemberWhereInput,
  };
}

export async function getDashboardStats(
  kpiScope: UserScope = { type: 'all' }, 
  activityScope: UserScope = { type: 'all' },
  filters?: { branchId?: string; focalAgentId?: string }
) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Apply filters if scope is 'all' or 'coop' dashboard
  if (kpiScope.type === 'all' && filters) {
    if (filters.focalAgentId) {
      kpiScope = { type: 'focal', focalAgentId: filters.focalAgentId };
      activityScope = { type: 'focal', focalAgentId: filters.focalAgentId };
    } else if (filters.branchId) {
      kpiScope = { type: 'branch', branchIds: [filters.branchId] };
      activityScope = { type: 'branch', branchIds: [filters.branchId] };
    }
  }

  const kpiWheres = buildWheres(kpiScope);
  const activityWheres = buildWheres(activityScope);

  const [
    totalMembers,
    activeMembers,
    totalSavingsAgg,
    activeLoansAgg,
    pendingLoans,
    todayDeposits,
    todayRepayments,
    todayShares,
    todayRegistrations,
  ] = await Promise.all([
    prisma.member.count({ where: kpiWheres.memberWhere }),
    prisma.member.count({ where: { ...kpiWheres.memberWhere, status: 'active' } }),
    prisma.savingsTxn.aggregate({
      _sum: { amount: true },
      where: { ...kpiWheres.savingsWhere, type: 'deposit' },
    }),
    prisma.loan.aggregate({
      _sum: { outstanding: true },
      _count: true,
      where: { ...kpiWheres.loanWhere, status: 'active' },
    }),
    prisma.loan.count({ where: { ...kpiWheres.loanWhere, status: 'pending' } }),
    prisma.savingsTxn.aggregate({
      _sum: { amount: true },
      where: { ...kpiWheres.savingsWhere, type: 'deposit', txnDate: { gte: today } },
    }),
    prisma.repayment.aggregate({
      _sum: { amount: true },
      where: { ...kpiWheres.repayWhere, paidDate: { gte: today } },
    }),
    prisma.shareTxn.aggregate({
      _sum: { totalAmount: true },
      where: { ...kpiWheres.sharesWhere, type: 'purchase', txnDate: { gte: today } },
    }),
    prisma.member.aggregate({
      _sum: { registrationFee: true },
      where: { ...kpiWheres.memberRegWhere, joinDate: { gte: today } },
    }),
  ]);

  // Total savings = deposits - withdrawals
  const withdrawalsAgg = await prisma.savingsTxn.aggregate({
    _sum: { amount: true },
    where: { ...kpiWheres.savingsWhere, type: 'withdrawal' },
  });

  const totalSavings =
    Number(totalSavingsAgg._sum.amount ?? 0) -
    Number(withdrawalsAgg._sum.amount ?? 0);

  const totalTodayCollections =
    Number(todayDeposits._sum.amount ?? 0) +
    Number(todayRepayments._sum.amount ?? 0) +
    Number(todayShares._sum.totalAmount ?? 0) +
    Number(todayRegistrations._sum.registrationFee ?? 0);

  // ── Recent Activity ────────────────────────────────────────────────────────
  const rawSavings = await prisma.savingsTxn.findMany({
    take: 8,
    where: activityWheres.savingsWhere,
    orderBy: { createdAt: 'desc' },
    include: { account: { include: { member: { select: { fullName: true, memberCode: true } } } } },
  });

  const rawRepayments = await prisma.repayment.findMany({
    take: 8,
    where: activityWheres.repayWhere,
    orderBy: { createdAt: 'desc' },
    include: { loan: { include: { member: { select: { fullName: true, memberCode: true } } } } },
  });

  const rawShares = await prisma.shareTxn.findMany({
    take: 8,
    where: activityWheres.sharesWhere,
    orderBy: { createdAt: 'desc' },
    include: { account: { include: { member: { select: { fullName: true, memberCode: true } } } } },
  });

  const rawRegistrations = await prisma.member.findMany({
    take: 8,
    where: { ...activityWheres.memberRegWhere, registrationFee: { gt: 0 } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, fullName: true, memberCode: true, createdAt: true, registrationFee: true },
  });

  // ── Recent Loans ───────────────────────────────────────────────────────────
  const recentLoans = await prisma.loan.findMany({
    take: 4,
    where: activityWheres.loanWhere,
    orderBy: { createdAt: 'desc' },
    include: {
      member: { select: { fullName: true, memberCode: true } },
      loanProduct: { select: { name: true } },
    },
  });

  const mergedActivity = [
    ...rawSavings.map((s) => ({
      id: s.id,
      type: s.type === 'deposit' ? 'savings deposit' : 'savings withdrawal',
      amount: Number(s.amount),
      memberName: s.account.member.fullName,
      memberCode: s.account.member.memberCode,
      date: s.createdAt,
      paymentMethod: s.paymentMethod,
    })),
    ...rawRepayments.map((r) => ({
      id: r.id,
      type: 'loan repayment',
      amount: Number(r.amount),
      memberName: r.loan.member.fullName,
      memberCode: r.loan.member.memberCode,
      date: r.createdAt,
      paymentMethod: 'cash',
    })),
    ...rawShares.map((s) => ({
      id: s.id,
      type: 'share purchase',
      amount: Number(s.totalAmount),
      memberName: s.account.member.fullName,
      memberCode: s.account.member.memberCode,
      date: s.createdAt,
      paymentMethod: s.paymentMethod,
    })),
    ...rawRegistrations.map((m) => ({
      id: m.id,
      type: 'registration fee',
      amount: Number(m.registrationFee),
      memberName: m.fullName,
      memberCode: m.memberCode,
      date: m.createdAt,
      paymentMethod: 'cash',
    })),
  ];

  mergedActivity.sort((a, b) => b.date.getTime() - a.date.getTime());

  return {
    stats: {
      totalMembers,
      activeMembers,
      totalSavings: parseFloat(totalSavings.toFixed(2)),
      activeLoansAmount: parseFloat(Number(activeLoansAgg._sum.outstanding ?? 0).toFixed(2)),
      activeLoansCount: activeLoansAgg._count,
      pendingLoans,
      todayCollections: parseFloat(totalTodayCollections.toFixed(2)),
    },
    recentTransactions: mergedActivity.slice(0, 8),
    recentLoans: recentLoans.map((loan) => ({
      id: loan.id,
      memberName: loan.member.fullName,
      memberCode: loan.member.memberCode,
      productName: loan.loanProduct.name,
      principal: Number(loan.principal),
      outstanding: Number(loan.outstanding),
      status: loan.status,
      dueDate: loan.dueDate,
    })),
  };
}
