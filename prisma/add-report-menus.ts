import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addReportMenus() {
  console.log('🌱 Adding new report child menus...');

  try {
    const parentMenu = await prisma.menu.findUnique({ where: { slug: 'reports' } });
    if (!parentMenu) {
      console.log('❌ Parent "reports" menu not found!');
      return;
    }

    const newMenus = [
      { slug: 'reports_member', label: 'Member Report', path: '/reports/member', order: 12 },
      { slug: 'reports_share', label: 'Share Report', path: '/reports/share', order: 13 },
      { slug: 'reports_loan', label: 'Loan Report', path: '/reports/loan', order: 14 },
      { slug: 'reports_collection', label: 'Collection Report', path: '/reports/collection', order: 15 },
      { slug: 'reports_guarantor', label: 'Guarantor & Liabilities', path: '/reports/guarantor', order: 16 }
    ];

    const adminRoles = await prisma.role.findMany({
      where: { slug: { in: ['super_admin', 'admin'] } }
    });

    for (const menu of newMenus) {
      let dbMenu = await prisma.menu.findUnique({ where: { slug: menu.slug } });
      if (!dbMenu) {
        dbMenu = await prisma.menu.create({
          data: {
            slug: menu.slug,
            labelKey: '',
            label: menu.label,
            path: menu.path,
            icon: 'Circle',
            color: '#e65100',
            bg: 'transparent',
            parentId: parentMenu.id,
            order: menu.order,
          }
        });
        console.log(`✅ Created menu: ${menu.slug}`);
      }

      for (const role of adminRoles) {
        await prisma.roleMenu.upsert({
          where: {
            roleId_menuId: {
              roleId: role.id,
              menuId: dbMenu.id
            }
          },
          update: {},
          create: {
            roleId: role.id,
            menuId: dbMenu.id
          }
        });
      }
    }
    console.log('🎉 Report menus fully registered and assigned to admins!');
  } catch (error) {
    console.error('❌ Failed to add menus:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addReportMenus();
