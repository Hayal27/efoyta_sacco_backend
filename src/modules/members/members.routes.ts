import { Router } from 'express';
import express from 'express';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { rbac } from '../../shared/middleware/rbac.middleware';
import { validate } from '../../shared/middleware/validate.middleware';
import { auditLog } from '../../shared/middleware/audit-log.middleware';
import { memberSchema, updateMemberSchema, memberSearchSchema } from '@coop/validation';
import * as membersController from './members.controller';

export const membersRouter = Router();

// All member routes require auth
membersRouter.use(authMiddleware);

membersRouter.get(
  '/',
  validate(memberSearchSchema, 'query'),
  membersController.listMembers
);

// Real-time member uniqueness pre-check for Phone, Email, Fayda FAN, and Fayda FIN
membersRouter.get(
  '/check-unique',
  membersController.checkUniqueness
);

membersRouter.post(
  '/',
  rbac('super_admin', 'admin', 'focal_agent', 'cashier'),
  validate(memberSchema),
  auditLog('CREATE_MEMBER', 'member'),
  membersController.createMember
);

membersRouter.get(
  '/:id',
  membersController.getMember
);

membersRouter.patch(
  '/:id',
  rbac('super_admin', 'admin', 'focal_agent', 'crm_head', 'cashier'),
  validate(updateMemberSchema),
  auditLog('UPDATE_MEMBER', 'member', 'members'),
  membersController.updateMember
);

membersRouter.patch(
  '/:id/status',
  rbac('admin', 'cashier'),
  auditLog('CHANGE_MEMBER_STATUS', 'member', 'members'),
  membersController.updateStatus
);

membersRouter.get(
  '/:id/summary',
  membersController.getMemberSummary
);

membersRouter.get(
  '/:id/portfolio',
  membersController.getMember360Portfolio
);

membersRouter.get(
  '/:id/documents',
  membersController.getMemberDocuments
);

membersRouter.post(
  '/:id/documents',
  express.json({ limit: '20mb' }),  // base64 file data can be large
  rbac('super_admin', 'admin', 'focal_agent', 'cashier', 'crm_head'),
  auditLog('UPLOAD_MEMBER_DOCUMENT', 'member_document'),
  membersController.uploadMemberDocument
);

// Authenticated file serve – streams KYC files stored on disk
membersRouter.get(
  '/kyc/file',
  membersController.serveKycDocument
);

membersRouter.post(
  '/documents/:docId/verify',
  rbac('super_admin', 'admin'),
  auditLog('VERIFY_MEMBER_DOCUMENT', 'member_document'),
  membersController.verifyMemberDocument
);

// ─── Commercial Bank Accounts (CBE, Abyssinia, etc.) ─────────────────────────
membersRouter.get(
  '/:id/bank-accounts',
  membersController.listMemberBankAccounts
);

membersRouter.post(
  '/:id/bank-accounts',
  rbac('super_admin', 'admin', 'focal_agent', 'cashier', 'crm_head'),
  auditLog('ADD_MEMBER_BANK_ACCOUNT', 'member_bank_account'),
  membersController.addMemberBankAccount
);

membersRouter.put(
  '/:id/bank-accounts/:accountId',
  rbac('super_admin', 'admin', 'focal_agent', 'cashier', 'crm_head'),
  auditLog('UPDATE_MEMBER_BANK_ACCOUNT', 'member_bank_account'),
  membersController.updateMemberBankAccount
);

membersRouter.delete(
  '/:id/bank-accounts/:accountId',
  rbac('super_admin', 'admin', 'cashier'),
  auditLog('DELETE_MEMBER_BANK_ACCOUNT', 'member_bank_account'),
  membersController.deleteMemberBankAccount
);

// ─── Member Biometrics & Profile Visual Media ─────────────────────────────────
membersRouter.put(
  '/:id/biometrics',
  rbac('super_admin', 'admin', 'focal_agent', 'cashier', 'crm_head'),
  auditLog('UPDATE_MEMBER_BIOMETRICS', 'member'),
  membersController.updateMemberBiometrics
);

membersRouter.post(
  '/:id/upload-media',
  express.json({ limit: '25mb' }),
  rbac('super_admin', 'admin', 'focal_agent', 'cashier', 'crm_head'),
  auditLog('UPLOAD_MEMBER_MEDIA', 'member'),
  membersController.uploadMemberMedia
);

