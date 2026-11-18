import { Request, Response } from 'express';
import * as service from './accounting.service';

export async function getChartOfAccounts(_req: Request, res: Response) {
  const accounts = await service.getChartOfAccounts();
  res.json({ status: 'success', data: accounts });
}

export async function createJournalEntry(req: Request, res: Response) {
  const entry = await service.createJournalEntry({
    ...req.body,
    postedById: req.user?.sub,
  });
  res.status(201).json({ status: 'success', data: entry, message: 'Journal entry created and posted successfully.' });
}

export async function listJournalEntries(req: Request, res: Response) {
  const page = parseInt(req.query.page as string, 10) || 1;
  const limit = parseInt(req.query.limit as string, 10) || 50;
  const result = await service.listJournalEntries({ page, limit });
  res.json({ status: 'success', ...result });
}

export async function getTrialBalance(_req: Request, res: Response) {
  const trialBalance = await service.generateTrialBalance();
  res.json({ status: 'success', data: trialBalance });
}

export async function getBalanceSheet(_req: Request, res: Response) {
  const balanceSheet = await service.generateBalanceSheet();
  res.json({ status: 'success', data: balanceSheet });
}

export async function getProfitAndLoss(_req: Request, res: Response) {
  const pnl = await service.generateProfitAndLoss();
  res.json({ status: 'success', data: pnl });
}

export async function listFixedAssets(_req: Request, res: Response) {
  const assets = await service.listFixedAssets();
  res.json({ status: 'success', data: assets });
}

export async function createFixedAsset(req: Request, res: Response) {
  const asset = await service.createFixedAsset(req.body);
  res.status(201).json({ status: 'success', data: asset, message: 'Fixed asset registered successfully.' });
}

export async function runDepreciationBatch(_req: Request, res: Response) {
  const result = await service.runAssetDepreciationBatch();
  res.json({ status: 'success', data: result, message: 'Fixed asset depreciation batch executed successfully.' });
}

export async function getLoanRiskReserves(_req: Request, res: Response) {
  const reserves = await service.calculateLoanRiskReserves();
  res.json({ status: 'success', data: reserves });
}
