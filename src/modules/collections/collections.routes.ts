import { Router } from 'express';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { rbac } from '../../shared/middleware/rbac.middleware';
import { validate } from '../../shared/middleware/validate.middleware';
import { auditLog } from '../../shared/middleware/audit-log.middleware';
import { collectionSessionSchema, collectionEntrySchema, reconciliationSchema } from '@coop/validation';
import * as collectionsController from './collections.controller';

export const collectionsRouter = Router();

collectionsRouter.use(authMiddleware);

collectionsRouter.post(
  '/session',
  rbac('focal_agent', 'admin'),
  collectionsController.startSession
);

collectionsRouter.post(
  '/entry',
  rbac('focal_agent', 'admin'),
  validate(collectionEntrySchema),
  auditLog('COLLECTION_ENTRY', 'daily_collection'),
  collectionsController.recordEntry
);

collectionsRouter.post(
  '/reconcile',
  rbac('cashier', 'admin'),
  validate(reconciliationSchema),
  auditLog('COLLECTION_RECONCILE', 'daily_collection'),
  collectionsController.reconcile
);

collectionsRouter.post(
  '/handover-request',
  rbac('focal_agent', 'admin'),
  auditLog('COLLECTION_HANDOVER', 'daily_collection'),
  collectionsController.requestHandover
);

collectionsRouter.post(
  '/:id/receive',
  rbac('cashier', 'admin'),
  auditLog('COLLECTION_RECEIVE', 'daily_collection'),
  collectionsController.receiveHandover
);

collectionsRouter.post(
  '/:id/decline',
  rbac('cashier', 'admin'),
  auditLog('COLLECTION_DECLINE', 'daily_collection'),
  collectionsController.declineHandover
);

collectionsRouter.get('/pending-handovers', rbac('cashier', 'admin'), collectionsController.listPendingHandovers);
collectionsRouter.get('/my-transactions/:date/breakdown', collectionsController.getMyTransactionBreakdown);
collectionsRouter.get('/my-transactions', collectionsController.listMyTransactions);
collectionsRouter.get('/entries', collectionsController.listAllEntries);
collectionsRouter.get('/', collectionsController.listSessions);
collectionsRouter.get('/:id/breakdown', collectionsController.getSessionBreakdown);
collectionsRouter.get('/:id', collectionsController.getSession);
