import { prisma } from '../../config/prisma';
import type { Prisma } from '@prisma/client';

export const USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  telegram: true,
  gender: true,
  address: true,
  roleId: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  menuPermissions: true,
  branches: {
    select: {
      id: true,
      branchId: true,
      isPrimary: true,
      branch: {
        select: {
          id: true,
          name: true,
          code: true,
        }
      }
    },
    orderBy: [
      { isPrimary: 'desc' as const },
      { assignedAt: 'asc' as const },
    ]
  },
  hrEmployee: {
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      middleName: true,
      lastName: true,
      status: true,
      hireDate: true,
      department: {
        select: {
          id: true,
          name: true,
          code: true,
        }
      },
      position: {
        select: {
          id: true,
          title: true,
          code: true,
        }
      },
      branch: {
        select: {
          id: true,
          name: true,
          code: true,
        }
      }
    }
  },
  focalAgent: {
    select: {
      id: true,
      crmHeadId: true,
      fullName: true,
      region: true,
    }
  },
  createdAt: true,
  updatedAt: true,
};

export async function create(data: Prisma.UserCreateInput) {
  return prisma.user.create({
    data,
    select: USER_SELECT,
  });
}

export async function findById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: USER_SELECT,
  });
}

export async function findByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
    select: USER_SELECT,
  });
}

export async function update(id: string, data: Prisma.UserUpdateInput) {
  return prisma.user.update({
    where: { id },
    data,
    select: USER_SELECT,
  });
}

export async function search(params: { role?: string; branchId?: string; skip: number; take: number }) {
  const where: Prisma.UserWhereInput = {};
  if (params.role) where.role = { slug: params.role };
  if (params.branchId) {
    where.branches = {
      some: { branchId: params.branchId }
    };
  }

  const [data, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip: params.skip,
      take: params.take,
      orderBy: { createdAt: 'desc' },
      select: USER_SELECT,
    }),
    prisma.user.count({ where }),
  ]);

  return { data, total };
}

