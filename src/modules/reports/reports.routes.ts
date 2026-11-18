import { Router } from 'express';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { rbac } from '../../shared/middleware/rbac.middleware';
import * as reportsController from './reports.controller';

export const reportsRouter = Router();

reportsRouter.use(authMiddleware);

// All reports are generally viewable by super_admin, admin, auditor, cashier, focal_agent, crm_head
reportsRouter.use(rbac('super_admin', 'admin', 'auditor', 'cashier', 'focal_agent', 'crm_head'));

reportsRouter.get('/dashboard/self', reportsController.getSelfServiceDashboard);
reportsRouter.get('/dashboard/crm', reportsController.getCrmDashboard);
reportsRouter.get('/dashboard/branch', reportsController.getBranchDashboard);
reportsRouter.get('/dashboard/coop', reportsController.getCoopDashboard);
reportsRouter.get('/savings', reportsController.getSavingsReport);
reportsRouter.get('/loans', reportsController.getLoansReport);
reportsRouter.get('/collections', reportsController.getCollectionsReport);
reportsRouter.get('/grand-summary', reportsController.getGrandSummary);
reportsRouter.get('/crm-follow-up', reportsController.getCrmFollowUp);
reportsRouter.get('/member-detail/:memberId', reportsController.getMemberTxnDetail);
