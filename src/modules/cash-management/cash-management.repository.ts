import { prisma } from '../../config/prisma';
import { Prisma } from '@prisma/client';
import { DenominationItem } from './cash-management.types';

export const cashManagementRepo = {
  // ─── Vaults ────────────────────────────────────────────────────────────────
  async findVaultByBranch(branchId: string) {
    return prisma.vault.findFirst({
      where: { branchId },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        glAccount: { select: { id: true, code: true, name: true, balance: true } },
      },
    });
  },

  async findVaultById(id: string) {
    return prisma.vault.findUnique({
      where: { id },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        glAccount: { select: { id: true, code: true, name: true, balance: true } },
      },
    });
  },

  async findAllVaults() {
    return prisma.vault.findMany({
      include: {
        branch: { select: { id: true, name: true, code: true } },
        glAccount: { select: { id: true, code: true, name: true, balance: true } },
        _count: { select: { tills: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  },

  async createVault(data: Prisma.VaultCreateInput, tx?: Prisma.TransactionClient) {
    const db = tx || prisma;
    return db.vault.create({ data });
  },

  async updateVaultBalance(id: string, balance: number | Prisma.Decimal, tx?: Prisma.TransactionClient) {
    const db = tx || prisma;
    return db.vault.update({
      where: { id },
      data: { balance },
    });
  },

  async updateVaultLimit(id: string, maxLimit: number) {
    return prisma.vault.update({
      where: { id },
      data: { maxLimit },
    });
  },

  // ─── Tills ─────────────────────────────────────────────────────────────────
  async findTillByUserAndBranch(userId: string, branchId: string) {
    return prisma.till.findUnique({
      where: { userId_branchId: { userId, branchId } },
      include: {
        user: { select: { id: true, email: true, fullName: true } },
        vault: true,
        branch: { select: { id: true, name: true, code: true } },
        glAccount: { select: { id: true, code: true, name: true, balance: true } },
      },
    });
  },

  async findTillById(id: string) {
    return prisma.till.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, fullName: true } },
        vault: true,
        branch: { select: { id: true, name: true, code: true } },
        glAccount: { select: { id: true, code: true, name: true, balance: true } },
      },
    });
  },

  async findAllTills(branchId?: string) {
    return prisma.till.findMany({
      where: branchId ? { branchId } : undefined,
      include: {
        user: { select: { id: true, email: true, fullName: true, role: { select: { name: true, slug: true } } } },
        vault: { select: { id: true, name: true, code: true, balance: true } },
        branch: { select: { id: true, name: true, code: true } },
        sessions: {
          where: { status: 'open' },
          orderBy: { openedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  },

  async createTill(data: Prisma.TillCreateInput, tx?: Prisma.TransactionClient) {
    const db = tx || prisma;
    return db.till.create({ data });
  },

  async updateTillBalance(id: string, balance: number | Prisma.Decimal, tx?: Prisma.TransactionClient) {
    const db = tx || prisma;
    return db.till.update({
      where: { id },
      data: { balance },
    });
  },

  async updateTillLimit(id: string, maxLimit: number) {
    return prisma.till.update({
      where: { id },
      data: { maxLimit },
    });
  },

  // ─── Till Sessions ─────────────────────────────────────────────────────────
  async findActiveSessionByTill(tillId: string) {
    return prisma.tillSession.findFirst({
      where: { tillId, status: 'open' },
      include: {
        till: { include: { user: { select: { id: true, fullName: true, email: true } }, vault: true } },
        denominations: true,
      },
      orderBy: { openedAt: 'desc' },
    });
  },

  async findActiveSessionByUser(userId: string) {
    return prisma.tillSession.findFirst({
      where: { userId, status: 'open' },
      include: {
        till: { include: { user: { select: { id: true, fullName: true, email: true } }, vault: true } },
        denominations: true,
      },
      orderBy: { openedAt: 'desc' },
    });
  },

  async findSessionById(id: string) {
    return prisma.tillSession.findUnique({
      where: { id },
      include: {
        till: {
          include: {
            user: { select: { id: true, fullName: true, email: true } },
            vault: true,
            branch: { select: { id: true, name: true, code: true } },
          },
        },
        user: { select: { id: true, fullName: true, email: true } },
        branch: { select: { id: true, name: true, code: true } },
        denominations: true,
        variances: true,
      },
    });
  },

  async findSessions(params: { branchId?: string; tillId?: string; userId?: string; status?: string; startDate?: Date; endDate?: Date; page?: number; limit?: number }) {
    const { branchId, tillId, userId, status, startDate, endDate, page = 1, limit = 50 } = params;
    const where: Prisma.TillSessionWhereInput = {
      ...(branchId && { branchId }),
      ...(tillId && { tillId }),
      ...(userId && { userId }),
      ...(status && { status: status as any }),
      ...(startDate || endDate
        ? {
            openedAt: {
              ...(startDate && { gte: startDate }),
              ...(endDate && { lte: endDate }),
            },
          }
        : {}),
    };

    const [total, sessions] = await Promise.all([
      prisma.tillSession.count({ where }),
      prisma.tillSession.findMany({
        where,
        include: {
          till: { select: { id: true, name: true, code: true } },
          user: { select: { id: true, fullName: true, email: true } },
          branch: { select: { id: true, name: true, code: true } },
          variances: true,
        },
        orderBy: { openedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return { total, page, limit, sessions };
  },

  async createSession(data: Prisma.TillSessionCreateInput, tx?: Prisma.TransactionClient) {
    const db = tx || prisma;
    return db.tillSession.create({ data });
  },

  async updateSession(id: string, data: Prisma.TillSessionUpdateInput, tx?: Prisma.TransactionClient) {
    const db = tx || prisma;
    return db.tillSession.update({
      where: { id },
      data,
    });
  },

  // ─── Denominations ─────────────────────────────────────────────────────────
  async createDenominationCounts(
    referenceType: 'till_open' | 'till_close' | 'vault_check' | 'transfer',
    referenceId: string,
    items: DenominationItem[],
    extraKeys?: { tillSessionId?: string; cashTransferId?: string; vaultCheckId?: string },
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx || prisma;
    const creates = items
      .filter((it) => it.quantity > 0)
      .map((it) => ({
        referenceType,
        referenceId,
        denomination: new Prisma.Decimal(it.denomination),
        quantity: it.quantity,
        totalAmount: new Prisma.Decimal(it.denomination * it.quantity),
        tillSessionId: extraKeys?.tillSessionId,
        cashTransferId: extraKeys?.cashTransferId,
        vaultCheckId: extraKeys?.vaultCheckId,
      }));

    if (creates.length > 0) {
      await db.denominationCount.createMany({ data: creates });
    }
  },

  async getDenominationCounts(referenceType: string, referenceId: string) {
    return prisma.denominationCount.findMany({
      where: { referenceType, referenceId },
      orderBy: { denomination: 'desc' },
    });
  },

  // ─── Cash Transfers ────────────────────────────────────────────────────────
  async createTransfer(data: Prisma.CashTransferCreateInput, tx?: Prisma.TransactionClient) {
    const db = tx || prisma;
    return db.cashTransfer.create({ data });
  },

  async findTransferById(id: string) {
    return prisma.cashTransfer.findUnique({
      where: { id },
      include: {
        fromVault: true,
        toVault: true,
        fromTill: { include: { user: { select: { id: true, fullName: true, email: true } } } },
        toTill: { include: { user: { select: { id: true, fullName: true, email: true } } } },
        requestedBy: { select: { id: true, fullName: true, email: true, role: { select: { slug: true, name: true } } } },
        approvedBy: { select: { id: true, fullName: true, email: true, role: { select: { slug: true, name: true } } } },
        receivedBy: { select: { id: true, fullName: true, email: true, role: { select: { slug: true, name: true } } } },
        branch: { select: { id: true, name: true, code: true } },
        denominations: true,
      },
    });
  },

  async findTransfers(params: {
    branchId?: string;
    type?: string;
    status?: string;
    tillId?: string;
    vaultId?: string;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }) {
    const { branchId, type, status, tillId, vaultId, userId, startDate, endDate, page = 1, limit = 50 } = params;

    const where: Prisma.CashTransferWhereInput = {
      ...(branchId && { branchId }),
      ...(type && { type: type as any }),
      ...(status && { status: status as any }),
      ...(tillId && {
        OR: [{ fromTillId: tillId }, { toTillId: tillId }],
      }),
      ...(vaultId && {
        OR: [{ fromVaultId: vaultId }, { toVaultId: vaultId }],
      }),
      ...(userId && {
        OR: [{ requestedById: userId }, { approvedById: userId }, { receivedById: userId }],
      }),
      ...(startDate || endDate
        ? {
            createdAt: {
              ...(startDate && { gte: startDate }),
              ...(endDate && { lte: endDate }),
            },
          }
        : {}),
    };

    const [total, transfers] = await Promise.all([
      prisma.cashTransfer.count({ where }),
      prisma.cashTransfer.findMany({
        where,
        include: {
          fromVault: { select: { id: true, name: true, code: true } },
          toVault: { select: { id: true, name: true, code: true } },
          fromTill: { select: { id: true, name: true, code: true, user: { select: { fullName: true } } } },
          toTill: { select: { id: true, name: true, code: true, user: { select: { fullName: true } } } },
          requestedBy: { select: { id: true, fullName: true, email: true } },
          approvedBy: { select: { id: true, fullName: true, email: true } },
          receivedBy: { select: { id: true, fullName: true, email: true } },
          branch: { select: { id: true, name: true, code: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return { total, page, limit, transfers };
  },

  async countPendingTransfers(branchId: string, tillId?: string) {
    return prisma.cashTransfer.count({
      where: {
        branchId,
        status: { in: ['pending', 'approved'] },
        ...(tillId && {
          OR: [{ fromTillId: tillId }, { toTillId: tillId }],
        }),
      },
    });
  },

  async updateTransfer(id: string, data: Prisma.CashTransferUpdateInput, tx?: Prisma.TransactionClient) {
    const db = tx || prisma;
    return db.cashTransfer.update({
      where: { id },
      data,
    });
  },

  // ─── Cash Variances ────────────────────────────────────────────────────────
  async createVariance(data: Prisma.CashVarianceCreateInput, tx?: Prisma.TransactionClient) {
    const db = tx || prisma;
    return db.cashVariance.create({ data });
  },

  async findVarianceById(id: string) {
    return prisma.cashVariance.findUnique({
      where: { id },
      include: {
        session: {
          include: {
            till: { select: { id: true, name: true, code: true, branch: true } },
            user: { select: { id: true, fullName: true, email: true } },
          },
        },
        vaultCheck: { include: { vault: true } },
        resolvedBy: { select: { id: true, fullName: true, email: true } },
      },
    });
  },

  async findVariances(params: { branchId?: string; status?: string; type?: string; page?: number; limit?: number }) {
    const { branchId, status, type, page = 1, limit = 50 } = params;

    const where: Prisma.CashVarianceWhereInput = {
      ...(status && { status: status as any }),
      ...(type && { type: type as any }),
      ...(branchId && {
        OR: [
          { session: { branchId } },
          { vaultCheck: { branchId } },
        ],
      }),
    };

    const [total, variances] = await Promise.all([
      prisma.cashVariance.count({ where }),
      prisma.cashVariance.findMany({
        where,
        include: {
          session: {
            include: {
              till: { select: { id: true, name: true, code: true } },
              user: { select: { id: true, fullName: true, email: true } },
            },
          },
          vaultCheck: { include: { vault: { select: { id: true, name: true, code: true } } } },
          resolvedBy: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return { total, page, limit, variances };
  },

  async updateVariance(id: string, data: Prisma.CashVarianceUpdateInput) {
    return prisma.cashVariance.update({
      where: { id },
      data,
    });
  },

  // ─── Vault Daily Checks ────────────────────────────────────────────────────
  async createVaultCheck(data: Prisma.VaultDailyCheckCreateInput, tx?: Prisma.TransactionClient) {
    const db = tx || prisma;
    return db.vaultDailyCheck.create({ data });
  },

  async findVaultChecks(params: { vaultId?: string; branchId?: string; checkDate?: Date; page?: number; limit?: number }) {
    const { vaultId, branchId, checkDate, page = 1, limit = 50 } = params;
    const where: Prisma.VaultDailyCheckWhereInput = {
      ...(vaultId && { vaultId }),
      ...(branchId && { branchId }),
      ...(checkDate && { checkDate }),
    };

    const [total, checks] = await Promise.all([
      prisma.vaultDailyCheck.count({ where }),
      prisma.vaultDailyCheck.findMany({
        where,
        include: {
          vault: { select: { id: true, name: true, code: true } },
          branch: { select: { id: true, name: true, code: true } },
          performedBy: { select: { id: true, fullName: true, email: true } },
          denominations: true,
          variances: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return { total, page, limit, checks };
  },
};
