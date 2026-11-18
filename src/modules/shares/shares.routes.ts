import { Router } from 'express';
import * as controller from './shares.controller';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { rbac } from '../../shared/middleware/rbac.middleware';
import { validate } from '../../shared/middleware/validate.middleware';
import { auditLog } from '../../shared/middleware/audit-log.middleware';
import { z } from 'zod';

export const sharesRouter = Router();

sharesRouter.use(authMiddleware);

const purchaseSchema = z.object({
  memberId: z.string().uuid(),
  shares: z.number().int().positive(),
  paymentMethod: z.enum(['cash', 'bank', 'mobile_money']),
  txnDate: z.string().datetime(),
  focalAgentId: z.string().uuid().optional(),
});

const transferSchema = z.object({
  fromMemberId: z.string().uuid(),
  toMemberId: z.string().uuid(),
  shares: z.number().int().positive(),
  txnDate: z.string().datetime(),
  focalAgentId: z.string().uuid().optional(),
});

const configSchema = z.object({
  sharePrice: z.number().positive().optional(),
  totalAvailable: z.number().int().min(0).optional(),
  minPerMember: z.number().int().min(1).optional(),
  maxPerMember: z.number().int().min(0).optional(),
});

sharesRouter.get('/config', controller.getConfig);
sharesRouter.put('/config', rbac('super_admin', 'admin'), validate(configSchema), controller.updateConfig);

sharesRouter.get('/accounts', controller.listAccounts);
sharesRouter.get('/txns', controller.listAllTxns);

sharesRouter.post('/purchase', rbac('super_admin', 'admin', 'cashier', 'focal_agent'), validate(purchaseSchema), auditLog('SHARE_PURCHASE', 'share_txn'), controller.purchaseShares);
sharesRouter.post('/transfer', rbac('super_admin', 'admin', 'focal_agent'), validate(transferSchema), auditLog('SHARE_TRANSFER', 'share_txn'), controller.transferShares);

sharesRouter.get('/members/:memberId/compliance', controller.checkShareCompliance);

sharesRouter.get('/dividends', controller.listDividendRuns);
sharesRouter.get('/dividends/profit-summary', rbac('super_admin', 'admin'), controller.profitSummary);
sharesRouter.post('/dividends/calculate', rbac('super_admin', 'admin'), controller.calculateDividends);
sharesRouter.post('/dividends/:id/approve', rbac('super_admin', 'admin'), controller.approveDividendRun);
sharesRouter.post('/dividends/:id/post', rbac('super_admin', 'admin'), controller.postDividends);
sharesRouter.post('/dividends/:id/signed-schedule', rbac('super_admin', 'admin'), controller.uploadSignedSchedule);
sharesRouter.delete('/dividends/:id', rbac('super_admin', 'admin'), controller.deleteDividendRun);



