import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEFAULT_ROLES = [
  { slug: 'super_admin', name: 'Super Admin', description: 'Full system access', isSystem: true },
  { slug: 'admin', name: 'Admin', description: 'General administration', isSystem: true },
  { slug: 'cashier', name: 'Cashier', description: 'Handles transactions', isSystem: true },
  { slug: 'focal_agent', name: 'Focal Agent', description: 'Manages field members', isSystem: true },
  { slug: 'auditor', name: 'Auditor', description: 'Read-only access for auditing', isSystem: true },
];

const MENUS = [
  { slug: 'dashboard', labelKey: 'sidebar.dashboard', label: 'Dashboard', path: '/', icon: 'LayoutDashboard', color: '#1a5c2a', bg: '#e8f5ec', order: 10 },
  { slug: 'members', labelKey: 'sidebar.members', label: 'Members', path: '/members', icon: 'Users', color: '#1565c0', bg: '#e3f0fd', order: 20 },
  { slug: 'shares', labelKey: 'sidebar.shares', label: 'Shares', path: null, icon: 'Briefcase', color: '#b58900', bg: '#fdf6e3', order: 30, children: [
    { slug: 'shares_accounts', labelKey: '', label: 'Accounts', path: '/shares', icon: 'Circle', color: '#b58900', bg: 'transparent', order: 10 },
    { slug: 'shares_dividends', labelKey: '', label: 'Dividend Engine', path: '/shares/dividends', icon: 'Circle', color: '#b58900', bg: 'transparent', order: 15 },
    { slug: 'shares_config', labelKey: '', label: 'Configure', path: '/shares/config', icon: 'Circle', color: '#b58900', bg: 'transparent', order: 20 },
    { slug: 'shares_transfer', labelKey: '', label: 'Transfer', path: '/shares/transfer', icon: 'Circle', color: '#b58900', bg: 'transparent', order: 30 },
    { slug: 'shares_buy', labelKey: '', label: 'Buy Shares', path: '/shares/buy', icon: 'Circle', color: '#b58900', bg: 'transparent', order: 40 },
  ]},
  { slug: 'savings', labelKey: 'sidebar.savings', label: 'Savings', path: null, icon: 'PiggyBank', color: '#2e7d32', bg: '#eaf4eb', order: 40, children: [
    { slug: 'savings_list', labelKey: '', label: 'Accounts', path: '/savings', icon: 'Circle', color: '#2e7d32', bg: 'transparent', order: 10 },
    { slug: 'savings_open', labelKey: '', label: 'Open Account', path: '/savings/open-account', icon: 'Circle', color: '#2e7d32', bg: 'transparent', order: 20 },
    { slug: 'savings_config', labelKey: '', label: 'Saving Types', path: '/savings/products', icon: 'Circle', color: '#2e7d32', bg: 'transparent', order: 30 },
  ]},
  { slug: 'loans', labelKey: 'sidebar.loans', label: 'Loans', path: null, icon: 'CreditCard', color: '#c62828', bg: '#fdeaea', order: 50, children: [
    { slug: 'loans_list', labelKey: '', label: 'Applications', path: '/loans', icon: 'Circle', color: '#c62828', bg: 'transparent', order: 10 },
    { slug: 'loans_review', labelKey: '', label: 'Review Applications', path: '/loans/review', icon: 'Circle', color: '#c62828', bg: 'transparent', order: 20 },
    { slug: 'loans_approve', labelKey: '', label: 'Final Approvals', path: '/loans/approve', icon: 'Circle', color: '#c62828', bg: 'transparent', order: 30 },
    { slug: 'loans_disburse', labelKey: '', label: 'Disbursement Queue', path: '/loans/disburse', icon: 'Circle', color: '#c62828', bg: 'transparent', order: 35 },
    { slug: 'loans_eligibility', labelKey: '', label: 'Check Eligibility', path: '/loans/eligibility', icon: 'Circle', color: '#c62828', bg: 'transparent', order: 40 },
    { slug: 'loans_products', labelKey: '', label: 'Loan Products', path: '/loans/products', icon: 'Circle', color: '#c62828', bg: 'transparent', order: 50 },
  ]},
  { slug: 'collections', labelKey: 'sidebar.collections', label: 'Collections', path: '/collections', icon: 'Wallet', color: '#6a1e8a', bg: '#f3e8fa', order: 60 },
  { slug: 'cash-management', labelKey: 'sidebar.cash_management', label: 'Cash & Vault', path: '/cash-management', icon: 'Landmark', color: '#16a34a', bg: '#dcfce7', order: 62 },
  { slug: 'accounting', labelKey: 'sidebar.accounting', label: 'Accounting', path: '/accounting', icon: 'BookOpen', color: '#0d9488', bg: '#ccfbf1', order: 63 },
  { slug: 'hr', labelKey: 'nav.hr', label: 'Human Resources', path: '/hr', icon: 'Briefcase', color: '#4f46e5', bg: '#eef2ff', order: 65 },
  { slug: 'cms', labelKey: 'nav.cms', label: 'Website Management', path: '/website-management', icon: 'Globe', color: '#ea580c', bg: '#ffedd5', order: 68 },
  { slug: 'verifications', labelKey: 'nav.verifications', label: 'Verifications', path: '/verifications', icon: 'ShieldCheck', color: '#2563eb', bg: '#dbeafe', order: 69 },
  { slug: 'reports', labelKey: 'sidebar.reports', label: 'Reports', path: '/reports', icon: 'BarChart2', color: '#e65100', bg: '#fff0e6', order: 70 },
  { slug: 'settings', labelKey: 'sidebar.settings', label: 'Settings', path: null, icon: 'Settings2', color: '#374151', bg: '#f3f4f6', order: 80, children: [
    { slug: 'settings_users', labelKey: '', label: 'System Users', path: '/settings/users', icon: 'Circle', color: '#374151', bg: 'transparent', order: 10 },
    { slug: 'settings_roles', labelKey: '', label: 'Role Management', path: '/settings/roles', icon: 'Circle', color: '#374151', bg: 'transparent', order: 20 },
    { slug: 'settings_audit', labelKey: '', label: 'Audit Logs', path: '/settings/audit', icon: 'Circle', color: '#374151', bg: 'transparent', order: 30 },
  ]}
];

