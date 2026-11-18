import { Router } from 'express';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { rbac } from '../../shared/middleware/rbac.middleware';
import { validate } from '../../shared/middleware/validate.middleware';
import { auditLog } from '../../shared/middleware/audit-log.middleware';
import { depositSchema, withdrawalSchema } from '@coop/validation';
import * as savingsController from './savings.controller';

export const savingsRouter = Router();

savingsRouter.use(authMiddleware);

savingsRouter.post(
  '/deposit',
  rbac('admin', 'cashier', 'focal_agent'),
  validate(depositSchema),
  auditLog('SAVINGS_DEPOSIT', 'savings_txn'),
  savingsController.deposit
);

savingsRouter.post(
  '/withdrawal',
  rbac('admin', 'cashier', 'super_admin'),
  validate(withdrawalSchema),
  auditLog('SAVINGS_WITHDRAWAL', 'savings_txn'),
  savingsController.withdraw
);

savingsRouter.post(
  '/transfer',
  rbac('admin', 'cashier', 'super_admin'),
  auditLog('SAVINGS_TRANSFER', 'savings_txn'),
  savingsController.transfer
);

savingsRouter.get(
  '/products',
  savingsController.listProducts
);

savingsRouter.post(
  '/products',
  rbac('admin', 'super_admin'),
  savingsController.createProduct
);

savingsRouter.patch(
  '/products/:id',
  rbac('admin', 'super_admin'),
  savingsController.updateProduct
);

savingsRouter.delete(
  '/products/:id',
  rbac('admin', 'super_admin'),
  savingsController.deleteProduct
);

savingsRouter.get(
  '/txns',
  savingsController.listAllTxns
);

savingsRouter.get(
  '/',
  savingsController.listAllAccounts
);

savingsRouter.post(
  '/accounts',
  rbac('admin', 'cashier', 'focal_agent', 'crm_head'),
  auditLog('OPEN_SAVINGS_ACCOUNT', 'savings_account'),
  savingsController.openAccount
);

savingsRouter.get(
  '/accounts/:memberId',
  savingsController.getMemberAccounts
);

savingsRouter.get(
  '/transactions/:accountId',
  savingsController.getAccountTransactions
);

// ─── Standing Instructions ───────────────────────────────────────────────────

savingsRouter.get(
  '/standing-instructions',
  savingsController.listStandingInstructions
);

savingsRouter.post(
  '/standing-instructions',
  rbac('admin', 'cashier', 'super_admin'),
  auditLog('CREATE_STANDING_INSTRUCTION', 'standing_instruction'),
  savingsController.createStandingInstruction
);

savingsRouter.patch(
  '/standing-instructions/:id/status',
  rbac('admin', 'cashier', 'super_admin'),
  savingsController.updateInstructionStatus
);

savingsRouter.delete(
  '/standing-instructions/:id',
  rbac('admin', 'super_admin'),
  savingsController.deleteStandingInstruction
);

// ─── Accrual, Capitalization & Sweeps Automation Triggers ────────────────────

savingsRouter.post(
  '/accruals/run-daily',
  rbac('admin', 'super_admin'),
  savingsController.executeAccrualJob
);

savingsRouter.post(
  '/capitalization/run-batch',
  rbac('admin', 'super_admin'),
  savingsController.executeCapitalizationJob
);

savingsRouter.post(
  '/standing-instructions/run-sweeps',
  rbac('admin', 'super_admin'),
  savingsController.executeStandingInstructionsJob
);

// ─── Member Transaction Requests (Teller Queue & Processing) ─────────────────
savingsRouter.get(
  '/transaction-requests',
  rbac('admin', 'cashier', 'super_admin', 'focal_agent', 'crm_head'),
  savingsController.listTransactionRequests
);

savingsRouter.get(
  '/transaction-requests/:id',
  rbac('admin', 'cashier', 'super_admin', 'focal_agent', 'crm_head'),
  savingsController.getTransactionRequest
);

savingsRouter.post(
  '/transaction-requests/:id/approve',
  rbac('admin', 'cashier', 'super_admin'),
  auditLog('APPROVE_TRANSACTION_REQUEST', 'member_transaction_request'),
  savingsController.approveTransactionRequest
);

savingsRouter.post(
  '/transaction-requests/:id/reject',
  rbac('admin', 'cashier', 'super_admin'),
  auditLog('REJECT_TRANSACTION_REQUEST', 'member_transaction_request'),
  savingsController.rejectTransactionRequest
);
