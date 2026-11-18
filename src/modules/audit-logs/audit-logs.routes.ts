import { Router } from 'express';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { rbac } from '../../shared/middleware/rbac.middleware';
import * as auditLogsController from './audit-logs.controller';

export const auditLogsRouter = Router();

// Only specific roles can access audit logs
auditLogsRouter.use(authMiddleware);
auditLogsRouter.use(rbac('super_admin', 'admin', 'auditor'));

auditLogsRouter.get('/', auditLogsController.listAuditLogs);
auditLogsRouter.get('/analytics', auditLogsController.getAuditAnalytics);
auditLogsRouter.get('/export', auditLogsController.exportAuditLogs);
auditLogsRouter.get('/:id', auditLogsController.getAuditLog);
