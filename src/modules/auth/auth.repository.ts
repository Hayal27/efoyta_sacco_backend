import { prisma } from '../../config/prisma';
import { formatEthiopianPhone } from '../../shared/utils/security.utils';

export async function findUserByEmail(email: string) {
  return findUserByIdentifier(email);
}

export async function findUserByIdentifier(identifier: string) {
  const cleanId = identifier.trim().toLowerCase();
  const formattedPhone = formatEthiopianPhone(identifier);

  return prisma.user.findFirst({
    where: {
      OR: [
        { email: cleanId },
        { phone: identifier.trim() },
        ...(formattedPhone ? [{ phone: formattedPhone }] : []),
        { memberProfile: { memberCode: identifier.trim() } },
        { memberProfile: { phone: identifier.trim() } },
        ...(formattedPhone ? [{ memberProfile: { phone: formattedPhone } }] : []),
        { memberProfile: { email: cleanId } },
      ],
    },
    include: {
      role: true,
      branches: { include: { branch: true } },
      hrEmployee: {
        include: {
          branch: true,
          department: true,
          position: { include: { grade: true } },
          supervisor: true,
        },
      },
      memberProfile: true,
    },
  });
}

export async function findUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    include: {
      role: true,
      branches: { include: { branch: true } },
      hrEmployee: {
        include: {
          branch: true,
          department: true,
          position: { include: { grade: true } },
          supervisor: true,
        },
      },
    },
  });
}

export async function incrementFailedAttempts(id: string) {
  const user = await prisma.user.update({
    where: { id },
    data: { failedAttempts: { increment: 1 } },
  });
  
  if (user.failedAttempts >= 5) {
    await prisma.user.update({
      where: { id },
      data: { lockedUntil: new Date(Date.now() + 15 * 60 * 1000) }, // lock for 15m
    });
  }
}

export async function resetFailedAttempts(id: string) {
  await prisma.user.update({
    where: { id },
    data: { failedAttempts: 0, lockedUntil: null },
  });
}

export async function createRefreshToken(userId: string, token: string, expiresAt: Date) {
  return prisma.refreshToken.create({
    data: { userId, token, expiresAt },
  });
}

export async function findRefreshToken(token: string) {
  return prisma.refreshToken.findUnique({ where: { token } });
}

export async function revokeToken(tokenId: string) {
  return prisma.refreshToken.update({
    where: { id: tokenId },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllTokensForUser(userId: string) {
  return prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
