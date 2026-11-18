import type { Request, Response } from 'express';
import * as portalService from './member-portal.service';
import * as authService from '../auth/auth.service';
import * as memberBankingService from '../members/member-banking.service';
import * as transactionRequestsService from '../savings/transaction-requests.service';

export async function loginMember(req: Request, res: Response): Promise<void> {
  const { identifier, email, phone, password, twoFactorCode } = req.body;
  const loginId = identifier || email || phone;
  const result = await portalService.authenticateMemberLogin(loginId, password, twoFactorCode);
  res.json({ success: true, data: result });
}

export async function requestPasswordReset(req: Request, res: Response): Promise<void> {
  const target = req.body.target || req.body.email || req.body.phone;
  if (!target) {
    res.status(400).json({ success: false, error: 'Target email or phone is required' });
    return;
  }
  const result = await authService.requestPasswordReset(target);
  res.json({ success: true, data: result });
}

export async function confirmPasswordReset(req: Request, res: Response): Promise<void> {
  const { target, otpCode, newPassword } = req.body;
  if (!target || !otpCode || !newPassword) {
    res.status(400).json({ success: false, error: 'Target, otpCode, and newPassword are required' });
    return;
  }
  await authService.confirmPasswordReset({ target, otpCode, newPassword });
  res.json({ success: true, message: 'Password has been successfully reset. Please log in.' });
}

export async function getOverview(req: Request, res: Response): Promise<void> {
  const queryMemberId = req.query.memberId as string | undefined;
  const data = await portalService.getMemberPortalOverview(req.user!.sub, queryMemberId);
  res.json({ success: true, data });
}

export async function getSavingsPassbook(req: Request, res: Response): Promise<void> {
  const { memberId, accountId, type, search, page, limit } = req.query;
  const result = await portalService.getMemberSavingsPassbook(req.user!.sub, {
    queryMemberId: memberId as string | undefined,
    accountId: accountId as string | undefined,
    type: type as string | undefined,
    search: search as string | undefined,
    page: page ? parseInt(page as string, 10) : undefined,
    limit: limit ? parseInt(limit as string, 10) : undefined,
  });
  res.json({ success: true, ...result });
}

export async function getLoanDetails(req: Request, res: Response): Promise<void> {
  const queryMemberId = req.query.memberId as string | undefined;
  const data = await portalService.getMemberLoanDetails(req.user!.sub, queryMemberId);
  res.json({ success: true, data });
}

export async function applyLoan(req: Request, res: Response): Promise<void> {
  const data = await portalService.applyMemberLoan(req.user!.sub, req.body);
  res.status(201).json({ success: true, data });
}

export async function getSharesData(req: Request, res: Response): Promise<void> {
  const queryMemberId = req.query.memberId as string | undefined;
  const data = await portalService.getMemberSharesData(req.user!.sub, queryMemberId);
  res.json({ success: true, data });
}

export async function buyShares(req: Request, res: Response): Promise<void> {
  const data = await portalService.submitSharePurchaseApplication(req.user!.sub, req.body);
  res.status(201).json({ success: true, data });
}

export async function getNotifications(req: Request, res: Response): Promise<void> {
  const queryMemberId = req.query.memberId as string | undefined;
  const search = req.query.search as string | undefined;
  const type = req.query.type as string | undefined;
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = parseInt((req.query.limit as string) || '15', 10);

  const result = await portalService.getMemberNotificationsFeed(req.user!.sub, queryMemberId, {
    search,
    type,
    page,
    limit,
  });

  res.json({
    success: true,
    data: result.items,
    pagination: result.pagination,
    stats: result.stats,
  });
}

// ── Member Multi-Bank Accounts Self-Service ──────────────────────────────────

export async function listBankAccounts(req: Request, res: Response): Promise<void> {
  const member = await portalService.resolveMemberForUser(req.user!.sub, req.query.memberId as string | undefined);
  const accounts = await memberBankingService.listBankAccounts(member.id);
  res.json({ success: true, data: accounts });
}

export async function addBankAccount(req: Request, res: Response): Promise<void> {
  const member = await portalService.resolveMemberForUser(req.user!.sub);
  const account = await memberBankingService.addBankAccount(member.id, req.body, req.user?.sub);
  res.status(201).json({ success: true, data: account, message: 'Bank account added successfully' });
}

export async function deleteBankAccount(req: Request, res: Response): Promise<void> {
  const member = await portalService.resolveMemberForUser(req.user!.sub);
  const result = await memberBankingService.deleteBankAccount(member.id, req.params.accountId);
  res.json(result);
}

// ── Transaction Requests (Deposit / Withdrawal) with OTP Authorization ──────

export async function requestTransactionOtp(req: Request, res: Response): Promise<void> {
  const member = await portalService.resolveMemberForUser(req.user!.sub);
  const channel = (req.body.channel || 'email') as 'email' | 'phone';
  const result = await transactionRequestsService.requestTransactionOtp(member.id, channel);
  res.json({ success: true, ...result });
}

export async function createDepositRequest(req: Request, res: Response): Promise<void> {
  const member = await portalService.resolveMemberForUser(req.user!.sub);
  const request = await transactionRequestsService.createDepositRequest(member.id, req.body);
  res.status(201).json({ success: true, data: request, message: 'Deposit request submitted successfully' });
}

export async function createWithdrawalRequest(req: Request, res: Response): Promise<void> {
  const member = await portalService.resolveMemberForUser(req.user!.sub);
  const request = await transactionRequestsService.createWithdrawalRequest(member.id, req.body);
  res.status(201).json({ success: true, data: request, message: 'Withdrawal request submitted successfully' });
}

export async function getMyTransactionRequests(req: Request, res: Response): Promise<void> {
  const member = await portalService.resolveMemberForUser(req.user!.sub, req.query.memberId as string | undefined);
  const { status, type, search, page, limit } = req.query;
  const result = await transactionRequestsService.listTransactionRequests({
    memberId: member.id,
    status: status as any,
    type: type as any,
    search: search as string,
    page: page ? parseInt(page as string, 10) : 1,
    limit: limit ? parseInt(limit as string, 10) : 10,
  });
  res.json({ success: true, ...result });
}

export async function uploadReceipt(req: Request, res: Response): Promise<void> {
  const member = await portalService.resolveMemberForUser(req.user!.sub);
  const { fileData, fileName } = req.body;
  if (!fileData) {
    res.status(400).json({ success: false, error: 'fileData is required' });
    return;
  }
  const result = await memberBankingService.saveMediaFile(member.id, fileData, 'document', fileName);
  res.json({ success: true, data: result, message: 'Receipt uploaded successfully' });
}
