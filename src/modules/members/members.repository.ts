import { prisma } from '../../config/prisma';
import type { Prisma } from '@prisma/client';

export async function create(data: Prisma.MemberUncheckedCreateInput) {
  return prisma.member.create({ data, include: { focalAgent: true } });
}

export async function findById(id: string) {
  return prisma.member.findUnique({
    where: { id },
    include: { focalAgent: true },
  });
}

export async function findByIdWithDetails(id: string) {
  return prisma.member.findUnique({
    where: { id },
    include: {
      focalAgent: true,
      savingsAccounts: {
        include: {
          product: true,
          txns: { orderBy: { txnDate: 'desc' }, take: 50 },
        },
      },
      loans: {
        include: { loanProduct: true, repayments: { orderBy: { paidDate: 'desc' } } },
        orderBy: { createdAt: 'desc' },
      },
      shareAccount: {
        include: { txns: { orderBy: { txnDate: 'desc' } } }
      },
    },
  });
}

export async function update(id: string, data: Prisma.MemberUpdateInput) {
  return prisma.member.update({ where: { id }, data, include: { focalAgent: true } });
}

export async function search(params: {
  query?: string;
  focalAgentId?: string;
  status?: string;
  skip: number;
  take: number;
  branchIds?: string[] | null;
}) {
  const where: Prisma.MemberWhereInput = {};
  // BYPASS: Allow fetching all members for all roles
  // if (params.branchIds) where.branchId = { in: params.branchIds };

  if (params.query) {
    where.OR = [
      { fullName: { contains: params.query } },
      { memberCode: { contains: params.query } },
      { phone: { contains: params.query } },
      { email: { contains: params.query } },
    ];
  }

  if (params.focalAgentId) where.focalAgentId = params.focalAgentId;
  if (params.status) where.status = params.status as any;

  const [data, total] = await Promise.all([
    prisma.member.findMany({
      where,
      skip: params.skip,
      take: params.take,
      orderBy: { createdAt: 'desc' },
      include: { focalAgent: { select: { fullName: true, region: true } } },
    }),
    prisma.member.count({ where }),
  ]);

  return { data, total };
}
