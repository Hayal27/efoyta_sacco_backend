import type { Request, Response } from 'express';
import * as savingsService from './savings.service';
import * as standingService from './standing-instructions.service';
import * as txnRequestsService from './transaction-requests.service';
import { runDailyInterestAccrual } from '../../shared/jobs/interest-accrual.job';
import { runInterestCapitalizationBatch } from '../../shared/jobs/interest-capitalization.job';

export async function deposit(req: Request, res: Response): Promise<void> {
  const txn = await savingsService.deposit(req.body, req.user!.sub);
  res.status(201).json({ success: true, data: txn });
}

export async function withdraw(req: Request, res: Response): Promise<void> {
  const txn = await savingsService.withdraw(req.body, req.user!.sub);
  res.status(201).json({ success: true, data: txn });
}

export async function transfer(req: Request, res: Response): Promise<void> {
  const txns = await savingsService.transfer(req.body, req.user!.sub);
  res.status(201).json({ success: true, data: txns });
}

export async function openAccount(req: Request, res: Response): Promise<void> {
  const account = await savingsService.openAccount(req.body, req.user!.sub);
  res.status(201).json({ success: true, data: account });
}

export async function getMemberAccounts(req: Request, res: Response): Promise<void> {
  const accounts = await savingsService.getMemberAccounts(req.params.memberId);
  res.json({ success: true, data: accounts });
}

export async function getAccountTransactions(req: Request, res: Response): Promise<void> {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const result = await savingsService.getAccountTransactions(req.params.accountId, page, limit);
  res.json({ success: true, ...result });
}

export async function listAllAccounts(req: Request, res: Response): Promise<void> {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const query = req.query.query as string | undefined;
  const result = await savingsService.listAllAccounts(page, limit, query);
  res.json({ success: true, ...result });
}

export async function listProducts(_req: Request, res: Response): Promise<void> {
  const products = await savingsService.listProducts();
  res.json({ success: true, data: products });
}

export async function createProduct(req: Request, res: Response): Promise<void> {
  const product = await savingsService.createProduct(req.body);
  res.status(201).json({ success: true, data: product });
}

export async function updateProduct(req: Request, res: Response): Promise<void> {
  const product = await savingsService.updateProduct(req.params.id, req.body);
  res.json({ success: true, data: product });
}

export async function deleteProduct(req: Request, res: Response): Promise<void> {
  await savingsService.deleteProduct(req.params.id);
  res.json({ success: true, message: 'Product deleted' });
}

export async function listAllTxns(_req: Request, res: Response): Promise<void> {
  const txns = await savingsService.listAllTxns();
  res.json({ success: true, data: txns });
}

// ─── Standing Instructions & Accrual/Capitalization Triggers ────────────────────

export async function createStandingInstruction(req: Request, res: Response): Promise<void> {
  const result = await standingService.createStandingInstruction(req.body, req.user!.sub);
  res.status(201).json({ success: true, data: result });
}

export async function listStandingInstructions(req: Request, res: Response): Promise<void> {
  const memberId = req.query.memberId as string | undefined;
  const result = await standingService.listStandingInstructions(memberId);
  res.json({ success: true, data: result });
}

export async function updateInstructionStatus(req: Request, res: Response): Promise<void> {
  const result = await standingService.updateInstructionStatus(req.params.id, req.body.status);
  res.json({ success: true, data: result });
}

export async function deleteStandingInstruction(req: Request, res: Response): Promise<void> {
  await standingService.deleteStandingInstruction(req.params.id);
  res.json({ success: true, message: 'Standing instruction deleted' });
}

export async function executeAccrualJob(_req: Request, res: Response): Promise<void> {
  const result = await runDailyInterestAccrual();
  res.json({ success: true, message: 'Daily interest accrual completed', data: result });
}

export async function executeCapitalizationJob(req: Request, res: Response): Promise<void> {
  const result = await runInterestCapitalizationBatch(req.user!.sub);
  res.json({ success: true, message: 'Periodic interest capitalization completed', data: result });
}

export async function executeStandingInstructionsJob(req: Request, res: Response): Promise<void> {
  const result = await standingService.executeDueStandingInstructions(req.user!.sub);
  res.json({ success: true, message: 'Standing instructions sweep completed', data: result });
}

// ── Member Transaction Requests (Teller Queue & Processing) ─────────────────

export async function listTransactionRequests(req: Request, res: Response): Promise<void> {
  const result = await txnRequestsService.listTransactionRequests(req.query);
  res.json({ success: true, ...result });
}

export async function getTransactionRequest(req: Request, res: Response): Promise<void> {
  const result = await txnRequestsService.getTransactionRequestById(req.params.id);
  res.json({ success: true, data: result });
}

export async function approveTransactionRequest(req: Request, res: Response): Promise<void> {
  const result = await txnRequestsService.approveTransactionRequest(
    req.params.id,
    req.user!.sub,
    req.body
  );
  res.json(result);
}

export async function rejectTransactionRequest(req: Request, res: Response): Promise<void> {
  const result = await txnRequestsService.rejectTransactionRequest(
    req.params.id,
    req.user!.sub,
    req.body.reason
  );
  res.json(result);
}
