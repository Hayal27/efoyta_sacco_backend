import { Request, Response } from 'express';
import * as service from './shares.service';
import * as dividendService from './dividend.service';

export async function getConfig(req: Request, res: Response) {
  const config = await service.getConfig();
  res.json({ status: 'success', data: config });
}

export async function updateConfig(req: Request, res: Response) {
  const config = await service.updateConfig(req.body);
  res.json({ status: 'success', data: config, message: 'Share configuration updated' });
}

export async function listAccounts(req: Request, res: Response) {
  const result = await service.listAccounts(req.query);
  res.json({ status: 'success', ...result });
}

export async function purchaseShares(req: Request, res: Response) {
  const txn = await service.purchaseShares(req.body, req.user!.sub);
  res.status(201).json({ status: 'success', data: txn, message: 'Shares purchased successfully' });
}

export async function transferShares(req: Request, res: Response) {
  const txn = await service.transferShares(req.body, req.user!.sub);
  res.status(201).json({ status: 'success', data: txn, message: 'Shares transferred successfully' });
}

export async function checkShareCompliance(req: Request, res: Response) {
  const result = await service.checkShareThresholdCompliance(req.params.memberId);
  res.json({ status: 'success', data: result });
}

export async function calculateDividends(req: Request, res: Response) {
  const result = await dividendService.calculateDividends(req.body);
  res.json({ status: 'success', data: result, message: 'Dividend run calculated successfully' });
}

export async function listDividendRuns(req: Request, res: Response) {
  const runs = await dividendService.listDividendRuns();
  res.json({ status: 'success', data: runs });
}

export async function approveDividendRun(req: Request, res: Response) {
  const run = await dividendService.approveDividendRun(req.params.id);
  res.json({ status: 'success', data: run, message: 'Dividend run approved' });
}

export async function postDividends(req: Request, res: Response) {
  const result = await dividendService.postDividendsToSavings(req.params.id, req.user!.sub);
  res.json({ status: 'success', data: result, message: 'Dividends posted to member savings accounts' });
}

export async function profitSummary(req: Request, res: Response) {
  const fiscalYear        = Number(req.query.fiscalYear) || new Date().getFullYear();
  const operatingExpenses = Number(req.query.operatingExpenses) || 0;
  const summary           = await dividendService.computeProfitSummary(fiscalYear, operatingExpenses);
  res.json({ status: 'success', data: summary });
}

export async function deleteDividendRun(req: Request, res: Response) {
  const result = await dividendService.deleteDividendRun(req.params.id);
  res.json({ status: 'success', data: result, message: 'Dividend run deleted successfully' });
}

export async function uploadSignedSchedule(req: Request, res: Response) {
  const { fileName, fileData } = req.body;
  const result = await dividendService.uploadSignedSchedule(req.params.id, fileName, fileData);
  res.json({ status: 'success', data: result, message: 'Signed schedule uploaded successfully' });
}

export async function listAllTxns(_req: Request, res: Response) {
  const txns = await service.listAllTxns();
  res.json({ status: 'success', data: txns });
}
