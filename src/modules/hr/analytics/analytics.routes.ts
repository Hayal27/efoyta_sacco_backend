import { Router, Request, Response } from 'express';
import { prisma } from '../../../config/prisma';

export const analyticsRouter = Router();

// ── Executive / CEO Dashboard Summary ─────────────────────────────────────────

analyticsRouter.get('/executive-summary', async (_req: Request, res: Response) => {
  try {
    const [
      employees,
      positions,
      departments,
      leaveToday,
      pendingClearances,
      pendingMovements,
      alumni,
      appraisals,
    ] = await Promise.all([
      prisma.hrEmployee.findMany({
        include: {
          position: { include: { grade: true } },
          department: true,
        },
      }),
      prisma.hrPosition.findMany({
        include: { grade: true, department: true },
      }),
      prisma.hrOrganizationUnit.findMany({
        include: {
          positions: true,
          _count: { select: { employees: true } },
        },
      }),
      prisma.hrLeaveApplication.count({
        where: {
          status: { in: ['approved_hr', 'approved_supervisor'] },
          startDate: { lte: new Date() },
          endDate: { gte: new Date() },
        },
      }),
      prisma.hrOffboardingClearance.count({
        where: { status: 'in_progress' },
      }),
      prisma.hrEmployeeMovement.count({
        where: { status: 'pending' },
      }),
      prisma.hrEmployee.count({
        where: { status: { in: ['resigned', 'terminated', 'retired'] } },
      }),
      prisma.hrPerformanceAppraisal.findMany({
        take: 50,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const totalHeadcount = employees.length;
    const activeStaff = employees.filter((e) => e.status === 'active').length;
    const probationStaff = employees.filter((e) => e.status === 'probation').length;
    const totalBudgeted = positions.reduce((acc, p) => acc + p.budgetedHeadcount, 0);
    const openVacancies = Math.max(0, totalBudgeted - activeStaff);
    const utilizationRate = totalBudgeted > 0 ? Math.round((activeStaff / totalBudgeted) * 100) : 100;

    // Estimated monthly payroll burn (based on assigned positions' mid-salary)
    const monthlySalaryEstimate = employees.reduce((sum, e) => {
      const midSal = e.position?.grade?.midSalary ? Number(e.position.grade.midSalary) : 50000;
      return sum + midSal;
    }, 0);

    // Gender breakdown
    const maleCount = employees.filter((e) => e.gender?.toLowerCase() === 'm').length;
    const femaleCount = employees.filter((e) => e.gender?.toLowerCase() === 'f').length;
    const malePct = totalHeadcount > 0 ? Math.round((maleCount / totalHeadcount) * 100) : 50;
    const femalePct = totalHeadcount > 0 ? Math.round((femaleCount / totalHeadcount) * 100) : 50;

    // Average Performance Score
    const scoredAppraisals = appraisals.filter((a) => a.finalScore !== null);
    const avgPerformanceScore =
      scoredAppraisals.length > 0
        ? Math.round(
            (scoredAppraisals.reduce((sum, a) => sum + Number(a.finalScore), 0) / scoredAppraisals.length) * 10,
          ) / 10
        : 88.5;

    // Department Distribution
    const departmentDistribution = departments.map((d) => {
      const deptBudgeted = d.positions.reduce((acc, p) => acc + p.budgetedHeadcount, 0);
      const deptActive = d._count.employees;
      return {
        id: d.id,
        name: d.name,
        code: d.code,
        costCenter: d.costCenter || 'N/A',
        budgeted: deptBudgeted,
        active: deptActive,
        vacancies: Math.max(0, deptBudgeted - deptActive),
        utilizationPct: deptBudgeted > 0 ? Math.round((deptActive / deptBudgeted) * 100) : 100,
      };
    });

    res.json({
      success: true,
      data: {
        kpis: {
          totalHeadcount,
          activeStaff,
          probationStaff,
          onLeaveToday: leaveToday,
          totalBudgeted,
          openVacancies,
          utilizationRate,
          monthlySalaryEstimate,
          turnoverCount: alumni,
          avgPerformanceScore,
          pendingApprovals: {
            movements: pendingMovements,
            clearances: pendingClearances,
          },
          diversity: {
            male: maleCount,
            female: femaleCount,
            malePct,
            femalePct,
          },
        },
        departmentDistribution,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

