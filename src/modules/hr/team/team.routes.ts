import { Router, Request, Response } from 'express';
import { prisma } from '../../../config/prisma';

export const teamRouter = Router();

// ── Supervisor: Get Direct Team Members ──────────────────────────────────────

teamRouter.get('/:supervisorId/members', async (req: Request, res: Response) => {
  try {
    const { supervisorId } = req.params;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const members = await prisma.hrEmployee.findMany({
      where: { supervisorId },
      include: {
        position: { select: { title: true, code: true } },
        department: { select: { name: true, code: true } },
        attendanceRecords: {
          where: { workDate: today },
          take: 1,
        },
        leaveApplications: {
          where: {
            status: { in: ['approved_supervisor', 'approved_hr'] },
            startDate: { lte: today },
            endDate: { gte: today },
          },
          take: 1,
          include: { leaveType: true },
        },
      },
      orderBy: { firstName: 'asc' },
    });

    const enriched = members.map((m) => {
      const todayAttendance = m.attendanceRecords[0];
      const activeLeave = m.leaveApplications[0];

      let currentStatus = 'offline';
      if (activeLeave) {
        currentStatus = `On Leave (${activeLeave.leaveType.name})`;
      } else if (todayAttendance) {
        currentStatus = todayAttendance.checkOut ? 'Clocked Out' : 'Active (Clocked In)';
      }

      return {
        id: m.id,
        employeeNumber: m.employeeNumber,
        fullName: `${m.firstName} ${m.lastName}`,
        email: m.email,
        phone: m.phone,
        position: m.position?.title || 'Team Member',
        department: m.department?.name || 'Department',
        currentStatus,
        attendanceToday: todayAttendance || null,
        activeLeave: activeLeave || null,
      };
    });

    res.json({ success: true, data: enriched });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Supervisor: Pending Team Approvals Queue ─────────────────────────────────

teamRouter.get('/:supervisorId/pending-approvals', async (req: Request, res: Response) => {
  try {
    const { supervisorId } = req.params;

    // Find all subordinates
    const subordinates = await prisma.hrEmployee.findMany({
      where: { supervisorId },
      select: { id: true },
    });
    const subIds = subordinates.map((s) => s.id);

    if (subIds.length === 0) {
      return res.json({ success: true, data: { leaveRequests: [], appraisals: [] } });
    }

    const [leaveRequests, appraisals] = await Promise.all([
      prisma.hrLeaveApplication.findMany({
        where: {
          employeeId: { in: subIds },
          status: 'pending',
        },
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
          leaveType: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.hrPerformanceAppraisal.findMany({
        where: {
          employeeId: { in: subIds },
          status: 'submitted', // employee submitted self score, awaiting manager
        },
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
          cycle: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    res.json({
      success: true,
      data: {
        leaveRequests,
        appraisals,
        totalPending: leaveRequests.length + appraisals.length,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

