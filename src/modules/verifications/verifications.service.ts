import { prisma } from '../../config/prisma';
import { NotFoundError, BusinessRuleError } from '../../shared/errors/app-error';
import {
  generateOtp,
  generateSecurityKeyphrase,
  formatEthiopianPhone,
  dispatchActivationCredentials,
} from '../../shared/utils/security.utils';
import type { Prisma } from '@prisma/client';

export interface GetAccountsFilter {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  twoFactor?: string;
  role?: string;
}

/**
 * Fetch paginated accounts with security & verification states and aggregate metrics
 */
export async function getVerificationAccounts(filter: GetAccountsFilter) {
  const page = Math.max(1, Number(filter.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(filter.limit) || 10));
  const skip = (page - 1) * limit;

  const where: Prisma.UserWhereInput = {};

  // Search filter
  if (filter.search && filter.search.trim()) {
    const q = filter.search.trim();
    const formattedPhone = formatEthiopianPhone(q);
    where.OR = [
      { fullName: { contains: q } },
      { email: { contains: q } },
      { phone: { contains: q } },
      ...(formattedPhone ? [{ phone: { contains: formattedPhone } }] : []),
      { memberProfile: { fullName: { contains: q } } },
      { memberProfile: { memberCode: { contains: q } } },
      { memberProfile: { phone: { contains: q } } },
    ];
  }

  // Status filter
  if (filter.status && filter.status !== 'all') {
    if (filter.status === 'pending_activation') {
      where.OR = [
        { verificationStatus: 'pending_activation' },
        { isPhoneVerified: false },
        { activationCode: { not: null } },
      ];
    } else if (filter.status === 'locked') {
      where.OR = [
        { lockedUntil: { gt: new Date() } },
        { isActive: false },
      ];
    } else if (filter.status === 'active') {
      where.isActive = true;
      where.verificationStatus = 'active';
      where.isPhoneVerified = true;
    } else if (filter.status === 'suspended') {
      where.verificationStatus = 'suspended';
    }
  }

  // 2FA filter
  if (filter.twoFactor && filter.twoFactor !== 'all') {
    where.isTwoFactorEnabled = filter.twoFactor === 'enabled';
  }

  // Role filter
  if (filter.role && filter.role !== 'all') {
    where.role = { slug: filter.role };
  }

  // Execute query & count concurrently
  const [items, total, statsTotal, statsPending, stats2fa, statsKeyphrase, statsLocked] =
    await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          role: true,
          memberProfile: {
            select: {
              id: true,
              memberCode: true,
              fullName: true,
              phone: true,
              email: true,
              kycLevel: true,
              kycStatus: true,
              status: true,
              branch: { select: { id: true, name: true } },
            },
          },
        },
      }),
      prisma.user.count({ where }),
      // Global metrics for executive header cards
      prisma.user.count(),
      prisma.user.count({
        where: {
          OR: [
            { verificationStatus: 'pending_activation' },
            { isPhoneVerified: false },
            { activationCode: { not: null } },
          ],
        },
      }),
      prisma.user.count({ where: { isTwoFactorEnabled: true } }),
      prisma.user.count({ where: { securityKeyphrase: { not: null } } }),
      prisma.user.count({
        where: {
          OR: [
            { lockedUntil: { gt: new Date() } },
            { isActive: false },
          ],
        },
      }),
    ]);

  const totalPages = Math.ceil(total / limit) || 1;

  const mappedItems = items.map((user) => {
    const isLocked = Boolean((user.lockedUntil && user.lockedUntil > new Date()) || !user.isActive);
    const hasKeyphrase = Boolean(user.securityKeyphrase);
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName || user.memberProfile?.fullName || 'N/A',
      phone: user.phone || user.memberProfile?.phone || null,
      role: user.role?.name || 'User',
      roleSlug: user.role?.slug || 'user',
      isPhoneVerified: user.isPhoneVerified,
      isEmailVerified: user.isEmailVerified,
      verificationStatus: user.verificationStatus,
      isTwoFactorEnabled: user.isTwoFactorEnabled,
      twoFactorType: user.twoFactorType || 'otp',
      hasKeyphrase,
      securityKeyphrase: user.securityKeyphrase,
      activationCode: user.activationCode,
      activationExpiresAt: user.activationExpiresAt,
      isLocked,
      lockedUntil: user.lockedUntil,
      failedAttempts: user.failedAttempts,
      lastVerifiedAt: user.lastVerifiedAt,
      createdAt: user.createdAt,
      member: user.memberProfile || null,
    };
  });

  return {
    items: mappedItems,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
    statistics: {
      totalAccounts: statsTotal,
      pendingActivations: statsPending,
      twoFactorProtected: stats2fa,
      keyphraseSecured: statsKeyphrase,
      lockedAccounts: statsLocked,
    },
  };
}

