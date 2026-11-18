import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../../config/env';
import { UnauthorizedError, AppError, NotFoundError, BusinessRuleError } from '../../shared/errors/app-error';
import * as authRepo from './auth.repository';
import { prisma } from '../../config/prisma';
import { sendOtpEmail } from '../../shared/utils/email.utils';
import type { User, AuthTokens, AuthTokenPayload } from '@coop/types';


// In-memory store for OTPs (Email/SMS/Telegram verification codes)
interface StoredOtp {
  code: string;
  expiresAt: number;
  target: string;
  method: 'email' | 'phone';
  failedAttempts: number;
}
const otpStore = new Map<string, StoredOtp>();

export async function login(input: {
  email?: string;
  identifier?: string;
  phone?: string;
  password?: string;
  twoFactorCode?: string;
}): Promise<any> {
  const loginId = (input.email || input.identifier || input.phone || '').trim();
  if (!loginId) {
    throw new UnauthorizedError('Please enter your email, phone number, or Member ID.');
  }
  const user = await authRepo.findUserByIdentifier(loginId);
  if (!user || !user.isActive) {
    throw new UnauthorizedError('Invalid credentials or account inactive.');
  }

  // 🔒 1. Check if Account is Locked due to 5 Failed Attempts
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / (60 * 1000));
    throw new AppError(
      429,
      `Account locked due to consecutive failed login attempts. Please try again in ${minutesLeft} minute(s) or contact system administration.`
    );
  }

  // 🔒 2. Validate Password
  if (!input.password) {
    throw new UnauthorizedError('Password is required.');
  }
  const isValid = await bcrypt.compare(input.password, user.passwordHash);
  if (!isValid) {
    await authRepo.incrementFailedAttempts(user.id);
    const updatedUser = await authRepo.findUserById(user.id);
    const failedCount = updatedUser?.failedAttempts || user.failedAttempts + 1;
    const attemptsRemaining = 5 - failedCount;

    if (attemptsRemaining <= 0) {
      throw new AppError(
        429,
        'Account has been locked for 15 minutes due to 5 consecutive failed login attempts.'
      );
    }
    throw new UnauthorizedError(
      `Invalid credentials. Warning: ${attemptsRemaining} attempt(s) remaining before account lockout.`
    );
  }

  // 🔒 3. Two-Factor Authentication (2FA) Check
  if (user.isTwoFactorEnabled) {
    if (!input.twoFactorCode) {
      // Generate and dispatch 2FA OTP
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiryMins = env.OTP_EXPIRY_MINUTES || 15;
      const expiresAt = Date.now() + expiryMins * 60 * 1000;
      otpStore.set(`2fa_${user.id}`, {
        code,
        expiresAt,
        target: user.phone || user.email,
        method: user.phone ? 'phone' : 'email',
        failedAttempts: 0,
      });

      // Dispatch via SMS / Email / Telegram
      const destPhone = user.phone || user.memberProfile?.phone;
      if (destPhone) {
        import('../../modules/notifications/channels/sms.channel').then(({ sendSms }) => {
          sendSms(destPhone, `[EFOYTA 2FA] Your login verification code is: ${code}. Valid for ${expiryMins} min.`);
        }).catch(() => {});
      }
      sendOtpEmail(user.email, code, 'Two-Factor Authentication (2FA) Login Code').catch(() => {});

      if (user.telegram) {
        import('../../modules/notifications/channels/telegram.channel').then(({ sendTelegramOtp }) => {
          sendTelegramOtp(user.telegram!, code, 'Two-Factor Authentication (2FA) Login Code');
        }).catch(() => {});
      }

      return {
        require2FA: true,
        userId: user.id,
        twoFactorType: user.twoFactorType || 'otp',
        phonePreview: user.phone ? `${user.phone.slice(0, 4)}****${user.phone.slice(-3)}` : null,
        emailPreview: user.email ? `${user.email.slice(0, 3)}***@${user.email.split('@')[1]}` : null,
        message: `Two-Factor Authentication required. A 6-digit code has been dispatched (Valid for ${expiryMins} min).`,
      };
    } else {
      // Validate 2FA Code or Security Keyphrase
      const stored2FA = otpStore.get(`2fa_${user.id}`);
      const cleanInput = input.twoFactorCode.trim().toLowerCase();
      const isOtpValid = stored2FA && stored2FA.code === cleanInput && stored2FA.expiresAt >= Date.now();
      const isKeyphraseValid = user.securityKeyphrase && user.securityKeyphrase.trim().toLowerCase() === cleanInput;
      const isActivationCodeValid = user.activationCode && user.activationCode === cleanInput;

      if (!isOtpValid && !isKeyphraseValid && !isActivationCodeValid) {
        if (stored2FA) {
          stored2FA.failedAttempts = (stored2FA.failedAttempts || 0) + 1;
          const maxAttempts = env.MAX_OTP_ATTEMPTS || 5;
          const remaining = maxAttempts - stored2FA.failedAttempts;
          if (remaining <= 0) {
            otpStore.delete(`2fa_${user.id}`);
            throw new AppError(429, 'Maximum verification attempts exceeded. Code has been invalidated. Please sign in again.');
          }
          throw new BusinessRuleError(`Invalid or expired verification code. ${remaining} attempt(s) remaining.`);
        }
        throw new BusinessRuleError('Invalid or expired Two-Factor Authentication (2FA) code / keyphrase.');
      }
      otpStore.delete(`2fa_${user.id}`);
    }
  }

  // Reset failed attempts upon successful authentication
  await authRepo.resetFailedAttempts(user.id);
  const tokens = await generateTokens(user);
  return { user: mapToPublicUser(user), tokens };
}

