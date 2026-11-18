import type { Request, Response } from 'express';
import * as verificationsService from './verifications.service';

export async function getAccounts(req: Request, res: Response): Promise<void> {
  const result = await verificationsService.getVerificationAccounts({
    page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
    limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 10,
    search: req.query.search as string,
    status: req.query.status as string,
    twoFactor: req.query.twoFactor as string,
    role: req.query.role as string,
  });

  res.json({
    success: true,
    data: result.items,
    pagination: result.pagination,
    statistics: result.statistics,
  });
}

export async function manualVerify(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const verifiedByUserId = (req as any).user?.id || 'system-admin';
  const result = await verificationsService.manualVerifyAccount(id, verifiedByUserId);
  res.json({ success: true, ...result });
}

export async function resendCode(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const result = await verificationsService.resendActivationCode(id);
  res.json({ success: true, ...result });
}

export async function toggleLock(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { locked, reason } = req.body;
  const result = await verificationsService.toggleAccountLock(id, Boolean(locked), reason);
  res.json({ success: true, ...result });
}

export async function toggle2FA(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { enabled, twoFactorType } = req.body;
  const result = await verificationsService.toggle2FA(id, Boolean(enabled), twoFactorType || 'otp');
  res.json({ success: true, ...result });
}

export async function resetKeyphrase(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const result = await verificationsService.resetSecurityKeyphrase(id);
  res.json({ success: true, ...result });
}

export async function verifyOtp(req: Request, res: Response): Promise<void> {
  const { identifier, code } = req.body;
  if (!identifier || !code) {
    res.status(400).json({ success: false, error: 'Identifier and verification code are required' });
    return;
  }
  const result = await verificationsService.verifyActivationCode(identifier, code);
  res.json({ success: true, ...result });
}

export async function verifyKeyphrase(req: Request, res: Response): Promise<void> {
  const { identifier, keyphrase } = req.body;
  if (!identifier || !keyphrase) {
    res.status(400).json({ success: false, error: 'Identifier and security keyphrase are required' });
    return;
  }
  const result = await verificationsService.verifySecurityKeyphrase(identifier, keyphrase);
  res.json({ success: true, ...result });
}
