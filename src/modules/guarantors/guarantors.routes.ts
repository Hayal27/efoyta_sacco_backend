import { Router } from 'express';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import * as ctrl from './guarantors.controller';

export const guarantorsRouter = Router();

guarantorsRouter.use(authMiddleware);

guarantorsRouter.get('/', ctrl.list);
guarantorsRouter.get('/:id', ctrl.getOne);
guarantorsRouter.post('/', ctrl.create);
guarantorsRouter.put('/:id', ctrl.update);
guarantorsRouter.delete('/:id', ctrl.remove);