export async function refresh(oldRefreshToken: string): Promise<{ tokens: AuthTokens & { refreshToken: string } }> {
  const tokenRecord = await authRepo.findRefreshToken(oldRefreshToken);
  
  if (!tokenRecord) {
    throw new UnauthorizedError('Invalid refresh token');
  }

  // Handle token rotation reuse with a 60-second grace period for concurrent requests
  if (tokenRecord.revokedAt) {
    const elapsedSeconds = (Date.now() - new Date(tokenRecord.revokedAt).getTime()) / 1000;
    if (elapsedSeconds <= 60) {
      const user = await authRepo.findUserById(tokenRecord.userId);
      if (user && user.isActive) {
        // Issue fresh tokens to in-flight concurrent requests within grace period
        const tokens = await generateTokens(user);
        return { tokens };
      }
    }
    // Genuine replay/reuse attack beyond grace period: revoke user sessions
    await authRepo.revokeAllTokensForUser(tokenRecord.userId);
    throw new UnauthorizedError('Invalid refresh token');
  }

  if (tokenRecord.expiresAt < new Date()) {
    throw new UnauthorizedError('Refresh token expired');
  }

  await authRepo.revokeToken(tokenRecord.id);
  const user = await authRepo.findUserById(tokenRecord.userId);
  if (!user || !user.isActive) {
    throw new UnauthorizedError('User inactive or deleted');
  }

  const tokens = await generateTokens(user);
  return { tokens };
}

export async function logout(refreshToken: string): Promise<void> {
  const tokenRecord = await authRepo.findRefreshToken(refreshToken);
  if (tokenRecord) {
    await authRepo.revokeToken(tokenRecord.id);
  }
}

export async function getUserById(userId: string): Promise<User> {
  const user = await authRepo.findUserById(userId);
  if (!user) throw new UnauthorizedError('User not found');
  return mapToPublicUser(user);
}

// ── Password Change ──────────────────────────────────────────────────────────

export async function changePassword(userId: string, input: { currentPassword: string; newPassword: string }): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User');

  const isValid = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!isValid) {
    throw new UnauthorizedError('Current password is incorrect.');
  }

  const newHash = await bcrypt.hash(input.newPassword, 10);
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: newHash,
      mustChangePassword: false,
      failedAttempts: 0,
      lockedUntil: null,
    },
  });

  await authRepo.revokeAllTokensForUser(userId);
}

// ── Password Reset (Forgot Password) ──────────────────────────────────────────

export async function requestPasswordReset(target: string): Promise<{ message: string; otpCode?: string }> {
  // Can be email or phone
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: target.trim() },
        { phone: target.trim() },
      ],
    },
  });

  if (!user) {
    throw new NotFoundError('No user account found matching this email or phone number.');
  }

  // Generate 6-digit OTP
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiryMins = env.OTP_EXPIRY_MINUTES || 15;
  const expiresAt = Date.now() + expiryMins * 60 * 1000;

  otpStore.set(user.email.toLowerCase(), {
    code,
    expiresAt,
    target,
    method: user.email === target ? 'email' : 'phone',
    failedAttempts: 0,
  });

  // Asynchronously send actual OTP email via Gmail SMTP
  sendOtpEmail(user.email, code, 'Password Reset OTP');

  // Also dispatch to Telegram if user has linked Telegram
  if (user.telegram) {
    import('../notifications/channels/telegram.channel').then(({ sendTelegramOtp }) => {
      sendTelegramOtp(user.telegram!, code, 'Password Reset OTP');
    }).catch(() => {});
  }

  // Also dispatch SMS if user has phone
  if (user.phone) {
    import('../notifications/channels/sms.channel').then(({ sendSms }) => {
      sendSms(user.phone!, `[EFOYTA SACCO] Your password reset verification code is: ${code}. Valid for ${expiryMins} min.`);
    }).catch(() => {});
  }

  return {
    message: `A 6-digit verification code has been sent to ${user.email} (Valid for ${expiryMins} min)`,
    otpCode: code,
  };
}

