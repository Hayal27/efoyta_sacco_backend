import type { Request, Response } from 'express';
import * as branchesService from './branches.service';

export async function listBranches(_req: Request, res: Response): Promise<void> {
  const branches = await branchesService.listBranches();
  res.json({ success: true, data: branches });
}

export async function getBranch(req: Request, res: Response): Promise<void> {
  const branch = await branchesService.getBranch(req.params.id);
  res.json({ success: true, data: branch });
}

export async function createBranch(req: Request, res: Response): Promise<void> {
  const branch = await branchesService.createBranch(req.body);
  res.status(201).json({ success: true, data: branch });
}

export async function updateBranch(req: Request, res: Response): Promise<void> {
  const branch = await branchesService.updateBranch(req.params.id, req.body);
  res.json({ success: true, data: branch });
}

export async function deleteBranch(req: Request, res: Response): Promise<void> {
  await branchesService.deleteBranch(req.params.id);
  res.status(204).end();
}

export async function assignUser(req: Request, res: Response): Promise<void> {
  const { userId, isPrimary = false } = req.body;
  const result = await branchesService.assignUser(req.params.id, userId, isPrimary);
  res.status(201).json({ success: true, data: result });
}

export async function removeUser(req: Request, res: Response): Promise<void> {
  await branchesService.removeUser(req.params.id, req.params.userId);
  res.status(204).end();
}

export async function getMyBranches(req: Request, res: Response): Promise<void> {
  const branches = await branchesService.getUserBranches(req.user!.sub);
  res.json({ success: true, data: branches });
}
