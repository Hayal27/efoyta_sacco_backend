import { Router } from 'express';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { rbac } from '../../shared/middleware/rbac.middleware';
import * as branchesController from './branches.controller';

export const branchesRouter = Router();

branchesRouter.use(authMiddleware);

// Branch CRUD — admin only
branchesRouter.get('/', branchesController.listBranches);
branchesRouter.get('/my-branches', branchesController.getMyBranches);
branchesRouter.post('/', rbac('admin'), branchesController.createBranch);
branchesRouter.get('/:id', branchesController.getBranch);
branchesRouter.patch('/:id', rbac('admin'), branchesController.updateBranch);
branchesRouter.delete('/:id', rbac('admin'), branchesController.deleteBranch);

// User assignment
branchesRouter.post('/:id/users', rbac('admin'), branchesController.assignUser);
branchesRouter.delete('/:id/users/:userId', rbac('admin'), branchesController.removeUser);
