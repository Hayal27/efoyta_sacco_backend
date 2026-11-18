import type { Request, Response } from 'express';
import type { CollectionSessionInput, CollectionEntryInput, ReconciliationInput } from '@coop/validation';
import * as collectionsService from './collections.service';

import { prisma } from '../../config/prisma';
import { getUserBranchIds } from '../../shared/utils/branch.utils';

export async function startSession(req: Request, res: Response): Promise<void> {
  // Resolve the focal agent from the logged-in user
  let agent = await prisma.focalAgent.findUnique({ where: { userId: req.user!.sub } });

  if (!agent) {
    // Auto-create a FocalAgent profile for admin/super_admin testers
    agent = await prisma.focalAgent.create({
      data: {
        userId: req.user!.sub,
        fullName: 'System Admin',
        phone: '0000000000',
        region: 'HQ'
      }
    });
  }

  // Coerce collectionDate — frontend sends ISO string like "2026-07-01"
  const rawDate = req.body.collectionDate;
  const collectionDate = rawDate ? new Date(rawDate) : new Date();

  const branchIds = await getUserBranchIds(req.user!.sub);
  const branchId = branchIds && branchIds.length > 0 ? branchIds[0] : undefined;

  const session = await collectionsService.startSession({
    focalAgentId: agent.id,
    collectionDate,
  } as any, branchId);

  res.status(201).json({ success: true, data: session });
}

export async function recordEntry(req: Request, res: Response): Promise<void> {
  const entry = await collectionsService.recordEntry(req.body as CollectionEntryInput, req.user!.sub);
  res.status(201).json({ success: true, data: entry });
}

export async function reconcile(req: Request, res: Response): Promise<void> {
  const session = await collectionsService.reconcile(req.body as ReconciliationInput);
  res.json({ success: true, data: session });
}

export async function listSessions(req: Request, res: Response): Promise<void> {
  const branchIds = await getUserBranchIds(req.user!.sub);
  const sessions = await collectionsService.listSessions(branchIds);
  res.json({ success: true, data: sessions });
}

export async function getSession(req: Request, res: Response): Promise<void> {
  const session = await collectionsService.getSession(req.params.id);
  res.json({ success: true, data: session });
}

export async function listMyTransactions(req: Request, res: Response): Promise<void> {
  const summaries = await collectionsService.listAgentSummaries(req.user!.sub);
  res.json({ success: true, data: summaries });
}

export async function getMyTransactionBreakdown(req: Request, res: Response): Promise<void> {
  const breakdown = await collectionsService.getMyTransactionBreakdown(req.user!.sub, req.params.date);
  res.json({ success: true, data: breakdown });
}

export async function requestHandover(req: Request, res: Response): Promise<void> {
  // `date` is passed in the body since it's an action on a date
  const { date } = req.body as { date: string };
  const session = await collectionsService.requestHandoverByDate(req.user!.sub, date);
  res.json({ success: true, data: session });
}

export async function receiveHandover(req: Request, res: Response): Promise<void> {
  const session = await collectionsService.receiveHandover(req.params.id, req.user!.sub);
  res.json({ success: true, data: session });
}

export async function declineHandover(req: Request, res: Response): Promise<void> {
  const session = await collectionsService.declineHandover(req.params.id, req.user!.sub);
  res.json({ success: true, data: session });
}

export async function listPendingHandovers(req: Request, res: Response): Promise<void> {
  const branchIds = await getUserBranchIds(req.user!.sub);
  const sessions = await collectionsService.listPendingHandovers(branchIds);
  res.json({ success: true, data: sessions });
}

export async function getSessionBreakdown(req: Request, res: Response): Promise<void> {
  const breakdown = await collectionsService.getSessionBreakdown(req.params.id);
  res.json({ success: true, data: breakdown });
}

export async function listAllEntries(_req: Request, res: Response): Promise<void> {
  const entries = await collectionsService.listAllEntries();
  res.json({ success: true, data: entries });
}
