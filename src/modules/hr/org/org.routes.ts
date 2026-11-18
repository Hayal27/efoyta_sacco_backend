import { Router, Request, Response } from 'express';
import { prisma } from '../../../config/prisma';

export const orgRouter = Router();

// ── Organizational Units ──────────────────────────────────────────────────────

// Get organizational hierarchy tree
orgRouter.get('/units/tree', async (_req: Request, res: Response) => {
  try {
    const units = await prisma.hrOrganizationUnit.findMany({
      where: { isActive: true },
      include: {
        children: true,
        branch: { select: { id: true, name: true, code: true } },
        positions: {
          include: {
            grade: true,
            defaultRole: { select: { id: true, name: true, slug: true } },
            employees: {
              where: { status: 'active' },
              select: {
                id: true,
                firstName: true,
                lastName: true,
                employeeNumber: true,
                email: true,
                supervisorId: true,
                branchId: true,
                branch: { select: { id: true, name: true, code: true } },
                user: { select: { id: true, email: true, role: { select: { id: true, name: true, slug: true } } } },
              },
            },
          },
        },
        _count: { select: { employees: true } },
      },
    });

    // Build recursive tree from root units (units without parent)
    const roots = units.filter((u) => !u.parentId);
    const buildTree = (parent: any): any => {
      const children = units.filter((u) => u.parentId === parent.id);
      return {
        ...parent,
        employeeCount: parent._count?.employees || 0,
        children: children.map(buildTree),
      };
    };

    res.json({ success: true, data: roots.map(buildTree) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get people / employee hierarchical reporting tree
orgRouter.get('/employee-hierarchy', async (_req: Request, res: Response) => {
  try {
    const employees = await prisma.hrEmployee.findMany({
      where: { status: 'active' },
      include: {
        department: { select: { id: true, name: true, code: true } },
        position: {
          select: {
            id: true,
            title: true,
            code: true,
            grade: true,
            defaultRole: { select: { id: true, name: true, slug: true } },
          },
        },
        branch: { select: { id: true, name: true, code: true } },
        user: { select: { id: true, email: true, role: { select: { id: true, name: true, slug: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const empMap = new Map();
    employees.forEach((e) => empMap.set(e.id, { ...e, directReports: [] }));

    const roots: any[] = [];
    employees.forEach((e) => {
      const node = empMap.get(e.id);
      if (e.supervisorId && empMap.has(e.supervisorId)) {
        empMap.get(e.supervisorId).directReports.push(node);
      } else {
        roots.push(node);
      }
    });

    res.json({ success: true, data: roots });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// List all units flat
orgRouter.get('/units', async (_req: Request, res: Response) => {
  try {
    const units = await prisma.hrOrganizationUnit.findMany({
      include: {
        parent: { select: { id: true, name: true, code: true } },
        branch: { select: { id: true, name: true, code: true } },
        _count: { select: { positions: true, employees: true } },
      },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: units });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create organization unit
orgRouter.post('/units', async (req: Request, res: Response) => {
  try {
    const { code, name, unitType, parentId, branchId, costCenter } = req.body;
    if (!code || !name) {
      return res.status(400).json({ success: false, error: 'Code and Name are required' });
    }

    const unit = await prisma.hrOrganizationUnit.create({
      data: {
        code,
        name,
        unitType: unitType || 'department',
        parentId: parentId || null,
        branchId: branchId || null,
        costCenter: costCenter || null,
      },
      include: { branch: true },
    });

    res.status(201).json({ success: true, data: unit });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Job Grades ────────────────────────────────────────────────────────────────

orgRouter.get('/grades', async (_req: Request, res: Response) => {
  try {
    const grades = await prisma.hrJobGrade.findMany({
      orderBy: { level: 'asc' },
      include: { _count: { select: { positions: true } } },
    });
    res.json({ success: true, data: grades });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

orgRouter.post('/grades', async (req: Request, res: Response) => {
  try {
    const { name, level, minSalary, midSalary, maxSalary } = req.body;
    const grade = await prisma.hrJobGrade.create({
      data: {
        name,
        level: level ? parseInt(level, 10) : 1,
        minSalary: minSalary || 0,
        midSalary: midSalary || 0,
        maxSalary: maxSalary || 0,
      },
    });
    res.status(201).json({ success: true, data: grade });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Positions ─────────────────────────────────────────────────────────────────

orgRouter.get('/positions', async (_req: Request, res: Response) => {
  try {
    const positions = await prisma.hrPosition.findMany({
      include: {
        department: { select: { id: true, name: true, code: true } },
        grade: true,
        defaultRole: { select: { id: true, name: true, slug: true } },
        _count: { select: { employees: true } },
      },
      orderBy: { title: 'asc' },
    });
    res.json({ success: true, data: positions });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

orgRouter.post('/positions', async (req: Request, res: Response) => {
  try {
    const { code, title, departmentId, gradeId, defaultRoleId, budgetedHeadcount, jobDescription } = req.body;
    if (!code || !title || !departmentId) {
      return res.status(400).json({ success: false, error: 'Code, Title, and Department are required' });
    }

    const position = await prisma.hrPosition.create({
      data: {
        code,
        title,
        departmentId,
        gradeId: gradeId || null,
        defaultRoleId: defaultRoleId || null,
        budgetedHeadcount: budgetedHeadcount ? parseInt(budgetedHeadcount, 10) : 1,
        jobDescription: jobDescription || null,
      },
      include: { department: true, grade: true, defaultRole: true },
    });

    res.status(201).json({ success: true, data: position });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Reference Lookups: Branches & Roles for HR Modules ────────────────────────

orgRouter.get('/branches', async (_req: Request, res: Response) => {
  try {
    const branches = await prisma.branch.findMany({
      where: { isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        address: true,
        phone: true,
        _count: { select: { employees: true, users: true } },
      },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: branches });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

orgRouter.get('/roles', async (_req: Request, res: Response) => {
  try {
    const roles = await prisma.role.findMany({
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        _count: { select: { users: true, positions: true } },
      },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: roles });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});


