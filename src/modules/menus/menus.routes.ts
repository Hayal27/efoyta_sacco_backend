import { Router } from 'express';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { rbac } from '../../shared/middleware/rbac.middleware';
import * as menusController from './menus.controller';

export const menusRouter = Router();

menusRouter.use(authMiddleware);

// Get available menu tree for the logged-in user
menusRouter.get('/my-menus', menusController.getMyMenus);

// Full menu management (super_admin, admin)
menusRouter.get('/', rbac('super_admin', 'admin'), menusController.listMenus);
menusRouter.post('/', rbac('super_admin'), menusController.createMenu);
menusRouter.patch('/:id', rbac('super_admin'), menusController.updateMenu);
menusRouter.delete('/:id', rbac('super_admin'), menusController.deleteMenu);
