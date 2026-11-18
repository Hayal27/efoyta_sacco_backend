import { Router, Request, Response } from 'express';
import { prisma } from '../../../config/prisma';

export const movementsRouter = Router();

// ── List Movements ────────────────────────────────────────────────────────────

movementsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { employeeId, movementType, status } = req.query;
    const where: any = {};
    if (employeeId) where.employeeId = employeeId as string;
    if (movementType) where.movementType = movementType as string;
    if (status) where.status = status as string;

    const movements = await prisma.hrEmployeeMovement.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeNumber: true,
            user: { select: { id: true, email: true, role: true } },
          },
        },
        fromBranch: { select: { id: true, name: true, code: true } },
        toBranch: { select: { id: true, name: true, code: true } },
        fromRole: { select: { id: true, name: true, slug: true } },
        toRole: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: movements });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Initiate Movement (Transfer, Promotion, Demotion) ─────────────────────────

movementsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const {
      employeeId,
      movementType, // 'transfer' | 'promotion' | 'demotion' | 'salary_adjustment' | 'branch_transfer' | 'role_elevation'
      fromDepartmentId,
      toDepartmentId,
      fromPositionId,
      toPositionId,
      fromBranchId,
      toBranchId,
      fromRoleId,
      toRoleId,
      fromSalary,
      toSalary,
      effectiveDate,
      justification,
    } = req.body;

    if (!employeeId || !movementType || !effectiveDate) {
      return res.status(400).json({ success: false, error: 'Employee, Movement Type, and Effective Date required' });
    }

    const movement = await prisma.hrEmployeeMovement.create({
      data: {
        employeeId,
        movementType,
        fromDepartmentId: fromDepartmentId || null,
        toDepartmentId: toDepartmentId || null,
        fromPositionId: fromPositionId || null,
        toPositionId: toPositionId || null,
        fromBranchId: fromBranchId || null,
        toBranchId: toBranchId || null,
        fromRoleId: fromRoleId || null,
        toRoleId: toRoleId || null,
        fromSalary: fromSalary || null,
        toSalary: toSalary || null,
        effectiveDate: new Date(effectiveDate),
        justification: justification || null,
        status: 'pending',
      },
      include: {
        employee: true,
        fromBranch: true,
        toBranch: true,
        fromRole: true,
        toRole: true,
      },
    });

    res.status(201).json({ success: true, data: movement });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Approve Movement & Apply Updates (Including System User Role & Branch) ─────

movementsRouter.post('/:id/approve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { approvedById } = req.body;

    const movement = await prisma.hrEmployeeMovement.findUnique({
      where: { id },
      include: { employee: true },
    });
    if (!movement) {
      return res.status(404).json({ success: false, error: 'Movement record not found' });
    }

    // Apply the movement to the employee profile in a transaction
    await prisma.$transaction(async (tx) => {
      await tx.hrEmployeeMovement.update({
        where: { id },
        data: { status: 'approved', approvedById: approvedById || null },
      });

      const updateData: any = {};
      if (movement.toDepartmentId) updateData.departmentId = movement.toDepartmentId;
      if (movement.toPositionId) updateData.positionId = movement.toPositionId;
      if (movement.toBranchId) updateData.branchId = movement.toBranchId;

      if (Object.keys(updateData).length > 0) {
        await tx.hrEmployee.update({
          where: { id: movement.employeeId },
          data: updateData,
        });
      }

      // If employee has a connected User account, sync Role and Branch
      const userId = movement.employee.userId;
      if (userId) {
        // Sync system role if toRoleId is specified
        if (movement.toRoleId) {
          await tx.user.update({
            where: { id: userId },
            data: { roleId: movement.toRoleId },
          });
        }

        // Sync system primary branch if toBranchId is specified
        if (movement.toBranchId) {
          await tx.userBranch.updateMany({
            where: { userId },
            data: { isPrimary: false },
          });

          await tx.userBranch.upsert({
            where: {
              userId_branchId: {
                userId,
                branchId: movement.toBranchId,
              },
            },
            update: { isPrimary: true },
            create: {
              userId,
              branchId: movement.toBranchId,
              isPrimary: true,
            },
          });
        }
      }
    });

    res.json({
      success: true,
      message: 'Movement approved. Employee profile, user role, and branch location successfully updated.',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Career Timeline ──────────────────────────────────────────────────────────

movementsRouter.get('/timeline/:employeeId', async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params;
    const movements = await prisma.hrEmployeeMovement.findMany({
      where: { employeeId, status: 'approved' },
      orderBy: { effectiveDate: 'asc' },
    });

    res.json({ success: true, data: movements });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

