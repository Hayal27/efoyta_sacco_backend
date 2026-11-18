import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Registering Account Verification & Security menu in DB...');

  // 1. Check for 'settings' parent or create standalone menu
  const settingsParent = await prisma.menu.findUnique({ where: { slug: 'settings' } });

  const verificationMenu = await prisma.menu.upsert({
    where: { slug: 'verifications' },
    update: {
      label: 'Account Verification & Security',
      labelKey: 'sidebar.verifications',
      path: '/security/verifications',
      icon: 'ShieldCheck',
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
      order: 4,
    },
    create: {
      slug: 'verifications',
      labelKey: 'sidebar.verifications',
      label: 'Account Verification & Security',
      path: '/security/verifications',
      icon: 'ShieldCheck',
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
      parentId: settingsParent?.id || null,
      order: 4,
    },
  });

  console.log('✓ Verification Menu upserted:', verificationMenu.id);

  // 2. Grant permissions to super_admin, admin, branch_manager, auditor, compliance_officer
  const roles = await prisma.role.findMany({
    where: {
      slug: {
        in: ['super_admin', 'admin', 'branch_manager', 'auditor', 'compliance_officer', 'crm_head'],
      },
    },
  });

  for (const role of roles) {
    await prisma.roleMenu.upsert({
      where: {
        roleId_menuId: {
          roleId: role.id,
          menuId: verificationMenu.id,
        },
      },
      update: {},
      create: {
        roleId: role.id,
        menuId: verificationMenu.id,
      },
    });
    console.log(`  ✓ Granted menu to role: ${role.slug}`);
  }

  console.log('Menu migration completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
