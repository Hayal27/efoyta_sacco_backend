import { Router } from 'express';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { rbac } from '../../shared/middleware/rbac.middleware';
import { auditLog } from '../../shared/middleware/audit-log.middleware';
import * as ctrl from './loans.controller';

export const loansRouter = Router();

loansRouter.use(authMiddleware);

// ── Loan Products (config) ────────────────────────────────────────────────────
loansRouter.get('/products', ctrl.listProducts);
loansRouter.get('/products/:id', ctrl.getProduct);
loansRouter.post('/products', rbac('super_admin', 'admin'), ctrl.createProduct);
loansRouter.put('/products/:id', rbac('super_admin', 'admin'), ctrl.updateProduct);

// ── Eligibility check ─────────────────────────────────────────────────────────
loansRouter.get('/eligibility', ctrl.checkEligibility);
loansRouter.get('/member-eligibility/:memberId', ctrl.getMemberEligibilitySummary);

// ── Loans ─────────────────────────────────────────────────────────────────────
loansRouter.get('/', ctrl.listLoans);
loansRouter.get('/control-room', ctrl.getLoanControlRoomStats);
loansRouter.post('/reset-data', rbac('super_admin', 'admin'), ctrl.resetTransactions);
loansRouter.get('/repayments', ctrl.listRepayments);
loansRouter.get(
  '/disbursement',
  rbac('super_admin', 'admin', 'cashier'),
  ctrl.listApprovedLoans,
);
loansRouter.get('/:id', ctrl.getLoan);
loansRouter.get('/:id/schedule', ctrl.getRepaymentSchedule);

loansRouter.post(
  '/apply',
  rbac('admin', 'focal_agent', 'cashier'),
  auditLog('LOAN_APPLY', 'loan'),
  ctrl.apply,
);

loansRouter.patch(
  '/:id/review',
  rbac('admin', 'super_admin'),
  auditLog('LOAN_REVIEW', 'loan', 'loans'),
  ctrl.reviewLoan,
);

loansRouter.patch(
  '/:id/approve',
  rbac('super_admin'),
  auditLog('LOAN_APPROVE', 'loan', 'loans'),
  ctrl.approveLoan,
);

loansRouter.post(
  '/:id/disburse',
  rbac('super_admin', 'admin', 'cashier'),
  auditLog('LOAN_DISBURSE', 'loan', 'loans'),
  ctrl.disburseLoan,
);

loansRouter.post(
  '/:id/resubmit',
  rbac('admin', 'focal_agent', 'cashier'),
  auditLog('LOAN_RESUBMIT', 'loan'),
  ctrl.resubmitLoan,
);

loansRouter.post(
  '/repay',
  rbac('admin', 'cashier', 'focal_agent', 'crm_head'),
  auditLog('LOAN_REPAY', 'repayment'),
  ctrl.repay,
);

loansRouter.post(
  '/automation/classify-assets',
  rbac('admin', 'super_admin'),
  ctrl.runAssetClassification,
);

loansRouter.post(
  '/:id/guarantors',
  rbac('super_admin', 'admin', 'focal_agent'),
  auditLog('LOAN_ADD_GUARANTOR', 'loan'),
  ctrl.addGuarantorToLoan,
);