export async function confirmPasswordReset(input: { target: string; otpCode: string; newPassword: string }): Promise<void> {
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: input.target.trim() },
        { phone: input.target.trim() },
      ],
    },
  });

  if (!user) throw new NotFoundError('User account not found.');

  const stored = otpStore.get(user.email.toLowerCase());
  const maxAttempts = env.MAX_OTP_ATTEMPTS || 5;

  if (!stored || stored.expiresAt < Date.now()) {
    throw new BusinessRuleError('Verification code has expired or was not requested. Please request a new code.');
  }

  if (stored.code !== input.otpCode.trim()) {
    stored.failedAttempts = (stored.failedAttempts || 0) + 1;
    const remaining = maxAttempts - stored.failedAttempts;
    if (remaining <= 0) {
      otpStore.delete(user.email.toLowerCase());
      throw new AppError(429, 'Too many failed verification attempts. This code has been invalidated. Please request a new code.');
    }
    throw new BusinessRuleError(`Invalid verification code. ${remaining} attempt(s) remaining.`);
  }

  const newHash = await bcrypt.hash(input.newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: newHash,
      mustChangePassword: false,
      failedAttempts: 0,
      lockedUntil: null,
    },
  });

  otpStore.delete(user.email.toLowerCase());
  await authRepo.revokeAllTokensForUser(user.id);
}

// ── 2-Factor Authentication (2FA) ─────────────────────────────────────────────

export async function setup2FA(userId: string, method: 'email' | 'phone'): Promise<{ message: string; otpCode?: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User');

  const destination = method === 'phone' ? user.phone || user.email : user.email;
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiryMins = env.OTP_EXPIRY_MINUTES || 15;
  const expiresAt = Date.now() + expiryMins * 60 * 1000;

  otpStore.set(`2fa_${user.id}`, { code, expiresAt, target: destination, method, failedAttempts: 0 });

  if (method === 'email' || !user.phone) {
    sendOtpEmail(user.email, code, '2FA Activation Code');
  } else if (user.phone) {
    import('../notifications/channels/sms.channel').then(({ sendSms }) => {
      sendSms(user.phone!, `[EFOYTA 2FA] Your 2FA activation code is: ${code}. Valid for ${expiryMins} min.`);
    }).catch(() => {});
  }

  if (user.telegram) {
    import('../notifications/channels/telegram.channel').then(({ sendTelegramOtp }) => {
      sendTelegramOtp(user.telegram!, code, '2FA Activation Code');
    }).catch(() => {});
  }

  return {
    message: `Verification code sent via ${method.toUpperCase()} to ${destination} (Valid for ${expiryMins} min)`,
    otpCode: code,
  };
}

export async function enable2FA(userId: string, otpCode: string): Promise<{ success: boolean }> {
  const stored = otpStore.get(`2fa_${userId}`);
  const maxAttempts = env.MAX_OTP_ATTEMPTS || 5;

  if (!stored || stored.expiresAt < Date.now()) {
    throw new BusinessRuleError('Verification code has expired or was not requested. Please request a new code.');
  }

  if (stored.code !== otpCode.trim()) {
    stored.failedAttempts = (stored.failedAttempts || 0) + 1;
    const remaining = maxAttempts - stored.failedAttempts;
    if (remaining <= 0) {
      otpStore.delete(`2fa_${userId}`);
      throw new AppError(429, 'Too many failed verification attempts. This code has been invalidated. Please request a new code.');
    }
    throw new BusinessRuleError(`Invalid verification code. ${remaining} attempt(s) remaining.`);
  }

  otpStore.delete(`2fa_${userId}`);
  await prisma.user.update({
    where: { id: userId },
    data: { isTwoFactorEnabled: true, twoFactorType: 'otp' },
  });
  return { success: true };
}

// ── Token & User Helpers ───────────────────────────────────────────────────

export async function generateTokens(user: any): Promise<AuthTokens & { refreshToken: string }> {
  const payload: AuthTokenPayload = {
    sub: user.id,
    userId: user.id,
    id: user.id,
    email: user.email,
    role: user.role?.slug || 'admin',
    menuPermissions: user.menuPermissions ?? null,
  };

  const accessToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_EXPIRES_IN });
  const refreshTokenString = uuidv4();
  
  const expiresDays = parseInt(env.JWT_REFRESH_EXPIRES_IN.replace('d', ''), 10) || 7;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresDays);

  await authRepo.createRefreshToken(user.id, refreshTokenString, expiresAt);

  return {
    accessToken,
    refreshToken: refreshTokenString,
    expiresIn: 8 * 3600, // 8h in seconds
  };
}

function mapToPublicUser(user: any): User {
  const { passwordHash, failedAttempts, lockedUntil, ...publicUser } = user;
  return publicUser as User;
}

