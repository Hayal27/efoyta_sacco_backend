import { prisma } from '../../config/prisma';

export async function listBranches() {
  return prisma.branch.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { users: true, employees: true, organizationUnits: true } },
    },
  });
}

export async function findById(id: string) {
  return prisma.branch.findUnique({
    where: { id },
    include: {
      users: {
        include: {
          user: {
            select: { id: true, fullName: true, email: true, phone: true, isActive: true, role: { select: { name: true, slug: true } } }
          }
        },
        orderBy: { assignedAt: 'asc' }
      },
      employees: {
        select: {
          id: true,
          employeeNumber: true,
          firstName: true,
          lastName: true,
          status: true,
          hireDate: true,
          position: { select: { id: true, title: true, code: true } },
          department: { select: { id: true, name: true, code: true } },
          user: { select: { id: true, email: true, isActive: true } }
        },
        orderBy: { createdAt: 'desc' }
      },
      organizationUnits: {
        select: {
          id: true,
          name: true,
          code: true,
        },
        orderBy: { name: 'asc' }
      },
      _count: { select: { users: true, employees: true, organizationUnits: true } }
    }
  });
}

export async function createBranch(data: {
  name: string;
  code: string;
  address?: string;
  phone?: string;
  email?: string;
}) {
  return prisma.branch.create({ data });
}

export async function updateBranch(id: string, data: {
  name?: string;
  code?: string;
  address?: string;
  phone?: string;
  email?: string;
  isActive?: boolean;
}) {
  return prisma.branch.update({ where: { id }, data });
}

export async function deleteBranch(id: string) {
  return prisma.branch.delete({ where: { id } });
}

export async function assignUser(branchId: string, userId: string, isPrimary = false) {
  // If isPrimary, unset any other primary for this user first
  if (isPrimary) {
    await prisma.userBranch.updateMany({
      where: { userId, isPrimary: true },
      data: { isPrimary: false },
    });
  }
  return prisma.userBranch.upsert({
    where: { userId_branchId: { userId, branchId } },
    create: { userId, branchId, isPrimary },
    update: { isPrimary },
    include: {
      user: { select: { id: true, fullName: true, email: true } },
      branch: { select: { id: true, name: true, code: true } },
    }
  });
}

export async function removeUser(branchId: string, userId: string) {
  return prisma.userBranch.delete({
    where: { userId_branchId: { userId, branchId } },
  });
}

export async function getUserBranches(userId: string) {
  const userBranches = await prisma.userBranch.findMany({
    where: { userId },
    include: { branch: true },
    orderBy: [{ isPrimary: 'desc' }, { assignedAt: 'asc' }]
  });

  const hrEmployee = await prisma.hrEmployee.findFirst({
    where: { userId, branchId: { not: null } },
    include: { branch: true },
  });

  const results = [...userBranches];
  if (hrEmployee?.branch && !results.some(ub => ub.branchId === hrEmployee.branchId)) {
    results.push({
      id: `hr-${hrEmployee.id}`,
      userId,
      branchId: hrEmployee.branchId!,
      isPrimary: results.length === 0,
      assignedAt: hrEmployee.createdAt,
      branch: hrEmployee.branch,
    } as any);
  }

  return results;
}
