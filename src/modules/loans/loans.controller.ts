import { Request, Response } from 'express';
import * as service from './loans.service';
import { getUserBranchIds } from '../../shared/utils/branch.utils';

// ── Product Endpoints ──────────────────────────────────────────────────────────

export async function listProducts(_req: Request, res: Response) {
  const products = await service.listProducts();
  res.json({ status: 'success', data: products });
}

export async function getProduct(req: Request, res: Response) {
  const product = await service.getProduct(req.params.id);
  res.json({ status: 'success', data: product });
}

export async function createProduct(req: Request, res: Response) {
  const product = await service.createProduct(req.body);
  res.status(201).json({ status: 'success', data: product, message: 'Loan product created' });
}

export async function updateProduct(req: Request, res: Response) {
  const product = await service.updateProduct(req.params.id, req.body);
  res.json({ status: 'success', data: product, message: 'Loan product updated' });
}

// ── Eligibility Check ──────────────────────────────────────────────────────────

export async function checkEligibility(req: Request, res: Response) {
  const { loanProductId, memberId, principal } = req.query as any;
  const result = await service.checkLoanEligibility(loanProductId, memberId, Number(principal));
  res.json({ status: 'success', data: result });
}

export async function getMemberEligibilitySummary(req: Request, res: Response) {
  const summary = await service.getMemberEligibilitySummary(req.params.memberId);
  res.json({ status: 'success', data: summary });
}

// ── Loan Endpoints ────────────────────────────────────────────────────────────

export async function apply(req: Request, res: Response) {
  const loan = await service.apply(req.body);
  res.status(201).json({ status: 'success', data: loan, message: 'Loan application submitted' });
}

export async function reviewLoan(req: Request, res: Response) {
  const { action, note } = req.body;
  const loan = await service.reviewLoan(req.params.id, action, note, req.user!.sub);
  res.json({ status: 'success', data: loan, message: `Loan ${action === 'forward' ? 'forwarded for approval' : 'rejected'} successfully` });
}

export async function approveLoan(req: Request, res: Response) {
  const { action, note } = req.body;
  const loan = await service.approveLoan(req.params.id, action, note, req.user!.sub);
  res.json({ status: 'success', data: loan, message: `Loan ${action}d successfully` });
}

export async function listApprovedLoans(_req: Request, res: Response) {
  const loans = await service.listApprovedLoans();
  res.json({ status: 'success', data: loans });
}

export async function disburseLoan(req: Request, res: Response) {
  const { disbursementDate, deductFeesUpfront } = req.body;
  const result = await service.disburseLoan(req.params.id, {
    disbursementDate: new Date(disbursementDate),
    deductFeesUpfront: Boolean(deductFeesUpfront),
    disbursedById: req.user!.sub,
  });
  res.json({ status: 'success', data: result, message: 'Loan disbursed successfully' });
}

export async function resubmitLoan(req: Request, res: Response) {
  const { note } = req.body;
  const loan = await service.resubmitLoan(req.params.id, note);
  res.json({ status: 'success', data: loan, message: 'Loan resubmitted successfully' });
}

export async function repay(req: Request, res: Response) {
  const repayment = await service.repay(req.body, req.user!.sub);
  res.status(201).json({ status: 'success', data: repayment, message: 'Repayment recorded' });
}

export async function listLoans(req: Request, res: Response) {
  const { status, memberId, loanType, page, limit } = req.query as any;
  const branchIds = await getUserBranchIds(req.user!.sub);

  const result = await service.listLoans({ 
    status, 
    memberId, 
    loanType, 
    page: page ? Number(page) : undefined, 
    limit: limit ? Number(limit) : undefined,
    branchIds 
  });
  res.json({ status: 'success', ...result });
}

export async function getLoan(req: Request, res: Response) {
  const loan = await service.getLoan(req.params.id);
  res.json({ status: 'success', data: loan });
}

export async function getRepaymentSchedule(req: Request, res: Response) {
  const schedule = await service.getRepaymentSchedule(req.params.id);
  res.json({ status: 'success', data: schedule });
}

export async function getLoanControlRoomStats(req: Request, res: Response) {
  const stats = await service.getLoanControlRoomStats();
  res.json({ status: 'success', data: stats });
}

export async function resetTransactions(req: Request, res: Response) {
  const result = await service.resetAllTransactionsAndLoans();
  res.json({ status: 'success', ...result });
}

export async function listRepayments(req: Request, res: Response) {
  const result = await service.listAllRepayments();
  res.json({ status: 'success', data: result });
}

export async function runAssetClassification(_req: Request, res: Response) {
  const { runAssetQualityClassificationBatch } = await import('../../shared/jobs/loan-classifier.job');
  const result = await runAssetQualityClassificationBatch();
  res.json({ status: 'success', data: result, message: 'Asset quality classification batch executed successfully' });
}

export async function addGuarantorToLoan(req: Request, res: Response) {
  const { id } = req.params;
  const { guarantorMemberId, guarantorProfileId, guaranteedAmount, lienAmount, relation, notes } = req.body;
  const result = await service.addGuarantorToLoan(id, {
    guarantorMemberId,
    guarantorProfileId,
    guaranteedAmount: Number(guaranteedAmount),
    lienAmount: Number(lienAmount || 0),
    relation,
    notes,
  });
  res.status(201).json({ status: 'success', data: result, message: 'Guarantor attached successfully' });
}
