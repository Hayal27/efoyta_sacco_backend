import { prisma } from '../../config/prisma';
import type { Prisma } from '@prisma/client';

// ── Loan Products ─────────────────────────────────────────────────────────────

export async function listProducts() {
  return prisma.loanProduct.findMany({ orderBy: [{ loanType: 'asc' }, { name: 'asc' }] });
}

export async function findProductById(id: string) {
  return prisma.loanProduct.findUnique({ where: { id } });
}

export async function createProduct(data: Prisma.LoanProductCreateInput) {
  return prisma.loanProduct.create({ data });
}

export async function updateProduct(id: string, data: Prisma.LoanProductUpdateInput) {
  return prisma.loanProduct.update({ where: { id }, data });
}

// ── Loans ─────────────────────────────────────────────────────────────────────

export async function createLoan(data: Prisma.LoanUncheckedCreateInput) {
  return prisma.loan.create({
    data,
    include: { member: { select: { fullName: true, memberCode: true } }, loanProduct: true },
  });
}

export async function findLoanById(id: string) {
  return prisma.loan.findUnique({
    where: { id },
    include: {
      member: { select: { id: true, fullName: true, memberCode: true, phone: true, email: true, nationalId: true, address: true } },
      loanProduct: true,
      repayments: { orderBy: { paidDate: 'desc' } },
      approver: { select: { fullName: true, email: true } },
      reviewer: { select: { fullName: true, email: true } },
      guarantors: {
        include: {
          guarantorMember: { select: { id: true, fullName: true, memberCode: true, phone: true, email: true, nationalId: true, address: true, status: true } },
          guarantorProfile: true,
          guarantorAccount: { select: { accountNumber: true, lienBalance: true } },
        },
      },
    },
  });
}

export async function updateLoan(id: string, data: Prisma.LoanUpdateInput) {
  return prisma.loan.update({ where: { id }, data, include: { loanProduct: true } });
}

export async function createRepayment(data: Prisma.RepaymentUncheckedCreateInput) {
  return prisma.repayment.create({ data });
}

export async function findRepaymentByReceipt(receiptNo: string) {
  return prisma.repayment.findUnique({ where: { receiptNo } });
}

export async function listLoans(filters?: {
  status?: string;
  memberId?: string;
  loanType?: string;
  page?: number;
  limit?: number;
  branchIds?: string[] | null;
}) {
  const page = filters?.page ?? 1;
  const limit = filters?.limit ?? 20;
  const skip = (page - 1) * limit;

  const where: Prisma.LoanWhereInput = {};
  if (filters?.status) {
    if (typeof filters.status === 'string' && filters.status.includes(',')) {
      where.status = { in: filters.status.split(',') as any[] };
    } else {
      where.status = filters.status as any;
    }
  }
  if (filters?.memberId) where.memberId = filters.memberId;
  if (filters?.loanType) where.loanType = filters.loanType as any;
  if (filters?.branchIds) where.branchId = { in: filters.branchIds };

  const [data, total] = await Promise.all([
    prisma.loan.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        member: { select: { id: true, fullName: true, memberCode: true, phone: true, email: true, nationalId: true, address: true } },
        loanProduct: true,
        reviewer: { select: { fullName: true } },
        approver: { select: { fullName: true } },
        repayments: { select: { amount: true, interestPortion: true, principalPortion: true, paidDate: true } },
        guarantors: {
          include: {
            guarantorMember: { select: { id: true, fullName: true, memberCode: true, phone: true, email: true, nationalId: true, address: true, status: true } },
            guarantorProfile: true,
            guarantorAccount: { select: { accountNumber: true, lienBalance: true } },
          },
        },
      },
    }),
    prisma.loan.count({ where }),
  ]);

  return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

// ── Eligibility helpers ───────────────────────────────────────────────────────

/** Sum of all deposits on the member's loan_saving savings account */
export async function getMemberLoanSavingBalance(memberId: string): Promise<number> {
  const accounts = await prisma.savingsAccount.findMany({
    where: {
      memberId,
      product: { type: 'loan_saving' },
    },
    include: {
      txns: { where: { type: 'deposit' }, select: { amount: true } },
    },
  });
  let total = 0;
  for (const acc of accounts) {
    for (const txn of acc.txns) {
      total += Number(txn.amount);
    }
  }
  return total;
}

/** Registration fee paid by the member */
export async function getMemberRegistrationFee(memberId: string): Promise<number> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { registrationFee: true },
  });
  return Number(member?.registrationFee ?? 0);
}

/** Current share balance of the member */
export async function getMemberShareBalance(memberId: string): Promise<number> {
  const account = await prisma.shareAccount.findUnique({
    where: { memberId },
    select: { balance: true },
  });
  return account?.balance ?? 0;
}
