import { Router } from 'express';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { rbac } from '../../shared/middleware/rbac.middleware';
import { cashController } from './cash-management.controller';

export const cashManagementRouter = Router();

// All cash management endpoints require an authenticated user
cashManagementRouter.use(authMiddleware);

// ── Overview ─────────────────────────────────────────────────────────────────
cashManagementRouter.get('/overview', cashController.getOverview);

// ── Vaults ───────────────────────────────────────────────────────────────────
cashManagementRouter.get('/vaults', cashController.listVaults);
cashManagementRouter.get('/vaults/:branchId', cashController.getVaultByBranch);
cashManagementRouter.patch(
  '/vaults/:id/limit',
  rbac('admin', 'super_admin', 'head_cashier'),
  cashController.updateVaultLimit,
);
cashManagementRouter.post(
  '/vaults/:branchId/check',
  rbac('admin', 'super_admin', 'head_cashier', 'cashier'),
  cashController.recordVaultCheck,
);
cashManagementRouter.post(
  '/vaults/:branchId/bank-deposit',
  rbac('admin', 'super_admin', 'head_cashier'),
  cashController.bankDeposit,
);
cashManagementRouter.post(
  '/vaults/:branchId/bank-withdrawal',
  rbac('admin', 'super_admin', 'head_cashier'),
  cashController.bankWithdrawal,
);

// ── Tills & Sessions ─────────────────────────────────────────────────────────
cashManagementRouter.get('/tills', cashController.listTills);
cashManagementRouter.get('/tills/active-session', cashController.getActiveSession);
cashManagementRouter.post('/tills/sessions/open', cashController.openSession);
cashManagementRouter.post('/tills/sessions/:id/close', cashController.closeSession);
cashManagementRouter.get('/tills/sessions', cashController.listSessions);

// ── Transfers (Vault ↔ Till) ─────────────────────────────────────────────────
cashManagementRouter.get('/transfers', cashController.listTransfers);
cashManagementRouter.post('/transfers/request-issue', cashController.requestCashFromVault);
cashManagementRouter.post(
  '/transfers/:id/approve',
  rbac('admin', 'super_admin', 'head_cashier'),
  cashController.approveVaultCashIssue,
);
cashManagementRouter.post('/transfers/:id/confirm', cashController.confirmCashReceipt);
cashManagementRouter.post('/transfers/return', cashController.returnCashToVault);
cashManagementRouter.post('/transfers/:id/reject', cashController.rejectTransfer);

// ── Variances ────────────────────────────────────────────────────────────────
cashManagementRouter.get('/variances', cashController.listVariances);
cashManagementRouter.patch(
  '/variances/:id/resolve',
  rbac('admin', 'super_admin', 'head_cashier', 'auditor'),
  cashController.resolveVariance,
);

// ── Reports ──────────────────────────────────────────────────────────────────
cashManagementRouter.get('/reports/daily-vault-position', cashController.getDailyVaultPosition);
cashManagementRouter.get('/reports/till-summary', cashController.getTillSummary);
cashManagementRouter.get('/reports/variance', cashController.getVarianceReport);
cashManagementRouter.get('/reports/limit-breaches', cashController.getLimitBreaches);
