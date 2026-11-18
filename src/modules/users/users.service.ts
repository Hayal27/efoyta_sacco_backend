import bcrypt from 'bcryptjs';
import { NotFoundError, BusinessRuleError } from '../../shared/errors/app-error';
import * as usersRepo from './users.repository';
import type { CreateUserDto, UpdateUserDto } from '@coop/types';
import { prisma } from '../../config/prisma';

export async function createUser(data: CreateUserDto) {
  const existing = await usersRepo.findByEmail(data.email);
  if (existing) {
    throw new BusinessRuleError('Email already registered');
  }

  const passwordStr = data.password || 'Temp@1234';
  const passwordHash = await bcrypt.hash(passwordStr, 12);

  const role = await prisma.role.findUnique({ where: { id: data.roleId } });
  if (!role) throw new BusinessRuleError('Invalid role');

  const user = await usersRepo.create({
    email: data.email,
    passwordHash,
    role: { connect: { id: data.roleId } },
    fullName: data.fullName ?? null,
    phone: data.phone ?? null,
    telegram: data.telegram ?? null,
    gender: data.gender as any ?? null,
    address: data.address ?? null,
    menuPermissions: data.menuPermissions ?? null,
    mustChangePassword: !data.password,
    isActive: true,
    ...(role.slug === 'focal_agent' && {
      focalAgent: {
        create: {
          fullName: data.fullName || data.email.split('@')[0],
          phone: data.phone || 'N/A',
          region: data.address ?? null,
        }
      }
    }),
  });

  // Assign operating branch if provided
  let effectiveBranchId = data.branchId;

  // Link to HR Employee profile if provided
  if (data.hrEmployeeId) {
    const emp = await prisma.hrEmployee.findUnique({ where: { id: data.hrEmployeeId } });
    if (emp) {
      if (!effectiveBranchId && emp.branchId) {
        effectiveBranchId = emp.branchId;
      }
      await prisma.hrEmployee.update({
        where: { id: emp.id },
        data: {
          userId: user.id,
          ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}),
        }
      });
    }
  }

  if (effectiveBranchId) {
    await prisma.userBranch.create({
      data: {
        userId: user.id,
        branchId: effectiveBranchId,
        isPrimary: true,
      }
    });
  }

  return usersRepo.findById(user.id);
}

export async function updateUser(id: string, data: UpdateUserDto) {
  const user = await usersRepo.findById(id);
  if (!user) throw new NotFoundError('User');

  const updateData: any = {};
  if (data.roleId) updateData.roleId = data.roleId;
  if (data.fullName !== undefined) updateData.fullName = data.fullName;
  if (data.phone !== undefined) updateData.phone = data.phone;
  if (data.telegram !== undefined) updateData.telegram = data.telegram;
  if (data.gender !== undefined) updateData.gender = data.gender;
  if (data.address !== undefined) updateData.address = data.address;
  if (data.menuPermissions !== undefined) updateData.menuPermissions = data.menuPermissions;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  if (Object.keys(updateData).length > 0) {
    await usersRepo.update(id, updateData);
  }

  // Update primary branch if provided
  if (data.branchId) {
    await prisma.userBranch.updateMany({
      where: { userId: id, isPrimary: true },
      data: { isPrimary: false },
    });
    await prisma.userBranch.upsert({
      where: { userId_branchId: { userId: id, branchId: data.branchId } },
      create: { userId: id, branchId: data.branchId, isPrimary: true },
      update: { isPrimary: true },
    });
    // Align linked HR employee branch as well
    await prisma.hrEmployee.updateMany({
      where: { userId: id },
      data: { branchId: data.branchId },
    });
  }

  // Link or unlink HR Employee profile
  if (data.hrEmployeeId !== undefined) {
    // Unlink any currently linked employee for this user
    await prisma.hrEmployee.updateMany({
      where: { userId: id },
      data: { userId: null },
    });

    if (data.hrEmployeeId) {
      await prisma.hrEmployee.update({
        where: { id: data.hrEmployeeId },
        data: {
          userId: id,
          ...(data.branchId ? { branchId: data.branchId } : {}),
        },
      });
    }
  }

  return usersRepo.findById(id);
}

export async function resetPassword(id: string) {
  const user = await usersRepo.findById(id);
  if (!user) throw new NotFoundError('User');

  const passwordHash = await bcrypt.hash('Temp@1234', 12);
  await usersRepo.update(id, { passwordHash, mustChangePassword: true });
  return { message: 'Password reset to default (Temp@1234)' };
}

export async function listUsers(query: { role?: string; branchId?: string; page?: number; limit?: number }) {
  const page = query.page && query.page > 0 ? query.page : 1;
  const limit = query.limit && query.limit > 0 ? query.limit : 20;
  const skip = (page - 1) * limit;

  const result = await usersRepo.search({
    role: query.role,
    branchId: query.branchId,
    skip,
    take: limit,
  });

  return {
    items: result.data,
    total: result.total,
    page,
    limit,
    totalPages: Math.ceil(result.total / limit),
  };
}

export async function assignCrmHead(focalAgentId: string, crmHeadId: string | null) {
  // We assume focalAgentId is actually the User ID of the focal agent, or the focalAgent table's ID?
  // Let's check if the ID passed is the user ID or focal agent ID. Let's assume focalAgent table ID.
  const agent = await prisma.focalAgent.findUnique({ where: { id: focalAgentId } });
  if (!agent) {
    // try to find by userId just in case
    const agentByUser = await prisma.focalAgent.findUnique({ where: { userId: focalAgentId } });
    if (!agentByUser) throw new NotFoundError('Focal Agent');
    return prisma.focalAgent.update({
      where: { id: agentByUser.id },
      data: { crmHeadId }
    });
  }

  return prisma.focalAgent.update({
    where: { id: focalAgentId },
    data: { crmHeadId }
  });
}
