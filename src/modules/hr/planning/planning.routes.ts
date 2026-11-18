import { Router, Request, Response } from 'express';
import { prisma } from '../../../config/prisma';

export const planningRouter = Router();

// ── Workforce Plans ──────────────────────────────────────────────────────────

planningRouter.get('/plans', async (req: Request, res: Response) => {
  try {
    const { fiscalYear } = req.query;
    const where: any = {};
    if (fiscalYear) where.fiscalYear = fiscalYear as string;

    const plans = await prisma.hrWorkforcePlan.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: plans });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

planningRouter.post('/plans', async (req: Request, res: Response) => {
  try {
    const {
      fiscalYear,
      departmentId,
      currentHeadcount,
      requestedHeadcount,
      approvedHeadcount,
      budgetEstimate,
      justification,
    } = req.body;

    const plan = await prisma.hrWorkforcePlan.create({
      data: {
        fiscalYear,
        departmentId,
        currentHeadcount: currentHeadcount ? parseInt(currentHeadcount, 10) : 0,
        requestedHeadcount: requestedHeadcount ? parseInt(requestedHeadcount, 10) : 0,
        approvedHeadcount: approvedHeadcount ? parseInt(approvedHeadcount, 10) : 0,
        budgetEstimate: budgetEstimate || 0,
        justification: justification || null,
        status: 'draft',
      },
    });

    res.status(201).json({ success: true, data: plan });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Headcount Gap Analysis Dashboard ─────────────────────────────────────────

planningRouter.get('/gap-analysis', async (_req: Request, res: Response) => {
  try {
    const units = await prisma.hrOrganizationUnit.findMany({
      include: {
        positions: true,
        _count: { select: { employees: true } },
      },
    });

    const analysis = units.map((u) => {
      const totalBudgeted = u.positions.reduce((sum, p) => sum + p.budgetedHeadcount, 0);
      const activeHeadcount = u._count.employees;
      const vacancyGap = Math.max(0, totalBudgeted - activeHeadcount);

      return {
        departmentId: u.id,
        departmentName: u.name,
        code: u.code,
        budgetedHeadcount: totalBudgeted,
        activeHeadcount,
        vacancyGap,
        utilizationRate: totalBudgeted > 0 ? Math.round((activeHeadcount / totalBudgeted) * 100) : 100,
      };
    });

    res.json({ success: true, data: analysis });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

