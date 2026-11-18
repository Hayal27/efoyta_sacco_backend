import { Router, Request, Response } from 'express';
import { prisma } from '../../../config/prisma';

export const trainingRouter = Router();

// ── Programs ─────────────────────────────────────────────────────────────────

trainingRouter.get('/programs', async (_req: Request, res: Response) => {
  try {
    const programs = await prisma.hrTrainingProgram.findMany({
      include: { _count: { select: { participants: true } } },
      orderBy: { startDate: 'desc' },
    });
    res.json({ success: true, data: programs });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

trainingRouter.post('/programs', async (req: Request, res: Response) => {
  try {
    const { title, provider, category, startDate, endDate, budgetCost, bondMonths } = req.body;
    const program = await prisma.hrTrainingProgram.create({
      data: {
        title,
        provider: provider || null,
        category: category || 'General',
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        budgetCost: budgetCost || 0,
        bondMonths: bondMonths ? parseInt(bondMonths, 10) : 0,
        status: 'planned',
      },
    });
    res.status(201).json({ success: true, data: program });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Participants & Bond Tracking ─────────────────────────────────────────────

trainingRouter.post('/enroll', async (req: Request, res: Response) => {
  try {
    const { programId, employeeId } = req.body;
    const program = await prisma.hrTrainingProgram.findUnique({ where: { id: programId } });
    if (!program) {
      return res.status(404).json({ success: false, error: 'Training program not found' });
    }

    // Calculate bond end date if bondMonths > 0
    let bondStartDate: Date | null = null;
    let bondEndDate: Date | null = null;
    if (program.bondMonths > 0) {
      bondStartDate = new Date(program.endDate);
      bondEndDate = new Date(program.endDate);
      bondEndDate.setMonth(bondEndDate.getMonth() + program.bondMonths);
    }

    const participant = await prisma.hrTrainingParticipant.create({
      data: {
        programId,
        employeeId,
        completionStatus: 'enrolled',
        bondStartDate,
        bondEndDate,
      },
      include: { program: true, employee: true },
    });

    res.status(201).json({ success: true, data: participant });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── List All Training Participants & Service Bonds (For HR Admin) ───────────
trainingRouter.get('/participants', async (_req: Request, res: Response) => {
  try {
    const records = await prisma.hrTrainingParticipant.findMany({
      include: {
        program: true,
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeNumber: true,
            department: true,
            position: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: records });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

trainingRouter.get('/participants/:employeeId', async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params;
    const records = await prisma.hrTrainingParticipant.findMany({
      where: { employeeId },
      include: { program: true },
    });
    res.json({ success: true, data: records });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

