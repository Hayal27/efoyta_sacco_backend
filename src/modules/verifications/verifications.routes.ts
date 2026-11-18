import { Router } from 'express';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { rbac } from '../../shared/middleware/rbac.middleware';
import { auditLog } from '../../shared/middleware/audit-log.middleware';
import * as controller from './verifications.controller';

export const verificationsRouter = Router();

// ── Public Endpoints (Member Self-Service & Offline Keyphrase Recovery) ──
verificationsRouter.post('/activate', controller.verifyOtp);
verificationsRouter.post('/verify-keyphrase', controller.verifyKeyphrase);

// ── Internal Staff Security Console (Authenticated) ──────────────────────
verificationsRouter.use(authMiddleware);

// Accounts listing with pagination, filtering, searching and analytics
verificationsRouter.get(
  '/accounts',
  rbac('super_admin', 'admin', 'auditor', 'branch_manager', 'compliance_officer'),
  controller.getAccounts
);

// One-click staff manual verification
verificationsRouter.post(
  '/accounts/:id/manual-verify',
  rbac('super_admin', 'admin', 'branch_manager', 'compliance_officer'),
  auditLog('MANUAL_VERIFY_USER', 'users'),
  controller.manualVerify
);

// Resend OTP activation code via SMS & Email
verificationsRouter.post(
  '/accounts/:id/resend-code',
  rbac('super_admin', 'admin', 'branch_manager'),
  controller.resendCode
);

// Toggle account lockout
verificationsRouter.post(
  '/accounts/:id/toggle-lock',
  rbac('super_admin', 'admin', 'branch_manager', 'compliance_officer'),
  auditLog('TOGGLE_USER_LOCK', 'users'),
  controller.toggleLock
);

// Toggle 2FA enforcement
verificationsRouter.post(
  '/accounts/:id/toggle-2fa',
  rbac('super_admin', 'admin'),
  auditLog('TOGGLE_USER_2FA', 'users'),
  controller.toggle2FA
);

// Reset / generate 12-word cryptographic security keyphrase
verificationsRouter.post(
  '/accounts/:id/reset-keyphrase',
  rbac('super_admin', 'admin', 'branch_manager'),
  auditLog('RESET_USER_KEYPHRASE', 'users'),
  controller.resetKeyphrase
);
