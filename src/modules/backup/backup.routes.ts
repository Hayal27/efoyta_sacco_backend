import { Router } from 'express';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { rbac } from '../../shared/middleware/rbac.middleware';
import { auditLog } from '../../shared/middleware/audit-log.middleware';
import * as backupController from './backup.controller';

export const backupRouter = Router();

backupRouter.use(authMiddleware);
backupRouter.use(rbac('super_admin', 'admin', 'auditor'));

backupRouter.get('/', backupController.listBackups);
backupRouter.get('/schedule', backupController.getScheduleConfig);
backupRouter.put('/schedule', auditLog('UPDATE_BACKUP_SCHEDULE', 'backup_schedule'), backupController.updateScheduleConfig);
backupRouter.post('/schedule/run-now', auditLog('RUN_SCHEDULED_BACKUP', 'backup_schedule'), backupController.runScheduledBackupNow);
backupRouter.post('/create', auditLog('CREATE_BACKUP', 'backup'), backupController.createFullBackup);
backupRouter.get('/download/:filename', backupController.downloadBackup);
backupRouter.get('/export-module/:moduleName', backupController.exportModule);
backupRouter.delete('/:filename', auditLog('DELETE_BACKUP', 'backup'), backupController.deleteBackup);
backupRouter.post('/restore', auditLog('RESTORE_BACKUP', 'backup'), backupController.restoreSnapshot);
