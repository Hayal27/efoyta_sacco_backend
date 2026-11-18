import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

export const accountingRepo = {
  // ── Chart of Accounts ────────────────────────────────────────────────────────
  async findGLAccounts() {
    return prisma.gLAccount.findMany({
      orderBy: [{ code: 'asc' }],
      include: {
        children: {
          orderBy: { code: 'asc' },
        },
      },
    });
  },

  async findGLAccountById(id: string) {
    return prisma.gLAccount.findUnique({
      where: { id },
      include: { children: true, parent: true },
    });
  },

  async findGLAccountByCode(code: string) {
    return prisma.gLAccount.findUnique({ where: { code } });
  },

  async createGLAccount(data: Prisma.GLAccountCreateInput) {
    return prisma.gLAccount.create({ data });
  },

  // ── Atomic Journal Entry Processor ──────────────────────────────────────────
  async createJournalEntry(data: {
    entryNumber: string;
    entryDate: Date;
    description: string;
    reference?: string;
    postedById?: string;
    lines: Array<{
      glAccountId: string;
      debit: number;
      credit: number;
      memo?: string;
    }>;
  }) {
    // Perform database-level transaction ensuring balanced entry & balance update
    return prisma.$transaction(async (tx) => {
      // 1. Create master journal entry
      const entry = await tx.journalEntry.create({
        data: {
          entryNumber: data.entryNumber,
          entryDate: data.entryDate,
          description: data.description,
          reference: data.reference || null,
          status: 'posted',
          postedById: data.postedById || null,
          lines: {
            create: data.lines.map((l) => ({
              glAccountId: l.glAccountId,
              debit: l.debit,
              credit: l.credit,
              memo: l.memo || null,
            })),
          },
        },
        include: {
          lines: {
            include: { glAccount: true },
          },
        },
      });

      // 2. Atomically update GL Account balances based on normal balance rules
      // Assets & Expenses increase on Debit, decrease on Credit
      // Liabilities, Equity, Revenue increase on Credit, decrease on Debit
      for (const line of data.lines) {
        const account = await tx.gLAccount.findUnique({ where: { id: line.glAccountId } });
        if (!account) continue;

        let delta = 0;
        if (account.type === 'asset' || account.type === 'expense') {
          delta = line.debit - line.credit;
        } else {
          delta = line.credit - line.debit;
        }

        await tx.gLAccount.update({
          where: { id: line.glAccountId },
          data: { balance: { increment: delta } },
        });

        // Also update parent account balance if header parent exists
        if (account.parentId) {
          await tx.gLAccount.update({
            where: { id: account.parentId },
            data: { balance: { increment: delta } },
          });
        }
      }

      return entry;
    });
  },

  async listJournalEntries(params?: { limit?: number; page?: number }) {
    const page = params?.page || 1;
    const limit = params?.limit || 50;
    const skip = (page - 1) * limit;

    const [entries, total] = await Promise.all([
      prisma.journalEntry.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          lines: {
            include: { glAccount: true },
          },
        },
      }),
      prisma.journalEntry.count(),
    ]);

    return { entries, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  // ── Fixed Assets ────────────────────────────────────────────────────────────
  async listFixedAssets() {
    return prisma.fixedAsset.findMany({
      orderBy: { createdAt: 'desc' },
    });
  },

  async createFixedAsset(data: Prisma.FixedAssetCreateInput) {
    return prisma.fixedAsset.create({ data });
  },

  async updateFixedAssetDepreciation(id: string, newAccumulatedDepreciation: number) {
    return prisma.fixedAsset.update({
      where: { id },
      data: { accumulatedDepreciation: newAccumulatedDepreciation },
    });
  },
};
