import { Router } from 'express';
import type { Request, Response } from 'express';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { getUnreadAlerts, markAlertRead, markAllAlertsRead } from './alerts.service';

export const notificationsRouter = Router();

// All alert routes require authentication
notificationsRouter.use(authMiddleware);

// GET /notifications/alerts  — unread alerts for the logged-in user
notificationsRouter.get('/alerts', async (req: Request, res: Response) => {
  const alerts = await getUnreadAlerts(req.user!.sub);
  res.json({ success: true, data: alerts });
});

// PATCH /notifications/alerts/read-all  — dismiss all unread (must be before /:id/read)
notificationsRouter.patch('/alerts/read-all', async (req: Request, res: Response) => {
  await markAllAlertsRead(req.user!.sub);
  res.json({ success: true });
});

// PATCH /notifications/alerts/:id/read  — mark one alert read
notificationsRouter.patch('/alerts/:id/read', async (req: Request, res: Response) => {
  await markAlertRead(req.params.id, req.user!.sub);
  res.json({ success: true });
});

// ── Legacy SMS/Email notification routes ──────────────────────────────────────
notificationsRouter.get('/', (_req, res) => {
  res.json({ success: true, data: [] });
});

notificationsRouter.post('/:id/resend', (_req, res) => {
  res.json({ success: true, message: 'Notification queued for resend' });
});
