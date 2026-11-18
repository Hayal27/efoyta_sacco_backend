import { Router } from 'express';
import * as auditorController from './auditor.controller';
import { authMiddleware } from '../../shared/middleware/auth.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/transactions', auditorController.getTransactions);
router.get('/analytics', auditorController.getAnalytics);

export default router;
