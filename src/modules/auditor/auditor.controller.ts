import { Request, Response } from 'express';
import * as auditorService from './auditor.service';

export async function getTransactions(req: Request, res: Response) {
  try {
    const result = await auditorService.getAllTransactions(req.query);
    res.json({ status: 'success', ...result });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to fetch transactions' });
  }
}

export async function getAnalytics(req: Request, res: Response) {
  try {
    const result = await auditorService.getTransactionAnalytics();
    res.json({ status: 'success', data: result });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to fetch analytics' });
  }
}
