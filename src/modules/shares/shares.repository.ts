import { PrismaClient, ShareTxnType } from '@prisma/client';

const prisma = new PrismaClient();

export async function getConfig() {
  let config = await prisma.shareConfig.findUnique({ where: { id: 'singleton' } });
  if (!config) {
    config = await prisma.shareConfig.create({
      data: {
        id: 'singleton',
        sharePrice: 100,
        totalAvailable: 0,
        minPerMember: 1,
        maxPerMember: 0,
      }
    });
  }
  return config;
}

export async function updateConfig(data: any) {
  return prisma.shareConfig.upsert({
    where: { id: 'singleton' },
    update: data,
    create: {
      id: 'singleton',
      sharePrice: data.sharePrice ?? 100,
      totalAvailable: data.totalAvailable ?? 0,
      minPerMember: data.minPerMember ?? 1,
      maxPerMember: data.maxPerMember ?? 0,
    }
  });
}

export async function getTotalSharesSold() {
  const result = await prisma.shareAccount.aggregate({
    _sum: { balance: true }
  });
  return result._sum.balance || 0;
}

export async function findAccountByMember(memberId: string) {
  return prisma.shareAccount.findUnique({
    where: { memberId },
    include: { member: true }
  });
}

export async function createAccount(memberId: string) {
  return prisma.shareAccount.create({
    data: { memberId, balance: 0 }
  });
}

export async function listAccounts(params: { skip?: number; take?: number; query?: string }) {
  const where: any = {};
  if (params.query) {
    where.member = {
      OR: [
        { fullName: { contains: params.query } },
        { memberCode: { contains: params.query } }
      ]
    };
  }

  const [data, total] = await Promise.all([
    prisma.shareAccount.findMany({
      where,
      include: { member: true },
      skip: params.skip,
      take: params.take,
      orderBy: { openedAt: 'desc' },
    }),
    prisma.shareAccount.count({ where }),
  ]);

  return { data, total };
}

export async function processPurchase(data: {
  accountId: string;
  shares: number;
  pricePerShare: number;
  totalAmount: number;
  paymentMethod: any;
  txnDate: Date;
  receiptNo?: string;
  focalAgentId?: string;
  branchId?: string | null;
  recordedBy: string;
}) {
  return prisma.$transaction(async (tx) => {
    const txn = await tx.shareTxn.create({
      data: {
        accountId: data.accountId,
        type: ShareTxnType.purchase,
        shares: data.shares,
        pricePerShare: data.pricePerShare,
        totalAmount: data.totalAmount,
        paymentMethod: data.paymentMethod,
        txnDate: data.txnDate,
        focalAgentId: data.focalAgentId,
        branchId: data.branchId,
        recordedBy: data.recordedBy,
        receiptNo: data.receiptNo,
      }
    });

    await tx.shareAccount.update({
      where: { id: data.accountId },
      data: { balance: { increment: data.shares } }
    });

    return txn;
  });
}

export async function processTransfer(data: {
  fromAccountId: string;
  toAccountId: string;
  shares: number;
  pricePerShare: number;
  txnDate: Date;
  focalAgentId?: string;
  recordedBy: string;
}) {
  return prisma.$transaction(async (tx) => {
    // 1. Deduct from sender
    const txnOut = await tx.shareTxn.create({
      data: {
        accountId: data.fromAccountId,
        type: ShareTxnType.transfer_out,
        shares: data.shares,
        pricePerShare: data.pricePerShare,
        totalAmount: 0, // Transfers don't involve money entering the system
        paymentMethod: 'cash',
        txnDate: data.txnDate,
        focalAgentId: data.focalAgentId,
        recordedBy: data.recordedBy,
        receiptNo: `SHR-TO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      }
    });

    await tx.shareAccount.update({
      where: { id: data.fromAccountId },
      data: { balance: { decrement: data.shares } }
    });

    // 2. Add to receiver
    const txnIn = await tx.shareTxn.create({
      data: {
        accountId: data.toAccountId,
        type: ShareTxnType.transfer_in,
        shares: data.shares,
        pricePerShare: data.pricePerShare,
        totalAmount: 0,
        paymentMethod: 'cash',
        txnDate: data.txnDate,
        focalAgentId: data.focalAgentId,
        recordedBy: data.recordedBy,
        receiptNo: `SHR-TI-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      }
    });

    await tx.shareAccount.update({
      where: { id: data.toAccountId },
      data: { balance: { increment: data.shares } }
    });

    return { txnOut, txnIn };
  });
}

export async function listAllTxns() {
  return prisma.shareTxn.findMany({
    orderBy: { txnDate: 'desc' },
    include: {
      account: {
        select: {
          member: { select: { fullName: true, memberCode: true } },
        },
      },
    },
  });
}
