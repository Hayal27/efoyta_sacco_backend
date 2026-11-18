import { PrismaClient } from '@prisma/client';
import { ensureCashManagementGLAccounts, ensureVaultForBranch, ensureTillForUser } from '../src/modules/cash-management/cash-management.service';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting Cash & Vault Management Database Initialization...');

  // 1. Ensure GL accounts
  console.log('Checking & seeding Cash GL accounts...');
  await ensureCashManagementGLAccounts();
  console.log('✅ Cash GL Accounts ready (1011, 1012, 1020, 4040, 5050)');

  // 2. Ensure Head Cashier Role exists
  const existingHeadCashierRole = await prisma.role.findUnique({ where: { slug: 'head_cashier' } });
  if (!existingHeadCashierRole) {
    await prisma.role.create({
      data: {
        name: 'Head Cashier',
        slug: 'head_cashier',
        description: 'Authorized to issue vault cash, execute bank movements, and verify teller closing cash handovers.',
        isSystem: true,
      },
    });
    console.log('✅ Created role: Head Cashier');
  }

  // 3. Ensure Vaults for all branches
  const branches = await prisma.branch.findMany();
  for (const b of branches) {
    const v = await ensureVaultForBranch(b.id);
    console.log(`✅ Vault ready for branch "${b.name}": ${v.name} (${v.code})`);
  }

  // 4. Ensure Tills for cashiers & admins
  const cashiersAndAdmins = await prisma.user.findMany({
    where: {
      role: { slug: { in: ['cashier', 'admin', 'super_admin', 'head_cashier'] } },
    },
  });

  const defaultBranchId = branches[0]?.id;
  if (defaultBranchId) {
    for (const u of cashiersAndAdmins) {
      const till = await ensureTillForUser(u.id, defaultBranchId);
      console.log(`✅ Till drawer ready for user "${u.fullName || u.email}": ${till.name} (${till.code})`);
    }
  }

  // 5. Add / Upsert Menu in Database
  console.log('Adding "Cash & Vault Management" Menu to Database...');
  const parent = await prisma.menu.upsert({
    where: { slug: 'cash-management' },
    update: {
      labelKey: 'sidebar.cash_management',
      label: 'Cash & Vault Management',
      path: '/cash-management',
      icon: 'Wallet',
      color: '#16a34a',
      bg: '#dcfce7',
      order: 45,
    },
    create: {
      slug: 'cash-management',
      labelKey: 'sidebar.cash_management',
      label: 'Cash & Vault Management',
      path: '/cash-management',
      icon: 'Wallet',
      color: '#16a34a',
      bg: '#dcfce7',
      order: 45,
    },
  });

  const subMenus = [
    { slug: 'cash_overview', labelKey: 'sidebar.cash_overview', label: 'Cash Overview & Tills', path: '/cash-management', icon: 'LayoutDashboard', order: 1 },
    { slug: 'cash_vault', labelKey: 'sidebar.cash_vault', label: 'Vault & Bank Movements', path: '/cash-management/vault', icon: 'Building2', order: 2 },
    { slug: 'cash_tills', labelKey: 'sidebar.cash_tills', label: 'Till Drawers & Sessions', path: '/cash-management/tills', icon: 'PiggyBank', order: 3 },
    { slug: 'cash_transfers', labelKey: 'sidebar.cash_transfers', label: 'Cash Transfer Workflow', path: '/cash-management/transfers', icon: 'ArrowLeftRight', order: 4 },
    { slug: 'cash_variances', labelKey: 'sidebar.cash_variances', label: 'Cash Variances & Reconciliation', path: '/cash-management/variances', icon: 'Scale', order: 5 },
    { slug: 'cash_reports', labelKey: 'sidebar.cash_reports', label: 'Cash Reports & Registers', path: '/cash-management/reports', icon: 'FileSpreadsheet', order: 6 },
  ];

  const menuIds = [parent.id];
  for (const item of subMenus) {
    const child = await prisma.menu.upsert({
      where: { slug: item.slug },
      update: {
        labelKey: item.labelKey,
        label: item.label,
        path: item.path,
        icon: item.icon,
        color: '#16a34a',
        bg: '#dcfce7',
        parentId: parent.id,
        order: item.order,
      },
      create: {
        slug: item.slug,
        labelKey: item.labelKey,
        label: item.label,
        path: item.path,
        icon: item.icon,
        color: '#16a34a',
        bg: '#dcfce7',
        parentId: parent.id,
        order: item.order,
      },
    });
    menuIds.push(child.id);
  }

  // Grant to roles
  const roles = await prisma.role.findMany({
    where: {
      slug: { in: ['super_admin', 'admin', 'cashier', 'head_cashier', 'auditor'] },
    },
  });

  for (const role of roles) {
    for (const menuId of menuIds) {
      await prisma.roleMenu.upsert({
        where: { roleId_menuId: { roleId: role.id, menuId } },
        update: {},
        create: { roleId: role.id, menuId },
      });
    }
  }

  console.log(`✅ Permissions granted to ${roles.length} roles (${roles.map((r) => r.slug).join(', ')})`);
  console.log('🎉 Cash & Vault Management initialization completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error during cash management seed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