/**
 * Staff manual verification of a user account
 */
export async function manualVerifyAccount(userId: string, verifiedByUserId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { memberProfile: true },
  });

  if (!user) throw new NotFoundError('User account not found');

  const now = new Date();

  // Update user
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      isPhoneVerified: true,
      isEmailVerified: true,
      verificationStatus: 'active',
      activationCode: null,
      activationExpiresAt: null,
      failedAttempts: 0,
      lockedUntil: null,
      isActive: true,
      lastVerifiedAt: now,
      verifiedByUserId,
    },
  });

  // Sync to member record if linked
  if (user.memberProfile) {
    await prisma.member.update({
      where: { id: user.memberProfile.id },
      data: {
        isPhoneVerified: true,
        isEmailVerified: true,
        activationCode: null,
        activationExpiresAt: null,
      },
    });
  }

  // Create audit log entry
  try {
    await prisma.auditLog.create({
      data: {
        userId: verifiedByUserId,
        action: 'MANUAL_VERIFY_USER',
        entityType: 'User',
        entityId: userId,
        newValues: JSON.stringify({
          verificationStatus: 'active',
          isPhoneVerified: true,
          isEmailVerified: true,
          verifiedAt: now,
        }),
      },
    });
  } catch (err) {
    console.warn('Audit log creation failed:', err);
  }

  return {
    success: true,
    message: `Account for ${user.fullName || user.email} has been manually verified and activated.`,
    user: updatedUser,
  };
}

/**
 * Regenerate and dispatch activation code to both phone (SMS) and email
 */
export async function resendActivationCode(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { memberProfile: true },
  });

  if (!user) throw new NotFoundError('User account not found');

  const code = generateOtp(6);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  // Update user code
  await prisma.user.update({
    where: { id: userId },
    data: {
      activationCode: code,
      activationExpiresAt: expiresAt,
      verificationStatus: 'pending_activation',
    },
  });

  // Sync to member if present
  if (user.memberProfile) {
    await prisma.member.update({
      where: { id: user.memberProfile.id },
      data: {
        activationCode: code,
        activationExpiresAt: expiresAt,
      },
    });
  }

  const phone = user.phone || user.memberProfile?.phone;
  const email = user.email;

  const dispatchResult = await dispatchActivationCredentials({
    phone,
    email,
    fullName: user.fullName || user.memberProfile?.fullName,
    code,
    keyphrase: user.securityKeyphrase,
    portalUsername: email,
  });

  return {
    success: true,
    message: `New verification code ${code} generated and dispatched via SMS & Email.`,
    code,
    expiresAt,
    dispatchResult,
  };
}

/**
 * Toggle Account Lock (Lock / Unlock user)
 */
export async function toggleAccountLock(userId: string, locked: boolean, reason?: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User account not found');

  const updateData: Prisma.UserUpdateInput = locked
    ? {
        lockedUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // lock for 30 days
        isActive: false,
      }
    : {
        lockedUntil: null,
        failedAttempts: 0,
        isActive: true,
      };

  const updated = await prisma.user.update({
    where: { id: userId },
    data: updateData,
  });

  return {
    success: true,
    message: locked
      ? `Account has been locked. ${reason ? `Reason: ${reason}` : ''}`
      : 'Account has been unlocked and failed login attempts have been reset.',
    user: updated,
  };
}

