import { Router, Request, Response } from 'express';
import { prisma } from '../../../config/prisma';

export const attendanceRouter = Router();

// ── Clock-In (Web / Mobile / Biometric) ──────────────────────────────────────

attendanceRouter.post('/clock-in', async (req: Request, res: Response) => {
  try {
    const { employeeId, source, notes } = req.body;
    if (!employeeId) {
      return res.status(400).json({ success: false, error: 'Employee ID is required' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const now = new Date();
    // 8:30 AM threshold for late arrival check
    const isLate = now.getHours() > 8 || (now.getHours() === 8 && now.getMinutes() > 30);

    const record = await prisma.hrAttendanceRecord.upsert({
      where: {
        employeeId_workDate: {
          employeeId,
          workDate: today,
        },
      },
      update: {
        checkIn: now,
        status: isLate ? 'late' : 'present',
        source: source || 'web',
      },
      create: {
        employeeId,
        workDate: today,
        checkIn: now,
        status: isLate ? 'late' : 'present',
        source: source || 'web',
        notes: notes || null,
      },
    });

    res.json({ success: true, data: record });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Clock-Out ────────────────────────────────────────────────────────────────

attendanceRouter.post('/clock-out', async (req: Request, res: Response) => {
  try {
    const { employeeId, notes } = req.body;
    if (!employeeId) {
      return res.status(400).json({ success: false, error: 'Employee ID is required' });
    }

    const now = new Date();

    const existing = await prisma.hrAttendanceRecord.findFirst({
      where: {
        employeeId,
        checkOut: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'No active clock-in session found for this employee' });
    }

    let regularHours = 8;
    let overtimeHours = 0;

    if (existing.checkIn) {
      const diffMs = now.getTime() - new Date(existing.checkIn).getTime();
      const totalHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
      regularHours = Math.min(8, totalHours);
      overtimeHours = Math.max(0, totalHours - 8);
    }

    const updated = await prisma.hrAttendanceRecord.update({
      where: { id: existing.id },
      data: {
        checkOut: now,
        regularHours,
        overtimeHours,
        notes: notes || existing.notes,
      },
    });

    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Monthly Employee Timesheet ───────────────────────────────────────────────

attendanceRouter.get('/timesheet/:employeeId', async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params;
    const { month, year } = req.query;

    const currentYear = year ? parseInt(year as string, 10) : new Date().getFullYear();
    const currentMonth = month ? parseInt(month as string, 10) - 1 : new Date().getMonth();

    const startDate = new Date(currentYear, currentMonth, 1);
    const endDate = new Date(currentYear, currentMonth + 1, 0);

    const records = await prisma.hrAttendanceRecord.findMany({
      where: {
        employeeId,
        workDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { workDate: 'asc' },
    });

    const totalRegularHours = records.reduce((sum, r) => sum + Number(r.regularHours), 0);
    const totalOvertimeHours = records.reduce((sum, r) => sum + Number(r.overtimeHours), 0);
    const lateDays = records.filter((r) => r.status === 'late').length;

    res.json({
      success: true,
      data: {
        records,
        summary: {
          totalDaysLogged: records.length,
          totalRegularHours,
          totalOvertimeHours,
          lateDays,
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── List Attendance Records (For HR Admin Master Attendance Log) ─────────────
attendanceRouter.get('/records', async (req: Request, res: Response) => {
  try {
    const { status, employeeId, date } = req.query;
    const where: any = {};
    if (status) where.status = status as string;
    if (employeeId) where.employeeId = employeeId as string;
    if (date) {
      const d = new Date(date as string);
      d.setHours(0, 0, 0, 0);
      where.workDate = d;
    }

    const records = await prisma.hrAttendanceRecord.findMany({
      where,
      take: 100,
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
      orderBy: { workDate: 'desc' },
    });

    res.json({ success: true, data: records });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Daily Attendance Summary ──────────────────────────────────────────────────
attendanceRouter.get('/today-summary', async (_req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalActive, todayRecords] = await Promise.all([
      prisma.hrEmployee.count({ where: { status: 'active' } }),
      prisma.hrAttendanceRecord.findMany({
        where: { workDate: today },
      }),
    ]);

    const present = todayRecords.length;
    const late = todayRecords.filter((r) => r.status === 'late').length;
    const clockedOut = todayRecords.filter((r) => r.checkOut !== null).length;
    const currentlyActive = present - clockedOut;
    const absent = Math.max(0, totalActive - present);

    res.json({
      success: true,
      data: {
        totalActive,
        present,
        currentlyActive,
        clockedOut,
        late,
        absent,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});


