import { prisma } from '../../config/prisma';
import { NotFoundError, BusinessRuleError } from '../../shared/errors/app-error';

export async function listRoles() {
  return prisma.role.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      _count: { select: { users: true, positions: true } },
      positions: {
        select: {
          id: true,
          title: true,
          code: true,
        }
      },
      menus: true,
    },
  });
}

export async function createRole(data: { name: string; slug: string; description?: string }) {
  const existing = await prisma.role.findUnique({ where: { slug: data.slug } });
  if (existing) throw new BusinessRuleError('Role slug already exists');

  return prisma.role.create({ data });
}

export async function getRole(id: string) {
  const role = await prisma.role.findUnique({
    where: { id },
    include: {
      menus: {
        include: {
          menu: true
        }
      },
      positions: {
        select: {
          id: true,
          title: true,
          code: true,
          department: {
            select: { id: true, name: true, code: true }
          }
        }
      },
      _count: { select: { users: true, positions: true } }
    }
  });
  if (!role) throw new NotFoundError('Role');
  return role;
}

export async function updateRole(id: string, data: { name?: string; slug?: string; description?: string }) {
  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) throw new NotFoundError('Role');

  if (role.isSystem && data.slug && data.slug !== role.slug) {
    throw new BusinessRuleError('Cannot change slug of a system role');
  }

  return prisma.role.update({
    where: { id },
    data
  });
}

export async function deleteRole(id: string) {
  const role = await prisma.role.findUnique({ 
    where: { id },
    include: { _count: { select: { users: true, positions: true } } }
  });
  if (!role) throw new NotFoundError('Role');

  if (role.isSystem) throw new BusinessRuleError('Cannot delete a system role');
  if (role._count.users > 0) throw new BusinessRuleError('Cannot delete role with assigned users');
  if (role._count.positions > 0) throw new BusinessRuleError('Cannot delete role mapped to HR positions');

  await prisma.role.delete({ where: { id } });
}

export async function updateRoleMenus(id: string, menuIds: string[]) {
  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) throw new NotFoundError('Role');

  // Use a transaction to delete existing mappings and create new ones
  await prisma.$transaction(async (tx) => {
    await tx.roleMenu.deleteMany({ where: { roleId: id } });
    
    if (menuIds.length > 0) {
      await tx.roleMenu.createMany({
        data: menuIds.map(menuId => ({
          roleId: id,
          menuId
        }))
      });
    }
  });

  return getRole(id);
}
