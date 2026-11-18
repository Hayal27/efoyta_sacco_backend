import { prisma } from '../../config/prisma';

export async function getAllTransactions(query: any) {
  const { search, type, page = 1, limit = 50, startDate, endDate } = query;
  
  const pg = Number(page);
  const lim = Number(limit);
  
  const receiptFilter = search ? { receiptNo: { contains: search } } : {};
  const dateFilter: any = {};
  if (startDate) dateFilter.gte = new Date(startDate);
  if (endDate) dateFilter.lte = new Date(endDate);
  
  const dateQuery = Object.keys(dateFilter).length > 0 ? { txnDate: dateFilter } : {};
  const repaymentDateQuery = Object.keys(dateFilter).length > 0 ? { paidDate: dateFilter } : {};

  const txns: any[] = [];

  if (!type || type === 'savings') {
    const savings = await prisma.savingsTxn.findMany({
      where: { ...receiptFilter, ...dateQuery },
      include: {
        account: {
          include: { member: true }
        },
        recordedByUser: true
      },
      orderBy: { txnDate: 'desc' },
      take: lim * pg 
    });
    txns.push(...savings.map(s => ({
      id: s.id,
      module: 'savings',
      type: s.type,
      amount: s.amount,
      receiptNo: s.receiptNo,
      date: s.txnDate,
      paymentMethod: s.paymentMethod,
      memberInfo: `${s.account.member.fullName} (${s.account.member.memberCode})`,
      recordedBy: s.recordedByUser?.fullName || s.recordedByUser?.email || 'System',
    })));
  }

  if (!type || type === 'share') {
    const shares = await prisma.shareTxn.findMany({
      where: { ...receiptFilter, ...dateQuery },
      include: {
        account: {
          include: { member: true }
        },
        recordedByUser: true
      },
      orderBy: { txnDate: 'desc' },
      take: lim * pg
    });
    txns.push(...shares.map(s => ({
      id: s.id,
      module: 'share',
      type: 'share_purchase',
      amount: s.totalAmount,
      receiptNo: s.receiptNo,
      date: s.txnDate,
      paymentMethod: s.paymentMethod,
      memberInfo: `${s.account.member.fullName} (${s.account.member.memberCode})`,
      recordedBy: s.recordedByUser?.fullName || s.recordedByUser?.email || 'System',
    })));
  }

  if (!type || type === 'loan') {
    const repayments = await prisma.repayment.findMany({
      where: { ...receiptFilter, ...repaymentDateQuery },
      include: {
        loan: {
          include: { member: true }
        },
        recordedByUser: true
      },
      orderBy: { paidDate: 'desc' },
      take: lim * pg
    });
    txns.push(...repayments.map(r => ({
      id: r.id,
      module: 'loan',
      type: 'repayment',
      amount: r.amount,
      receiptNo: r.receiptNo,
      date: r.paidDate,
      paymentMethod: 'cash', 
      memberInfo: `${r.loan.member.fullName} (${r.loan.member.memberCode})`,
      recordedBy: r.recordedByUser?.fullName || r.recordedByUser?.email || 'System',
    })));
  }

  // Sort and paginate
  txns.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  const total = txns.length; // Approximate for this approach
  const data = txns.slice((pg - 1) * lim, pg * lim);

  return {
    data,
    meta: {
      total,
      page: pg,
      limit: lim,
      totalPages: Math.ceil(total / lim) || 1
    }
  };
}

export async function getTransactionAnalytics() {
  const savingsSum = await prisma.savingsTxn.aggregate({ _sum: { amount: true } });
  const sharesSum = await prisma.shareTxn.aggregate({ _sum: { totalAmount: true } });
  const loansSum = await prisma.repayment.aggregate({ _sum: { amount: true } });

  const s = Number(savingsSum._sum.amount || 0);
  const sh = Number(sharesSum._sum.totalAmount || 0);
  const l = Number(loansSum._sum.amount || 0);

  return {
    savingsTotal: s,
    sharesTotal: sh,
    loansTotal: l,
    grandTotal: s + sh + l
  };
}
