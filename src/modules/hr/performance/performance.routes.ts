import { Router, Request, Response } from 'express';
import { prisma } from '../../../config/prisma';

export const performanceRouter = Router();

// ── Cycles ───────────────────────────────────────────────────────────────────

performanceRouter.get('/cycles', async (_req: Request, res: Response) => {
  try {
    const cycles = await prisma.hrPerformanceCycle.findMany({
      include: { _count: { select: { appraisals: true } } },
      orderBy: { startDate: 'desc' },
    });
    res.json({ success: true, data: cycles });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

performanceRouter.post('/cycles', async (req: Request, res: Response) => {
  try {
    const { title, cycleType, startDate, endDate } = req.body;
    const cycle = await prisma.hrPerformanceCycle.create({
      data: {
        title,
        cycleType: cycleType || 'quarterly',
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        status: 'active',
      },
    });
    res.status(201).json({ success: true, data: cycle });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Appraisals ────────────────────────────────────────────────────────────────

performanceRouter.get('/appraisals', async (req: Request, res: Response) => {
  try {
    const { cycleId, employeeId } = req.query;
    const where: any = {};
    if (cycleId) where.cycleId = cycleId as string;
    if (employeeId) where.employeeId = employeeId as string;

    const appraisals = await prisma.hrPerformanceAppraisal.findMany({
      where,
      include: {
        cycle: true,
        employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true, department: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: appraisals });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

performanceRouter.post('/appraise', async (req: Request, res: Response) => {
  try {
    const {
      cycleId,
      employeeId,
      evaluatorId,
      selfScore,
      managerScore,
      feedback,
      developmentPlan,
      status,
    } = req.body;

    const sScore = selfScore ? Number(selfScore) : null;
    const mScore = managerScore ? Number(managerScore) : null;

    // Calculate final weighted score (30% self, 70% manager if both present)
    let finalScore = mScore;
    if (sScore !== null && mScore !== null) {
      finalScore = Math.round((sScore * 0.3 + mScore * 0.7) * 100) / 100;
    }

    let rating = 'meets';
    if (finalScore !== null) {
      if (finalScore >= 90) rating = 'outstanding';
      else if (finalScore >= 80) rating = 'exceeds';
      else if (finalScore >= 65) rating = 'meets';
      else if (finalScore >= 50) rating = 'needs_improvement';
      else rating = 'unsatisfactory';
    }

    const appraisal = await prisma.hrPerformanceAppraisal.create({
      data: {
        cycleId,
        employeeId,
        evaluatorId: evaluatorId || null,
        selfScore: sScore,
        managerScore: mScore,
        finalScore,
        rating,
        feedback: feedback || null,
        developmentPlan: developmentPlan || null,
        status: status || 'reviewed',
      },
      include: { cycle: true, employee: true },
    });

    res.status(201).json({ success: true, data: appraisal });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

