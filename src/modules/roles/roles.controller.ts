import type { Request, Response } from 'express';
import * as rolesService from './roles.service';

export async function listRoles(req: Request, res: Response): Promise<void> {
  const roles = await rolesService.listRoles();
  res.json({ success: true, data: roles });
}

export async function createRole(req: Request, res: Response): Promise<void> {
  const role = await rolesService.createRole(req.body);
  res.status(201).json({ success: true, data: role });
}

export async function getRole(req: Request, res: Response): Promise<void> {
  const role = await rolesService.getRole(req.params.id);
  res.json({ success: true, data: role });
}

export async function updateRole(req: Request, res: Response): Promise<void> {
  const role = await rolesService.updateRole(req.params.id, req.body);
  res.json({ success: true, data: role });
}

export async function deleteRole(req: Request, res: Response): Promise<void> {
  await rolesService.deleteRole(req.params.id);
  res.status(204).end();
}

export async function updateRoleMenus(req: Request, res: Response): Promise<void> {
  const role = await rolesService.updateRoleMenus(req.params.id, req.body.menuIds);
  res.json({ success: true, data: role });
}