/**
 * Toggle 2FA status and method
 */
export async function toggle2FA(
  userId: string,
  isTwoFactorEnabled: boolean,
  twoFactorType: string = 'otp'
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User account not found');

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      isTwoFactorEnabled,
      twoFactorType,
    },
  });

  return {
    success: true,
    message: `Two-Factor Authentication (2FA) ${
      isTwoFactorEnabled ? `enabled with mode: ${twoFactorType}` : 'disabled'
    } for this account.`,
    user: updated,
  };
}

/**
 * Generate a new 12-word cryptographic BIP-39 security keyphrase for the account
 */
export async function resetSecurityKeyphrase(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { memberProfile: true },
  });
  if (!user) throw new NotFoundError('User account not found');

  const newKeyphrase = generateSecurityKeyphrase();

  await prisma.user.update({
    where: { id: userId },
    data: { securityKeyphrase: newKeyphrase },
  });

  if (user.memberProfile) {
    await prisma.member.update({
      where: { id: user.memberProfile.id },
      data: { securityKeyphrase: newKeyphrase },
    });
  }

  return {
    success: true,
    message: 'New 12-Word Master Security Keyphrase generated successfully.',
    securityKeyphrase: newKeyphrase,
  };
}

/**
 * Public / Member activation verification via 6-digit OTP code
 */
export async function verifyActivationCode(identifier: string, code: string) {
  const normalizedId = identifier.trim().toLowerCase();
  const normalizedPhone = formatEthiopianPhone(identifier);

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: normalizedId },
        { phone: identifier.trim() },
        ...(normalizedPhone ? [{ phone: normalizedPhone }] : []),
        { memberProfile: { memberCode: identifier.trim() } },
        { memberProfile: { phone: identifier.trim() } },
      ],
    },
    include: { memberProfile: true },
  });

  if (!user) {
    throw new NotFoundError('No account found matching this identifier.');
  }

  if (!user.activationCode || user.activationCode !== code.trim()) {
    throw new BusinessRuleError('Invalid verification code entered. Please check and try again.');
  }

  if (user.activationExpiresAt && user.activationExpiresAt < new Date()) {
    throw new BusinessRuleError('Verification code has expired. Please request a new code.');
  }

  // Activate account
  await prisma.user.update({
    where: { id: user.id },
    data: {
      isPhoneVerified: true,
      isEmailVerified: true,
      verificationStatus: 'active',
      activationCode: null,
      activationExpiresAt: null,
      failedAttempts: 0,
      lockedUntil: null,
      lastVerifiedAt: new Date(),
    },
  });

  if (user.memberProfile) {
    await prisma.member.update({
      where: { id: user.memberProfile.id },
      data: {
        isPhoneVerified: true,
        isEmailVerified: true,
        activationCode: null,
        activationExpiresAt: null,
      },
    });
  }

  return {
    success: true,
    message: 'Your account has been successfully verified and activated!',
    userId: user.id,
    email: user.email,
  };
}

/**
 * Verify 12-Word Master Security Keyphrase
 */
export async function verifySecurityKeyphrase(identifier: string, keyphrase: string) {
  const normalizedId = identifier.trim().toLowerCase();
  const normalizedPhone = formatEthiopianPhone(identifier);

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: normalizedId },
        { phone: identifier.trim() },
        ...(normalizedPhone ? [{ phone: normalizedPhone }] : []),
        { memberProfile: { memberCode: identifier.trim() } },
      ],
    },
  });

  if (!user) throw new NotFoundError('Account not found');

  const cleanInputWords = keyphrase.trim().toLowerCase().split(/\s+/).join(' ');
  const storedWords = (user.securityKeyphrase || '').trim().toLowerCase().split(/\s+/).join(' ');

  if (!storedWords || cleanInputWords !== storedWords) {
    throw new BusinessRuleError('Security Keyphrase verification failed. The words entered do not match.');
  }

  return {
    success: true,
    message: 'Security Keyphrase successfully verified.',
    userId: user.id,
  };
}
