import type { Request, Response } from 'express';
import { getDashboardStats } from './dashboard.repository';

export async function dashboardStats(_req: Request, res: Response): Promise<void> {
  const data = await getDashboardStats();
  res.json({ success: true, data });
}
