import path from 'path';
import fs from 'fs';
import { prisma } from '../../config/prisma';
import { NotFoundError, ValidationError } from '../../shared/errors/app-error';
import { DocType } from '@coop/types';
import { PrismaClient } from '@prisma/client';
import { resolveUploadDir } from '../../shared/utils/upload.utils';

// ── Local upload directory (relative to backend process cwd or backend root) ─────────────────
function getKycUploadDir() {
  return resolveUploadDir('kyc');
}

const UPLOAD_DIR = getKycUploadDir();

function ensureUploadDir(subPath: string) {
  const dir = path.join(getKycUploadDir(), subPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getDocModel() {
  if (!(prisma as any).memberDocument) {
    globalThis.__prisma = new PrismaClient();
  }
  return (prisma as any).memberDocument;
}

// ── Upload: saves base64 file to disk, stores metadata in DB ─────────────────
export async function uploadMemberDocument(input: {
  memberId: string;
  docType: DocType;
  fileName: string;
  fileKey: string;
  mimeType: string;
  fileSize: number;
  checksum?: string;
  isEncrypted?: boolean;
  fileData?: string; // base64 data URL or pure base64
}) {
  const member = await prisma.member.findUnique({ where: { id: input.memberId } });
  if (!member) throw new NotFoundError('Member');

  // ── Persist binary file to local disk ──────────────────────────────────────
  let diskPath: string | null = null;
  if (input.fileData) {
    // Strip the data URL prefix if present: "data:image/png;base64,..."
    const base64 = input.fileData.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');

    const subDir = path.join(input.memberId, input.docType);
    ensureUploadDir(subDir);

    // Sanitise filename so it's safe on all OSes
    const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    diskPath = path.join(UPLOAD_DIR, subDir, safeName);
    fs.writeFileSync(diskPath, buffer);
  }

  // ── Upsert database record ─────────────────────────────────────────────────
  const model = getDocModel();
  const existing = await model.findFirst({
    where: { memberId: input.memberId, docType: input.docType }
  });

  const recordData = {
    fileName: input.fileName,
    fileKey: diskPath ? path.relative(process.cwd(), diskPath).replace(/\\/g, '/') : input.fileKey,
    mimeType: input.mimeType,
    fileSize: input.fileSize,
    checksum: input.checksum || null,
    isEncrypted: input.isEncrypted ?? true,
    verificationStatus: 'pending',
    rejectionReason: null,
    uploadedAt: new Date(),
    verifiedAt: null
  };

  if (existing) {
    // Remove old file from disk if it exists
    if (existing.fileKey && !existing.fileKey.startsWith('kyc/') && fs.existsSync(path.resolve(process.cwd(), existing.fileKey))) {
      try { fs.unlinkSync(path.resolve(process.cwd(), existing.fileKey)); } catch (_) {}
    }
    return model.update({ where: { id: existing.id }, data: recordData });
  }

  return model.create({
    data: {
      memberId: input.memberId,
      docType: input.docType,
      ...recordData
    }
  });
}

// ── Serve: reads file from disk and returns buffer + mimeType ─────────────────
export function serveKycFile(relativeFileKey: string): { buffer: Buffer; mimeType: string } {
  const cleanKey = relativeFileKey.replace(/^\/+/, '');
  const candidate1 = path.resolve(process.cwd(), cleanKey);
  const candidate2 = path.resolve(__dirname, '../../..', cleanKey);
  
  let fullPath = candidate1;
  if (!fs.existsSync(candidate1) && fs.existsSync(candidate2)) {
    fullPath = candidate2;
  }

  // Security: prevent path traversal outside uploads directory
  const normalizedFull = fullPath.toLowerCase().replace(/\\/g, '/');
  if (!normalizedFull.includes('/uploads/')) {
    throw new NotFoundError('KYC file not found in vault');
  }

  if (!fs.existsSync(fullPath)) {
    throw new NotFoundError('KYC file');
  }

  const buffer = fs.readFileSync(fullPath);
  const ext    = path.extname(relativeFileKey).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.webp': 'image/webp',
    '.pdf':  'application/pdf',
  };
  const mimeType = mimeMap[ext] || 'application/octet-stream';

  return { buffer, mimeType };
}

// ── List member documents ──────────────────────────────────────────────────────
export async function getMemberDocuments(memberId: string) {
  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member) throw new NotFoundError('Member');

  const model = getDocModel();
  if (!model) return [];

  return model.findMany({
    where: { memberId },
    orderBy: { uploadedAt: 'desc' }
  });
}

// ── Verify document ───────────────────────────────────────────────────────────
export async function verifyMemberDocument(input: {
  documentId: string;
  status: 'verified' | 'rejected';
  rejectionReason?: string;
}) {
  const model = getDocModel();
  const doc = await model.findUnique({ where: { id: input.documentId } });
  if (!doc) throw new NotFoundError('Document');

  if (input.status === 'rejected' && !input.rejectionReason) {
    throw new ValidationError('A rejection reason must be provided when rejecting a KYC document.');
  }

  return model.update({
    where: { id: input.documentId },
    data: {
      verificationStatus: input.status,
      rejectionReason: input.status === 'rejected' ? input.rejectionReason : null,
      verifiedAt: new Date()
    }
  });
}
