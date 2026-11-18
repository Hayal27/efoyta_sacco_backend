import type { Request, Response } from 'express';
import type { MemberInput, UpdateMemberInput, MemberSearchInput } from '@coop/validation';
import * as membersService from './members.service';
import * as kycService from './kyc.service';
import * as memberBankingService from './member-banking.service';
import { getUserBranchIds } from '../../shared/utils/branch.utils';
import { createKycUploadAlert } from '../notifications/alerts.service';

export async function checkUniqueness(req: Request, res: Response): Promise<void> {
  const { phone, email, nationalId, nationalIdFin, excludeId } = req.query as Record<string, string>;
  const result = await membersService.checkFieldUniqueness({
    phone,
    email,
    nationalId,
    nationalIdFin,
    excludeMemberId: excludeId,
  });
  res.json({ success: true, data: result });
}

export async function createMember(req: Request, res: Response): Promise<void> {
  const input = req.body as MemberInput & { branchId?: string };
  if (!input.branchId) {
    const branchIds = await getUserBranchIds(req.user!.sub);
    if (branchIds && branchIds.length > 0) {
      input.branchId = branchIds[0];
    }
  }
  const member = await membersService.createMember(input, req.user!.sub);
  res.status(201).json({ success: true, data: member });
}

export async function getMember(req: Request, res: Response): Promise<void> {
  const member = await membersService.getMember(req.params.id);
  res.json({ success: true, data: member });
}

export async function updateMember(req: Request, res: Response): Promise<void> {
  const member = await membersService.updateMember(req.params.id, req.body as UpdateMemberInput);
  res.json({ success: true, data: member });
}

export async function listMembers(req: Request, res: Response): Promise<void> {
  const query = req.query.query as string | undefined;
  const focalAgentId = req.query.focalAgentId as string | undefined;
  const status = req.query.status as string | undefined;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const branchIds = await getUserBranchIds(req.user!.sub);

  const result = await membersService.listMembers({ query, focalAgentId, status, page, limit, branchIds }, req.user);
  res.json({ success: true, ...result });
}

export async function updateStatus(req: Request, res: Response): Promise<void> {
  const { status } = req.body as { status: 'active' | 'suspended' | 'exited' };
  const member = await membersService.updateStatus(req.params.id, status);
  res.json({ success: true, data: member });
}

export async function getMemberSummary(req: Request, res: Response): Promise<void> {
  const summary = await membersService.getMemberSummary(req.params.id);
  res.json({ success: true, data: summary });
}

export async function getMember360Portfolio(req: Request, res: Response): Promise<void> {
  const portfolio = await membersService.getMember360Portfolio(req.params.id);
  res.json({ success: true, data: portfolio });
}

export async function uploadMemberDocument(req: Request, res: Response): Promise<void> {
  const doc = await kycService.uploadMemberDocument({
    memberId: req.params.id,
    ...req.body
  });

  // Fire KYC upload alert to admins (non-blocking)
  const actor    = req.user!;
  const member   = await membersService.getMember(req.params.id).catch(() => null);
  const roleSlug = (actor as any).role ?? actor.sub;
  createKycUploadAlert({
    actorId:    actor.sub,
    actorName:  (actor as any).fullName || actor.email,
    actorRole:  roleSlug,
    memberId:   req.params.id,
    memberName: (member as any)?.fullName ?? 'Unknown Member',
    memberCode: (member as any)?.memberCode ?? '',
    docType:    req.body.docType ?? 'document',
  }).catch((err) => console.warn('Alert creation failed (non-fatal):', err.message));

  res.status(201).json({ success: true, data: doc });
}

export async function getMemberDocuments(req: Request, res: Response): Promise<void> {
  const docs = await kycService.getMemberDocuments(req.params.id);
  res.json({ success: true, data: docs });
}

export async function serveKycDocument(req: Request, res: Response): Promise<void> {
  const fileKey = req.query.key as string;
  if (!fileKey) {
    res.status(400).json({ success: false, error: 'Missing file key' });
    return;
  }
  const { buffer, mimeType } = kycService.serveKycFile(fileKey);
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.send(buffer);
}

export async function verifyMemberDocument(req: Request, res: Response): Promise<void> {
  const doc = await kycService.verifyMemberDocument({
    documentId: req.params.docId,
    ...req.body
  });
  res.json({ success: true, data: doc });
}

// ── Member Bank Accounts ─────────────────────────────────────────────────────

export async function listMemberBankAccounts(req: Request, res: Response): Promise<void> {
  const accounts = await memberBankingService.listBankAccounts(req.params.id);
  res.json({ success: true, data: accounts });
}

export async function addMemberBankAccount(req: Request, res: Response): Promise<void> {
  const account = await memberBankingService.addBankAccount(
    req.params.id,
    req.body,
    req.user?.sub
  );
  res.status(201).json({ success: true, data: account, message: 'Bank account linked successfully' });
}

export async function updateMemberBankAccount(req: Request, res: Response): Promise<void> {
  const account = await memberBankingService.updateBankAccount(
    req.params.id,
    req.params.accountId,
    req.body
  );
  res.json({ success: true, data: account, message: 'Bank account updated successfully' });
}

export async function deleteMemberBankAccount(req: Request, res: Response): Promise<void> {
  const result = await memberBankingService.deleteBankAccount(
    req.params.id,
    req.params.accountId
  );
  res.json(result);
}

// ── Member Biometrics & Profile Visual Media ─────────────────────────────────

export async function updateMemberBiometrics(req: Request, res: Response): Promise<void> {
  const updated = await memberBankingService.updateMemberBiometrics(
    req.params.id,
    req.body
  );
  res.json({ success: true, data: updated, message: 'Member biometrics updated successfully' });
}

export async function uploadMemberMedia(req: Request, res: Response): Promise<void> {
  const { fileData, mediaType, fileName } = req.body;
  if (!fileData || !mediaType) {
    res.status(400).json({ success: false, error: 'fileData and mediaType are required' });
    return;
  }
  const result = await memberBankingService.saveMediaFile(
    req.params.id,
    fileData,
    mediaType,
    fileName
  );
  res.json({ success: true, data: result, message: 'Media file uploaded successfully' });
}

