import type { Request, Response } from 'express';
import * as usersService from './users.service';

export async function listUsers(req: Request, res: Response): Promise<void> {
  const query = {
    role: req.query.role as string,
    branchId: req.query.branchId as string,
    page: parseInt(req.query.page as string, 10) || 1,
    limit: parseInt(req.query.limit as string, 10) || 20,
  };
  const result = await usersService.listUsers(query);
  res.json({ success: true, data: result });
}

export async function createUser(req: Request, res: Response): Promise<void> {
  const result = await usersService.createUser(req.body);
  res.status(201).json({ success: true, data: result });
}

export async function updateUser(req: Request, res: Response): Promise<void> {
  const result = await usersService.updateUser(req.params.id, req.body);
  res.json({ success: true, data: result });
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const result = await usersService.resetPassword(req.params.id);
  res.json({ success: true, data: result });
}

export async function assignCrm(req: Request, res: Response): Promise<void> {
  const result = await usersService.assignCrmHead(req.params.id, req.body.crmHeadId);
  res.json({ success: true, data: result });
}
