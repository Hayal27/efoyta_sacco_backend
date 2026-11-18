import { Router } from 'express';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { rbac } from '../../shared/middleware/rbac.middleware';
import { auditLog } from '../../shared/middleware/audit-log.middleware';
import * as usersController from './users.controller';

export const usersRouter = Router();

// Allow super_admin and admin (and hr_manager for read) to manage users
usersRouter.use(authMiddleware);

usersRouter.get('/', rbac('super_admin', 'admin', 'hr_manager', 'hr_admin'), usersController.listUsers);
usersRouter.post('/', rbac('super_admin', 'admin'), auditLog('CREATE_USER', 'users'), usersController.createUser);
usersRouter.patch('/:id', rbac('super_admin', 'admin'), auditLog('UPDATE_USER', 'users'), usersController.updateUser);
usersRouter.patch('/:id/reset-password', rbac('super_admin', 'admin'), auditLog('RESET_PASSWORD', 'users'), usersController.resetPassword);
usersRouter.patch('/focal-agents/:id/crm', rbac('super_admin', 'admin'), auditLog('ASSIGN_CRM', 'users'), usersController.assignCrm);
