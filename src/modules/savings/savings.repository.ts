import { prisma } from '../../config/prisma';
import type { Prisma } from '@prisma/client';

export async function findAccountById(id: string) {
  return prisma.savingsAccount.findUnique({ where: { id }, include: { product: true } });
}

export async function findAccountByMemberAndProduct(memberId: string, productId: string) {
  return prisma.savingsAccount.findFirst({ where: { memberId, productId } });
}

export async function createAccount(memberId: string, productId: string, targetAmount?: number, maturityDate?: Date | null) {
  // Fetch all existing numeric account numbers to find the true max integer
  const accounts = await prisma.savingsAccount.findMany({
    select: { accountNumber: true },
  });

  let maxNum = 99999;
  for (const acc of accounts) {
    if (acc.accountNumber) {
      const n = parseInt(acc.accountNumber, 10);
      if (!isNaN(n) && n > maxNum) {
        maxNum = n;
      }
    }
  }
  const accountNumber = (maxNum + 1).toString();

  return prisma.savingsAccount.create({
    data: { memberId, productId, accountNumber, targetAmount, maturityDate },
    include: { product: true, member: { select: { fullName: true, memberCode: true, focalAgentId: true } } },
  });
}

export async function findAccountsByMember(memberId: string) {
  return prisma.savingsAccount.findMany({
    where: { memberId },
    include: { product: true },
  });
}

export async function getAccountBalance(accountId: string): Promise<number> {
  const txns = await prisma.savingsTxn.groupBy({
    by: ['type'],
    where: { accountId },
    _sum: { amount: true },
  });

  let balance = 0;
  for (const t of txns) {
    const sum = Number(t._sum.amount || 0);
    if (t.type === 'withdrawal') balance -= sum;
    else balance += sum;
  }
  return parseFloat(balance.toFixed(2));
}

export async function createTxn(data: Prisma.SavingsTxnUncheckedCreateInput) {
  return prisma.savingsTxn.create({
    data,
    include: { account: { include: { member: { select: { fullName: true, memberCode: true } } } } },
  });
}

export async function findTxnByReceipt(receiptNo: string) {
  return prisma.savingsTxn.findUnique({ where: { receiptNo } });
}

export async function listAccountTxns(accountId: string, skip: number, take: number) {
  const [data, total] = await Promise.all([
    prisma.savingsTxn.findMany({
      where: { accountId },
      orderBy: { txnDate: 'desc' },
      skip,
      take,
    }),
    prisma.savingsTxn.count({ where: { accountId } }),
  ]);
  return { data, meta: { total, page: skip / take + 1, limit: take, totalPages: Math.ceil(total / take) } };
}

export async function listAllAccounts(page: number, limit: number, query?: string) {
  const skip = (page - 1) * limit;
  const where: Prisma.SavingsAccountWhereInput = {};
  if (query) {
    where.OR = [
      { member: { OR: [{ fullName: { contains: query } }, { memberCode: { contains: query } }] } },
      { accountNumber: { contains: query } }
    ];
  }

  const [accounts, total] = await Promise.all([
    prisma.savingsAccount.findMany({
      where,
      skip,
      take: limit,
      orderBy: { openedAt: 'desc' },
      include: {
        member: { select: { id: true, fullName: true, memberCode: true, phone: true } },
        product: true,
        txns: {
          select: { type: true, amount: true },
        },
      },
    }),
    prisma.savingsAccount.count({ where }),
  ]);

  // Compute balance for each account
  const data = accounts.map((acc) => {
    let balance = 0;
    for (const t of acc.txns) {
      const amt = Number(t.amount);
      if (t.type === 'withdrawal') balance -= amt;
      else balance += amt;
    }
    const { txns: _omit, ...rest } = acc;
    return { ...rest, balance: parseFloat(balance.toFixed(2)) };
  });

  return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function listProducts() {
  return prisma.savingsProduct.findMany({ orderBy: { name: 'asc' } });
}

export async function findProductById(id: string) {
  return prisma.savingsProduct.findUnique({ where: { id } });
}

export async function createProduct(data: {
  name: string;
  type: string;
  interestRate: number;
  minBalance: number;
  noticePeriodDays: number;
}) {
  return prisma.savingsProduct.create({ data: data as any });
}

export async function updateProduct(id: string, data: Partial<{
  name: string;
  type: string;
  interestRate: number;
  minBalance: number;
  noticePeriodDays: number;
}>) {
  return prisma.savingsProduct.update({ where: { id }, data: data as any });
}

export async function deleteProduct(id: string) {
  // Only delete if no accounts are linked
  const accounts = await prisma.savingsAccount.count({ where: { productId: id } });
  if (accounts > 0) throw new Error('Cannot delete product with existing accounts');
  return prisma.savingsProduct.delete({ where: { id } });
}

export async function listAllTxns() {
  return prisma.savingsTxn.findMany({
    orderBy: { txnDate: 'desc' },
    include: {
      account: {
        select: {
          accountNumber: true,
          product: { select: { name: true, type: true } },
          member: { select: { fullName: true, memberCode: true } },
        },
      },
    },
  });
}