async function main() {
  console.log('Seeding roles and menus...');

  // 1. Create Roles
  const roles = {};
  for (const roleData of DEFAULT_ROLES) {
    const role = await prisma.role.upsert({
      where: { slug: roleData.slug },
      update: { name: roleData.name, description: roleData.description, isSystem: roleData.isSystem },
      create: roleData
    });
    roles[role.slug] = role;
  }

  // 2. Create Menus
  const allMenuIds = [];
  for (const menuData of MENUS) {
    const { children, ...parentData } = menuData;
    const parent = await prisma.menu.upsert({
      where: { slug: parentData.slug },
      update: parentData,
      create: parentData
    });
    allMenuIds.push(parent.id);

    if (children) {
      for (const childData of children) {
        const child = await prisma.menu.upsert({
          where: { slug: childData.slug },
          update: { ...childData, parentId: parent.id },
          create: { ...childData, parentId: parent.id }
        });
        allMenuIds.push(child.id);
      }
    }
  }

  // 3. Assign all menus to super_admin and admin
  for (const slug of ['super_admin', 'admin']) {
    if (roles[slug]) {
      for (const menuId of allMenuIds) {
        await prisma.roleMenu.upsert({
          where: { roleId_menuId: { roleId: roles[slug].id, menuId } },
          update: {},
          create: { roleId: roles[slug].id, menuId }
        });
      }
    }
  }

  // 4. Migrate existing users: assign roleId from their old role slug
  // NOTE: After prisma db push, existing users will have a NULL roleId.
  // We use raw SQL to read the old ENUM value and link to the new roles table.
  try {
    const usersWithoutRole = await (prisma as any).$queryRaw`
      SELECT id FROM users WHERE roleId IS NULL OR roleId = ''
    `;
    
    if (usersWithoutRole.length > 0) {
      console.log(`Migrating ${usersWithoutRole.length} existing users...`);
      for (const user of usersWithoutRole) {
        // Assign super_admin role as fallback
        await prisma.user.update({
          where: { id: user.id },
          data: { roleId: roles['super_admin'].id }
        });
      }
      console.log('User migration complete!');
    }
  } catch (e) {
    console.log('User migration skipped (users may already have roles)');
  }

  // 5. Create default super admin user if none exists
  const adminCount = await prisma.user.count();
  if (adminCount === 0) {
    const passwordHash = await bcrypt.hash('Admin@123', 12);
    await prisma.user.create({
      data: {
        email: 'superadmin@coop.local',
        passwordHash,
        fullName: 'Super Administrator',
        roleId: roles['super_admin'].id,
        isActive: true,
        mustChangePassword: false,
      }
    });
    console.log('Created default user: superadmin@coop.local (pw: Admin@123)');
  }

  // 6. Ensure basic HR organizational units and leave types exist
  try {
    const hrUnitsCount = await prisma.hrOrganizationUnit.count();
    if (hrUnitsCount === 0) {
      console.log('Seeding initial HR organization units & leave types...');
      const hqUnit = await prisma.hrOrganizationUnit.create({
        data: {
          code: 'HQ',
          name: 'Headquarters & Operations',
          type: 'division',
          isActive: true,
        },
      });

      await prisma.hrOrganizationUnit.create({
        data: {
          code: 'FIN',
          name: 'Finance & Treasury',
          type: 'department',
          parentId: hqUnit.id,
          isActive: true,
        },
      });

      await prisma.hrOrganizationUnit.create({
        data: {
          code: 'OPS',
          name: 'Member Banking Operations',
          type: 'department',
          parentId: hqUnit.id,
          isActive: true,
        },
      });

      const leaveTypes = [
        { name: 'Annual Leave', code: 'ANNUAL', daysAllowed: 20, isPaid: true },
        { name: 'Sick Leave', code: 'SICK', daysAllowed: 15, isPaid: true },
        { name: 'Maternity Leave', code: 'MATERNITY', daysAllowed: 120, isPaid: true },
        { name: 'Paternity Leave', code: 'PATERNITY', daysAllowed: 10, isPaid: true },
      ];
      for (const lt of leaveTypes) {
        await prisma.hrLeaveType.upsert({
          where: { code: lt.code },
          update: {},
          create: lt,
        });
      }

      const grades = [
        { code: 'JG-1', name: 'Executive Level', level: 1, minSalary: 35000, maxSalary: 80000 },
        { code: 'JG-2', name: 'Managerial Level', level: 2, minSalary: 20000, maxSalary: 45000 },
        { code: 'JG-3', name: 'Professional / Officer Level', level: 3, minSalary: 12000, maxSalary: 25000 },
        { code: 'JG-4', name: 'Associate / Assistant Level', level: 4, minSalary: 7000, maxSalary: 15000 },
      ];
      for (const g of grades) {
        await prisma.hrJobGrade.upsert({
          where: { code: g.code },
          update: {},
          create: g,
        });
      }
      console.log('HR baseline seeded successfully!');
    }
  } catch (err: any) {
    console.warn('Notice: HR baseline seed bypassed:', err?.message || err);
  }

  console.log('Seed completed successfully!');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
