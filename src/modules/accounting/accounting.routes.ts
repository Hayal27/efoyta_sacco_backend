import { Router } from 'express';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { rbac } from '../../shared/middleware/rbac.middleware';
import { auditLog } from '../../shared/middleware/audit-log.middleware';
import * as ctrl from './accounting.controller';

export const accountingRouter = Router();

accountingRouter.use(authMiddleware);

// ── Chart of Accounts ──
accountingRouter.get('/chart-of-accounts', ctrl.getChartOfAccounts);

// ── Journal Entries ──
accountingRouter.get('/journal-entries', ctrl.listJournalEntries);
accountingRouter.post(
  '/journal-entries',
  rbac('super_admin', 'admin', 'cashier'),
  auditLog('JOURNAL_ENTRY_CREATE', 'gl_account'),
  ctrl.createJournalEntry
);

// ── Financial Statement Compilers ──
accountingRouter.get('/reports/trial-balance', ctrl.getTrialBalance);
accountingRouter.get('/reports/balance-sheet', ctrl.getBalanceSheet);
accountingRouter.get('/reports/profit-loss', ctrl.getProfitAndLoss);

// ── Asset & Risk Loss Reserves ──
accountingRouter.get('/fixed-assets', ctrl.listFixedAssets);
accountingRouter.post('/fixed-assets', rbac('super_admin', 'admin'), ctrl.createFixedAsset);
accountingRouter.post('/fixed-assets/run-depreciation', rbac('super_admin', 'admin'), ctrl.runDepreciationBatch);
accountingRouter.get('/loan-risk-reserves', ctrl.getLoanRiskReserves);
