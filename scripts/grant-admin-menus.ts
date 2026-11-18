import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Checking roles and menus...');

  const targetRoles = await prisma.role.findMany({
    where: { slug: { in: ['super_admin', 'admin'] } },
  });

  if (targetRoles.length === 0) {
    console.error('❌ Neither "super_admin" nor "admin" roles found in database.');
    return;
  }

  const allMenus = await prisma.menu.findMany();
  if (allMenus.length === 0) {
    console.warn('⚠️ No menus found in database! Please run seed-roles.ts first.');
    return;
  }

  console.log(`📋 Found ${allMenus.length} menus in database.`);

  for (const role of targetRoles) {
    console.log(`\n⏳ Granting permissions to role: ${role.name} (${role.slug})...`);
    let grantedCount = 0;

    for (const menu of allMenus) {
      await prisma.roleMenu.upsert({
        where: {
          roleId_menuId: {
            roleId: role.id,
            menuId: menu.id,
          },
        },
        update: {},
        create: {
          roleId: role.id,
          menuId: menu.id,
        },
      });
      grantedCount++;
    }

    console.log(`✅ Granted ${grantedCount} menus to role "${role.name}".`);
  }

  console.log('\n🎉 Successfully granted all menu permissions to admin and super_admin!');
}

main()
  .catch((e) => {
    console.error('Error granting menus:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

