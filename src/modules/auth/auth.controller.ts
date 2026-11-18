import type { Request, Response } from 'express';
import type { LoginInput } from '@coop/validation';
import * as authService from './auth.service';

export async function login(req: Request, res: Response): Promise<void> {
  const input = req.body;
  const result = await authService.login(input);

  if (result.require2FA) {
    res.json({
      success: true,
      data: result,
    });
    return;
  }

  const { user, tokens } = result;

  const isProduction = process.env.NODE_ENV === 'production';
  const host = req.headers.host || '';
  const isEfoytaDomain = host.includes('efoytasacco.com');
  const cookieDomain = isEfoytaDomain ? '.efoytasacco.com' : undefined;

  res.cookie('refreshToken', tokens.refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    domain: cookieDomain,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });

  res.json({
    success: true,
    data: {
      user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    },
  });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const token = req.body?.refreshToken || req.cookies?.refreshToken;
  if (!token) {
    res.status(401).json({ success: false, error: 'No refresh token provided' });
    return;
  }

  const { tokens } = await authService.refresh(token);

  const isProduction = process.env.NODE_ENV === 'production';
  const host = req.headers.host || '';
  const isEfoytaDomain = host.includes('efoytasacco.com');
  const cookieDomain = isEfoytaDomain ? '.efoytasacco.com' : undefined;

  res.cookie('refreshToken', tokens.refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    domain: cookieDomain,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  res.json({
    success: true,
    data: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    },
  });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const token = req.body?.refreshToken || req.cookies?.refreshToken;
  if (token) {
    await authService.logout(token);
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const host = req.headers.host || '';
  const isEfoytaDomain = host.includes('efoytasacco.com');
  const cookieDomain = isEfoytaDomain ? '.efoytasacco.com' : undefined;

  res.clearCookie('refreshToken', {
    domain: cookieDomain,
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction,
  });
  res.json({ success: true, data: null });
}

export async function requestPasswordReset(req: Request, res: Response): Promise<void> {
  const target = req.body.target || req.body.email || req.body.phone;
  const result = await authService.requestPasswordReset(target);
  res.json({ success: true, data: result });
}

export async function confirmPasswordReset(req: Request, res: Response): Promise<void> {
  await authService.confirmPasswordReset(req.body);
  res.json({ success: true, data: { message: 'Password reset successful. You can now login with your new password.' } });
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  await authService.changePassword(req.user!.sub, req.body);
  res.json({ success: true, data: { message: 'Password changed successfully. Please login again.' } });
}

export async function setup2FA(req: Request, res: Response): Promise<void> {
  const method = req.body.method || 'email';
  const result = await authService.setup2FA(req.user!.sub, method);
  res.json({ success: true, data: result });
}

export async function enable2FA(req: Request, res: Response): Promise<void> {
  const { otpCode } = req.body;
  const result = await authService.enable2FA(req.user!.sub, otpCode);
  res.json({ success: true, data: result, message: '2FA enabled successfully!' });
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = await authService.getUserById(req.user!.sub);
  res.json({ success: true, data: { user } });
}

