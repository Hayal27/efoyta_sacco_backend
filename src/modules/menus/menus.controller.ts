import type { Request, Response } from 'express';
import * as menusService from './menus.service';

export async function getMyMenus(req: Request, res: Response): Promise<void> {
  const menus = await menusService.getUserMenus(req.user!.sub);
  res.json({ success: true, data: menus });
}

export async function listMenus(req: Request, res: Response): Promise<void> {
  const menus = await menusService.listAllMenus();
  res.json({ success: true, data: menus });
}

export async function createMenu(req: Request, res: Response): Promise<void> {
  const menu = await menusService.createMenu(req.body);
  res.status(201).json({ success: true, data: menu });
}

export async function updateMenu(req: Request, res: Response): Promise<void> {
  const menu = await menusService.updateMenu(req.params.id, req.body);
  res.json({ success: true, data: menu });
}

export async function deleteMenu(req: Request, res: Response): Promise<void> {
  await menusService.deleteMenu(req.params.id);
  res.status(204).end();
}
