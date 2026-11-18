import { Router, Request, Response } from 'express';
import { prisma } from '../../../config/prisma';

export const offboardingRouter = Router();

// ── List Clearances ──────────────────────────────────────────────────────────

offboardingRouter.get('/clearances', async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    const where: any = {};
    if (status) where.status = status as string;

    const clearances = await prisma.hrOffboardingClearance.findMany({
      where,
      include: {
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

    res.json({ success: true, data: clearances });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Initiate Separation ──────────────────────────────────────────────────────

offboardingRouter.post('/initiate', async (req: Request, res: Response) => {
  try {
    const { employeeId, separationReason, noticeDate, lastWorkingDate, exitInterviewNotes } = req.body;
    if (!employeeId || !separationReason || !lastWorkingDate) {
      return res.status(400).json({ success: false, error: 'Employee, Separation Reason, and Last Date required' });
    }

    const clearance = await prisma.hrOffboardingClearance.create({
      data: {
        employeeId,
        separationReason,
        noticeDate: noticeDate ? new Date(noticeDate) : new Date(),
        lastWorkingDate: new Date(lastWorkingDate),
        exitInterviewNotes: exitInterviewNotes || null,
        status: 'in_progress',
      },
      include: { employee: true },
    });

    res.status(201).json({ success: true, data: clearance });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Department Clearance Sign-Off ────────────────────────────────────────────

offboardingRouter.patch('/:id/sign-off', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { department, decision } = req.body; // department: 'it' | 'finance' | 'department' | 'hr'; decision: 'cleared' | 'rejected'

    const clearance = await prisma.hrOffboardingClearance.findUnique({ where: { id } });
    if (!clearance) {
      return res.status(404).json({ success: false, error: 'Clearance record not found' });
    }

    const updateData: any = {};
    if (department === 'it') updateData.itClearance = decision;
    if (department === 'finance') updateData.financeClearance = decision;
    if (department === 'department') updateData.departmentClearance = decision;
    if (department === 'hr') updateData.hrClearance = decision;

    // Check if all four departments have cleared
    const it = department === 'it' ? decision : clearance.itClearance;
    const fin = department === 'finance' ? decision : clearance.financeClearance;
    const dept = department === 'department' ? decision : clearance.departmentClearance;
    const hr = department === 'hr' ? decision : clearance.hrClearance;

    const allCleared = it === 'cleared' && fin === 'cleared' && dept === 'cleared' && hr === 'cleared';

    if (allCleared) {
      updateData.status = 'completed';

      // Update employee status to separation reason and free position headcount
      const emp = await prisma.hrEmployee.findUnique({ where: { id: clearance.employeeId } });
      if (emp) {
        await prisma.hrEmployee.update({
          where: { id: emp.id },
          data: { status: clearance.separationReason },
        });

        if (emp.positionId) {
          await prisma.hrPosition.update({
            where: { id: emp.positionId },
            data: { activeHeadcount: { decrement: 1 } },
          });
        }

        // Deactivate connected user login account and revoke tokens
        if (emp.userId) {
          await prisma.user.update({
            where: { id: emp.userId },
            data: { isActive: false },
          });
          await prisma.refreshToken.updateMany({
            where: { userId: emp.userId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
      }
    }

    const updated = await prisma.hrOffboardingClearance.update({
      where: { id },
      data: updateData,
    });

    res.json({ success: true, data: updated, fullyCleared: allCleared });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Ex-Employee / Alumni Directory ───────────────────────────────────────────

offboardingRouter.get('/alumni', async (_req: Request, res: Response) => {
  try {
    const alumni = await prisma.hrEmployee.findMany({
      where: {
        status: { in: ['resigned', 'terminated', 'retired'] },
      },
      include: {
        department: true,
        position: true,
        offboardingClearances: { take: 1, orderBy: { createdAt: 'desc' } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({ success: true, data: alumni });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

