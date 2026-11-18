import { Router, Request, Response } from 'express';
import { prisma } from '../../../config/prisma';

export const leaveRouter = Router();

// ── Leave Types ──────────────────────────────────────────────────────────────

leaveRouter.get('/types', async (_req: Request, res: Response) => {
  try {
    const types = await prisma.hrLeaveType.findMany({ orderBy: { name: 'asc' } });
    res.json({ success: true, data: types });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

leaveRouter.post('/types', async (req: Request, res: Response) => {
  try {
    const { name, code, daysAllowed, isPaid, requiresAttachment, allowCarryOver, maxCarryOverDays } = req.body;
    const leaveType = await prisma.hrLeaveType.create({
      data: {
        name,
        code,
        daysAllowed: daysAllowed ? parseInt(daysAllowed, 10) : 20,
        isPaid: isPaid ?? true,
        requiresAttachment: requiresAttachment ?? false,
        allowCarryOver: allowCarryOver ?? false,
        maxCarryOverDays: maxCarryOverDays ? parseInt(maxCarryOverDays, 10) : 0,
      },
    });
    res.status(201).json({ success: true, data: leaveType });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Leave Balance Calculator ─────────────────────────────────────────────────

leaveRouter.get('/balances/:employeeId', async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params;
    const leaveTypes = await prisma.hrLeaveType.findMany();
    const approvedLeaves = await prisma.hrLeaveApplication.findMany({
      where: {
        employeeId,
        status: { in: ['approved_hr', 'approved_supervisor'] },
      },
    });

    const balances = leaveTypes.map((type) => {
      const usedDays = approvedLeaves
        .filter((l) => l.leaveTypeId === type.id)
        .reduce((sum, l) => sum + Number(l.daysRequested), 0);
      const remainingDays = Math.max(0, type.daysAllowed - usedDays);
      return {
        leaveTypeId: type.id,
        leaveTypeName: type.name,
        code: type.code,
        entitlement: type.daysAllowed,
        used: usedDays,
        remaining: remainingDays,
      };
    });

    res.json({ success: true, data: balances });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Submit Leave Application ─────────────────────────────────────────────────

leaveRouter.post('/apply', async (req: Request, res: Response) => {
  try {
    const { employeeId, leaveTypeId, startDate, endDate, daysRequested, reason } = req.body;
    if (!employeeId || !leaveTypeId || !startDate || !endDate || !daysRequested) {
      return res.status(400).json({ success: false, error: 'Missing required leave application fields' });
    }

    const application = await prisma.hrLeaveApplication.create({
      data: {
        employeeId,
        leaveTypeId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        daysRequested: Number(daysRequested),
        reason: reason || null,
        status: 'pending',
      },
      include: {
        employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
        leaveType: true,
      },
    });

    res.status(201).json({ success: true, data: application });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Supervisor & HR Approval Decision ────────────────────────────────────────

leaveRouter.post('/:id/decision', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { action, approvedById, rejectionReason } = req.body; // action: 'approve_supervisor' | 'approve_hr' | 'reject'

    let newStatus = 'pending';
    if (action === 'approve_supervisor') newStatus = 'approved_supervisor';
    else if (action === 'approve_hr') newStatus = 'approved_hr';
    else if (action === 'reject') newStatus = 'rejected';

    const updated = await prisma.hrLeaveApplication.update({
      where: { id },
      data: {
        status: newStatus,
        approvedById: approvedById || null,
        rejectionReason: rejectionReason || null,
      },
      include: { employee: true, leaveType: true },
    });

    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Leave Applications List & Filter ─────────────────────────────────────────

leaveRouter.get('/applications', async (req: Request, res: Response) => {
  try {
    const { employeeId, status, departmentId } = req.query;
    const where: any = {};
    if (employeeId) where.employeeId = employeeId as string;
    if (status) where.status = status as string;
    if (departmentId) where.employee = { departmentId: departmentId as string };

    const applications = await prisma.hrLeaveApplication.findMany({
      where,
      include: {
        employee: { select: { firstName: true, lastName: true, employeeNumber: true, department: true } },
        leaveType: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: applications });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

