import type { Request, Response } from 'express';
import * as reportsService from './reports.service';
import { getDashboardStats } from './dashboard.repository';
import { getUserScope, getSelfServiceScope, getBranchScope, getCoopScope } from '../../shared/utils/branch.utils';

export async function getSelfServiceDashboard(req: Request, res: Response): Promise<void> {
  const scope = await getSelfServiceScope(req.user!.sub);
  const data = await getDashboardStats(scope, scope); // kpi and activity use same scope
  res.json({ success: true, data });
}

export async function getCrmDashboard(req: Request, res: Response): Promise<void> {
  const scope = await getUserScope(req.user!.sub);
  const filters = { focalAgentId: req.query.focalAgentId as string };
  const data = await getDashboardStats(scope, scope, filters);
  res.json({ success: true, data });
}

export async function getBranchDashboard(req: Request, res: Response): Promise<void> {
  const scope = await getBranchScope(req.user!.sub);
  const filters = { focalAgentId: req.query.focalAgentId as string };
  const data = await getDashboardStats(scope, scope, filters);
  res.json({ success: true, data });
}

export async function getCoopDashboard(req: Request, res: Response): Promise<void> {
  const scope = getCoopScope();
  const filters = { 
    branchId: req.query.branchId as string, 
    focalAgentId: req.query.focalAgentId as string 
  };
  const data = await getDashboardStats(scope, scope, filters);
  res.json({ success: true, data });
}

export async function getSavingsReport(req: Request, res: Response): Promise<void> {
  const scope = await getUserScope(req.user!.sub);
  let branchIds: string[] | null = null;
  if (scope.type === 'branch') branchIds = scope.branchIds;
  const data = await reportsService.getSavingsReport(branchIds);
  res.json({ success: true, data });
}

export async function getLoansReport(req: Request, res: Response): Promise<void> {
  const scope = await getUserScope(req.user!.sub);
  let branchIds: string[] | null = null;
  if (scope.type === 'branch') branchIds = scope.branchIds;
  const data = await reportsService.getLoansReport(branchIds);
  res.json({ success: true, data });
}

export async function getCollectionsReport(req: Request, res: Response): Promise<void> {
  const scope = await getUserScope(req.user!.sub);
  let branchIds: string[] | null = null;
  if (scope.type === 'branch') branchIds = scope.branchIds;
  const data = await reportsService.getCollectionsReport(branchIds);
  res.json({ success: true, data });
}

export async function getGrandSummary(req: Request, res: Response): Promise<void> {
  const scope = await getUserScope(req.user!.sub);
  // Pass branchIds or focalAgentId based on scope
  let branchIds: string[] | null = null;
  if (scope.type === 'branch') branchIds = scope.branchIds;
  const summary = await reportsService.getGrandSummary(branchIds);
  res.json({ success: true, data: summary });
}

export async function getCrmFollowUp(req: Request, res: Response): Promise<void> {
  const stats = await reportsService.getCrmFollowUpStats(req.user!.sub);
  res.json({ success: true, data: stats });
}

export async function getMemberTxnDetail(req: Request, res: Response): Promise<void> {
  const { memberId } = req.params;
  const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
  const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
  const data = await reportsService.getMemberTxnDetail(memberId, startDate, endDate);
  res.json({ success: true, data });
}
