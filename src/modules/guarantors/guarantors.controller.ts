import { Request, Response } from 'express';
import * as service from './guarantors.service';

export async function list(req: Request, res: Response) {
  const { query, page, limit, status } = req.query as any;
  const result = await service.listGuarantorProfiles({
    query,
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
    status,
  });
  res.json({ status: 'success', ...result });
}

export async function getOne(req: Request, res: Response) {
  const profile = await service.getGuarantorProfile(req.params.id);
  if (!profile) {
    res.status(404).json({ status: 'error', error: 'Guarantor profile not found' });
    return;
  }
  res.json({ status: 'success', data: profile });
}

export async function create(req: Request, res: Response) {
  const profile = await service.createGuarantorProfile(req.body);
  res.status(201).json({ status: 'success', data: profile, message: 'Guarantor profile created' });
}

export async function update(req: Request, res: Response) {
  const profile = await service.updateGuarantorProfile(req.params.id, req.body);
  res.json({ status: 'success', data: profile, message: 'Guarantor profile updated' });
}

export async function remove(req: Request, res: Response) {
  await service.deleteGuarantorProfile(req.params.id);
  res.json({ status: 'success', message: 'Guarantor profile deleted' });
}
