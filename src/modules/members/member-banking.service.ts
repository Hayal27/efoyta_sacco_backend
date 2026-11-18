import fs from 'fs';
import path from 'path';
import { prisma } from '../../config/prisma';
import { NotFoundError, BadRequestError } from '../../shared/errors/app-error';
import { resolveUploadDir } from '../../shared/utils/upload.utils';

function getUploadRoot() {
  return resolveUploadDir('members');
}

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export async function listBankAccounts(memberId: string) {
  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member) throw new NotFoundError('Member not found');

  return prisma.memberBankAccount.findMany({
    where: { memberId },
    orderBy: [
      { isPrimary: 'desc' },
      { createdAt: 'desc' },
    ],
  });
}

export async function addBankAccount(
  memberId: string,
  input: {
    bankName: string;
    accountNumber: string;
    accountHolderName: string;
    branchName?: string;
    isPrimary?: boolean;
  },
  addedBy?: string
) {
  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member) throw new NotFoundError('Member not found');

  if (!input.bankName || !input.accountNumber || !input.accountHolderName) {
    throw new BadRequestError('Bank name, account number, and account holder name are required');
  }

  // If this account is marked as primary, unmark any previous primary accounts
  if (input.isPrimary) {
    await prisma.memberBankAccount.updateMany({
      where: { memberId, isPrimary: true },
      data: { isPrimary: false },
    });
  }

  // Check if member already has any accounts. If first account, make it primary automatically.
  const existingCount = await prisma.memberBankAccount.count({ where: { memberId } });
  const shouldBePrimary = input.isPrimary ?? (existingCount === 0);

  return prisma.memberBankAccount.create({
    data: {
      memberId,
      bankName: input.bankName.trim(),
      accountNumber: input.accountNumber.trim(),
      accountHolderName: input.accountHolderName.trim(),
      branchName: input.branchName?.trim() || null,
      isPrimary: shouldBePrimary,
      isActive: true,
      addedBy: addedBy || null,
      verifiedAt: new Date(),
    },
  });
}

export async function updateBankAccount(
  memberId: string,
  accountId: string,
  input: {
    bankName?: string;
    accountNumber?: string;
    accountHolderName?: string;
    branchName?: string;
    isPrimary?: boolean;
    isActive?: boolean;
  }
) {
  const account = await prisma.memberBankAccount.findFirst({
    where: { id: accountId, memberId },
  });
  if (!account) throw new NotFoundError('Bank account not found for this member');

  if (input.isPrimary) {
    await prisma.memberBankAccount.updateMany({
      where: { memberId, isPrimary: true, NOT: { id: accountId } },
      data: { isPrimary: false },
    });
  }

  return prisma.memberBankAccount.update({
    where: { id: accountId },
    data: {
      ...(input.bankName && { bankName: input.bankName.trim() }),
      ...(input.accountNumber && { accountNumber: input.accountNumber.trim() }),
      ...(input.accountHolderName && { accountHolderName: input.accountHolderName.trim() }),
      ...(input.branchName !== undefined && { branchName: input.branchName?.trim() || null }),
      ...(input.isPrimary !== undefined && { isPrimary: input.isPrimary }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
  });
}

export async function deleteBankAccount(memberId: string, accountId: string) {
  const account = await prisma.memberBankAccount.findFirst({
    where: { id: accountId, memberId },
  });
  if (!account) throw new NotFoundError('Bank account not found for this member');

  await prisma.memberBankAccount.delete({ where: { id: accountId } });
  return { success: true, message: 'Bank account removed' };
}

export async function updateMemberBiometrics(
  memberId: string,
  input: {
    passportPhotoUrl?: string;
    voiceRecordingUrl?: string;
    fingerprintUrl?: string;
    fingerprintTemplate?: string;
  }
) {
  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member) throw new NotFoundError('Member not found');

  return prisma.member.update({
    where: { id: memberId },
    data: {
      ...(input.passportPhotoUrl !== undefined && { passportPhotoUrl: input.passportPhotoUrl }),
      ...(input.voiceRecordingUrl !== undefined && { voiceRecordingUrl: input.voiceRecordingUrl }),
      ...(input.fingerprintUrl !== undefined && { fingerprintUrl: input.fingerprintUrl }),
      ...(input.fingerprintTemplate !== undefined && { fingerprintTemplate: input.fingerprintTemplate }),
    },
  });
}

export async function saveMediaFile(
  memberId: string,
  base64OrDataUrl: string,
  mediaType: 'passport' | 'voice' | 'fingerprint' | 'document',
  originalName?: string
): Promise<{ url: string; fileName: string; mimeType: string; fileSize: number }> {
  const memberDir = path.join(getUploadRoot(), memberId);
  ensureDir(memberDir);

  let buffer: Buffer;
  let extension = 'bin';
  let mimeType = 'application/octet-stream';

  if (base64OrDataUrl.startsWith('data:')) {
    const matches = base64OrDataUrl.match(/^data:([A-Za-z0-9-+/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new BadRequestError('Invalid base64 data URI format');
    }
    mimeType = matches[1];
    buffer = Buffer.from(matches[2], 'base64');

    if (mimeType.includes('image/png')) extension = 'png';
    else if (mimeType.includes('image/jpeg') || mimeType.includes('image/jpg')) extension = 'jpg';
    else if (mimeType.includes('image/webp')) extension = 'webp';
    else if (mimeType.includes('audio/webm')) extension = 'webm';
    else if (mimeType.includes('audio/wav') || mimeType.includes('audio/x-wav')) extension = 'wav';
    else if (mimeType.includes('audio/mpeg') || mimeType.includes('audio/mp3')) extension = 'mp3';
    else if (mimeType.includes('audio/ogg')) extension = 'ogg';
    else if (mimeType.includes('application/pdf')) extension = 'pdf';
  } else {
    // Plain base64 string
    buffer = Buffer.from(base64OrDataUrl, 'base64');
    if (mediaType === 'passport' || mediaType === 'fingerprint') {
      extension = 'jpg';
      mimeType = 'image/jpeg';
    } else if (mediaType === 'voice') {
      extension = 'webm';
      mimeType = 'audio/webm';
    }
  }

  const timestamp = Date.now();
  const safeBaseName = originalName ? path.parse(originalName).name.replace(/[^a-zA-Z0-9_-]/g, '') : mediaType;
  const fileName = `${safeBaseName}_${timestamp}.${extension}`;
  const diskPath = path.join(memberDir, fileName);

  fs.writeFileSync(diskPath, buffer);

  const url = `/uploads/members/${memberId}/${fileName}`;
  return {
    url,
    fileName,
    mimeType,
    fileSize: buffer.length,
  };
}
