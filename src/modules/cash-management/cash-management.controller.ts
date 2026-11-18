import { Request, Response } from 'express';
import * as cashService from './cash-management.service';
import { cashManagementRepo } from './cash-management.repository';
import { prisma } from '../../config/prisma';
import { UnauthorizedError, BadRequestError } from '../../shared/errors/app-error';

function getUserId(req: Request): string {
  const id = req.user?.userId || req.user?.sub || (req.user as any)?.id;
  if (!id) {
    throw new UnauthorizedError('User authentication required');
  }
  return id;
}

async function getEnforcedBranchId(req: Request, inputBranchId?: string): Promise<string> {
  const userId = req.user?.sub || req.user?.userId;
  const roleSlug = req.user?.role;

  // Super admin can inspect any requested branch
  if (roleSlug === 'super_admin') {
    if (inputBranchId) return inputBranchId;
    const vaults = await cashManagementRepo.findAllVaults();
    return vaults[0]?.branchId || '';
  }

  // Non-super-admin: fetch allowed branch IDs
  if (userId) {
    const userBranches = await prisma.userBranch.findMany({
      where: { userId },
      select: { branchId: true, isPrimary: true },
      orderBy: { isPrimary: 'desc' },
    });
    const hr = await prisma.hrEmployee.findFirst({
      where: { userId, branchId: { not: null } },
      select: { branchId: true },
    });
    const allowed = new Set<string>(userBranches.map((ub) => ub.branchId));
    if (hr?.branchId) allowed.add(hr.branchId);

    if (allowed.size > 0) {
      if (inputBranchId && allowed.has(inputBranchId)) {
        return inputBranchId;
      }
      return userBranches[0]?.branchId || hr?.branchId || Array.from(allowed)[0];
    }
  }

  if (inputBranchId) return inputBranchId;
  const vaults = await cashManagementRepo.findAllVaults();
  return vaults[0]?.branchId || '';
}

