import { Router } from 'express';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { rbac } from '../../shared/middleware/rbac.middleware';
import * as rolesController from './roles.controller';

export const rolesRouter = Router();

rolesRouter.use(authMiddleware);
rolesRouter.use(rbac('super_admin', 'admin')); // Only admins can manage roles

rolesRouter.get('/', rolesController.listRoles);
rolesRouter.post('/', rolesController.createRole);
rolesRouter.get('/:id', rolesController.getRole);
rolesRouter.patch('/:id', rolesController.updateRole);
rolesRouter.delete('/:id', rolesController.deleteRole);
rolesRouter.patch('/:id/menus', rolesController.updateRoleMenus);