export const cashController = {
  // ── Overview ───────────────────────────────────────────────────────────────
  async getOverview(req: Request, res: Response) {
    await cashService.ensureCashManagementGLAccounts();
    const branchId = await getEnforcedBranchId(req, req.query.branchId as string);
    if (!branchId) {
      return res.json({ success: true, data: null });
    }
    const overview = await cashService.getCashDashboardOverview(branchId);
    res.json({ success: true, data: overview });
  },

  // ── Vaults ─────────────────────────────────────────────────────────────────
  async listVaults(_req: Request, res: Response) {
    await cashService.ensureCashManagementGLAccounts();
    const vaults = await cashManagementRepo.findAllVaults();
    res.json({ success: true, data: vaults });
  },

  async getVaultByBranch(req: Request, res: Response) {
    const branchId = await getEnforcedBranchId(req, req.params.branchId);
    const vault = await cashService.ensureVaultForBranch(branchId);
    res.json({ success: true, data: vault });
  },

  async updateVaultLimit(req: Request, res: Response) {
    const { id } = req.params;
    const { maxLimit } = req.body;
    const updated = await cashManagementRepo.updateVaultLimit(id, Number(maxLimit));
    res.json({ success: true, data: updated });
  },

  async recordVaultCheck(req: Request, res: Response) {
    const { branchId } = req.params;
    const userId = getUserId(req);
    const result = await cashService.recordVaultDailyCheck(branchId, req.body, userId);
    res.json({ success: true, data: result, message: 'Vault check recorded successfully.' });
  },

  async bankDeposit(req: Request, res: Response) {
    const { branchId } = req.params;
    const userId = getUserId(req);
    const transfer = await cashService.bankDeposit(branchId, req.body, userId);
    res.json({ success: true, data: transfer, message: 'Bank deposit executed and GL entries posted.' });
  },

  async bankWithdrawal(req: Request, res: Response) {
    const { branchId } = req.params;
    const userId = getUserId(req);
    const transfer = await cashService.bankWithdrawal(branchId, req.body, userId);
    res.json({ success: true, data: transfer, message: 'Bank withdrawal replenishment executed and GL entries posted.' });
  },

  // ── Tills & Sessions ───────────────────────────────────────────────────────
  async listTills(req: Request, res: Response) {
    const branchId = req.query.branchId as string | undefined;
    const tills = await cashManagementRepo.findAllTills(branchId);
    res.json({ success: true, data: tills });
  },

  async getActiveSession(req: Request, res: Response) {
    const userId = getUserId(req);
    const session = await cashService.getActiveTillSession(userId);
    res.json({ success: true, data: session });
  },

  async openSession(req: Request, res: Response) {
    const userId = getUserId(req);
    const session = await cashService.openTillSession(userId, req.body);
    res.status(201).json({ success: true, data: session, message: 'Till session opened successfully.' });
  },

  async closeSession(req: Request, res: Response) {
    const userId = getUserId(req);
    const { id } = req.params;
    const result = await cashService.closeTillSession(userId, id, req.body);
    res.json({ success: true, data: result, message: 'Till session closed successfully.' });
  },

  async listSessions(req: Request, res: Response) {
    const { branchId, tillId, userId, status, page, limit } = req.query;
    const data = await cashManagementRepo.findSessions({
      branchId: branchId as string,
      tillId: tillId as string,
      userId: userId as string,
      status: status as string,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    res.json({ success: true, data });
  },

  // ── Transfers ──────────────────────────────────────────────────────────────
  async listTransfers(req: Request, res: Response) {
    const { branchId, type, status, tillId, vaultId, page, limit } = req.query;
    const data = await cashManagementRepo.findTransfers({
      branchId: branchId as string,
      type: type as string,
      status: status as string,
      tillId: tillId as string,
      vaultId: vaultId as string,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    res.json({ success: true, data });
  },

  async requestCashFromVault(req: Request, res: Response) {
    const tellerId = getUserId(req);
    const branchId = await getEnforcedBranchId(req, req.body.branchId);
    if (!branchId) {
      throw new BadRequestError('Branch ID is required for cash request.');
    }
    const transfer = await cashService.requestCashFromVault(tellerId, {
      ...req.body,
      branchId,
    });
    res.status(201).json({ success: true, data: transfer, message: 'Cash request submitted to Vault.' });
  },

  async approveVaultCashIssue(req: Request, res: Response) {
    const approverId = getUserId(req);
    const { id } = req.params;
    const transfer = await cashService.approveVaultCashIssue(id, approverId);
    res.json({ success: true, data: transfer, message: 'Cash issue approved. Awaiting teller confirmation.' });
  },

  async confirmCashReceipt(req: Request, res: Response) {
    const receiverId = getUserId(req);
    const { id } = req.params;
    const transfer = await cashService.confirmCashReceipt(id, receiverId);
    res.json({ success: true, data: transfer, message: 'Cash receipt confirmed and GL entries posted.' });
  },

  async returnCashToVault(req: Request, res: Response) {
    const tellerId = getUserId(req);
    const branchId = await getEnforcedBranchId(req, req.body.branchId);
    if (!branchId) {
      throw new BadRequestError('Branch ID is required for cash return.');
    }
    const transfer = await cashService.initiateReturnToVault(tellerId, {
      ...req.body,
      branchId,
    });
    res.status(201).json({ success: true, data: transfer, message: 'Cash return initiated. Awaiting Head Cashier receipt confirmation.' });
  },

  async rejectTransfer(req: Request, res: Response) {
    const userId = getUserId(req);
    const { id } = req.params;
    const { reason } = req.body;
    const transfer = await cashService.rejectTransfer(id, userId, reason);
    res.json({ success: true, data: transfer, message: 'Transfer rejected.' });
  },

  // ── Variances ──────────────────────────────────────────────────────────────
  async listVariances(req: Request, res: Response) {
    const { branchId, status, type, page, limit } = req.query;
    const data = await cashManagementRepo.findVariances({
      branchId: branchId as string,
      status: status as string,
      type: type as string,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    res.json({ success: true, data });
  },

  async resolveVariance(req: Request, res: Response) {
    const resolverId = getUserId(req);
    const { id } = req.params;
    const updated = await cashService.resolveVariance(id, req.body, resolverId);
    res.json({ success: true, data: updated, message: 'Variance resolved successfully.' });
  },

  // ── Reports ────────────────────────────────────────────────────────────────
  async getDailyVaultPosition(req: Request, res: Response) {
    const branchId = await getEnforcedBranchId(req, req.query.branchId as string);
    const date = req.query.date as string | undefined;
    const report = await cashService.getDailyVaultPositionReport(branchId, date);
    res.json({ success: true, data: report });
  },

  async getTillSummary(req: Request, res: Response) {
    const branchId = await getEnforcedBranchId(req, req.query.branchId as string);
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const report = await cashService.getTillSummaryReport(branchId, startDate, endDate);
    res.json({ success: true, data: report });
  },

  async getVarianceReport(req: Request, res: Response) {
    const branchId = await getEnforcedBranchId(req, req.query.branchId as string);
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const report = await cashService.getCashVarianceReport(branchId, startDate, endDate);
    res.json({ success: true, data: report });
  },

  async getLimitBreaches(req: Request, res: Response) {
    const branchId = await getEnforcedBranchId(req, req.query.branchId as string);
    const report = await cashService.getLimitBreachesReport(branchId);
    res.json({ success: true, data: report });
  },
};
