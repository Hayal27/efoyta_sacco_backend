import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface MenuDef {
  slug: string;
  labelKey: string;
  label: string;
  path: string | null;
  icon: string;
  color: string;
  bg: string;
  order: number;
  children?: {
    slug: string;
    labelKey: string;
    label: string;
    path: string;
    icon: string;
    color?: string;
    bg?: string;
    order: number;
  }[];
}

export const MASTER_MENU_CATALOG: MenuDef[] = [
  // ── 1. Dashboard (Overview) ───────────────────────────────────────────────
  {
    slug: 'dashboard',
    labelKey: 'sidebar.dashboard',
    label: 'Dashboard',
    path: '/',
    icon: 'LayoutDashboard',
    color: '#1a5c2a',
    bg: '#e8f5ec',
    order: 10,
  },

  // ── 2. Members & Field Operations ─────────────────────────────────────────
  {
    slug: 'members',
    labelKey: 'sidebar.members',
    label: 'Members',
    path: '/members',
    icon: 'Users',
    color: '#1565c0',
    bg: '#e3f0fd',
    order: 20,
  },

  // ── 3. Savings Accounts & Products ────────────────────────────────────────
  {
    slug: 'savings',
    labelKey: 'sidebar.savings',
    label: 'Savings',
    path: '/savings',
    icon: 'PiggyBank',
    color: '#2e7d32',
    bg: '#eaf4eb',
    order: 30,
    children: [
      { slug: 'savings_list', labelKey: '', label: 'Accounts', path: '/savings', icon: 'PiggyBank', order: 10 },
      { slug: 'savings_open', labelKey: '', label: 'Open Account', path: '/savings/open-account', icon: 'Circle', order: 20 },
      { slug: 'savings_config', labelKey: '', label: 'Saving Types', path: '/savings/products', icon: 'Settings2', order: 30 },
      { slug: 'savings_standing_instructions', labelKey: '', label: 'Standing Instructions', path: '/savings/standing-instructions', icon: 'Layers', order: 40 },
      { slug: 'savings_engines', labelKey: '', label: 'Background Engines', path: '/savings/engines', icon: 'Cpu', order: 50 },
    ],
  },

  // ── 4. Loan Management & Credit ───────────────────────────────────────────
  {
    slug: 'loans',
    labelKey: 'sidebar.loans',
    label: 'Loans',
    path: '/loans',
    icon: 'CreditCard',
    color: '#c62828',
    bg: '#fdeaea',
    order: 40,
    children: [
      { slug: 'loans_list', labelKey: '', label: 'Applications', path: '/loans', icon: 'CreditCard', order: 10 },
      { slug: 'loans_review', labelKey: '', label: 'Review Applications', path: '/loans/review', icon: 'Circle', order: 20 },
      { slug: 'loans_approve', labelKey: '', label: 'Final Approvals', path: '/loans/approve', icon: 'Circle', order: 30 },
      { slug: 'loans_disburse', labelKey: '', label: 'Disbursement Queue', path: '/loans/disburse', icon: 'Circle', order: 40 },
      { slug: 'loans_eligibility', labelKey: '', label: 'Check Eligibility', path: '/loans/eligibility', icon: 'Circle', order: 50 },
      { slug: 'loans_products', labelKey: '', label: 'Loan Products', path: '/loans/products', icon: 'Settings2', order: 60 },
      { slug: 'loans_guarantors', labelKey: '', label: 'Guarantor Registry', path: '/loans/guarantors', icon: 'ShieldCheck', order: 70 },
      { slug: 'loans_control_room', labelKey: '', label: 'Risk Control Room', path: '/loans/control-room', icon: 'ShieldCheck', order: 80 },
    ],
  },

  // ── 5. Shares Capital & Dividends ─────────────────────────────────────────
  {
    slug: 'shares',
    labelKey: 'sidebar.shares',
    label: 'Shares',
    path: '/shares',
    icon: 'Briefcase',
    color: '#b58900',
    bg: '#fdf6e3',
    order: 50,
    children: [
      { slug: 'shares_accounts', labelKey: '', label: 'Accounts', path: '/shares', icon: 'Circle', order: 10 },
      { slug: 'shares_dividends', labelKey: '', label: 'Dividend Engine', path: '/shares/dividends', icon: 'Circle', order: 15 },
      { slug: 'shares_config', labelKey: '', label: 'Configure', path: '/shares/config', icon: 'Settings2', order: 20 },
      { slug: 'shares_transfer', labelKey: '', label: 'Transfer', path: '/shares/transfer', icon: 'Circle', order: 30 },
      { slug: 'shares_buy', labelKey: '', label: 'Buy Shares', path: '/shares/buy', icon: 'Circle', order: 40 },
    ],
  },

  // ── 6. Collections & Field Handovers ──────────────────────────────────────
  {
    slug: 'collections',
    labelKey: 'sidebar.collections',
    label: 'Collections',
    path: '/collections',
    icon: 'Wallet',
    color: '#6a1e8a',
    bg: '#f3e8fa',
    order: 60,
    children: [
      { slug: 'collections_overview', labelKey: '', label: 'Collections Overview', path: '/collections', icon: 'LayoutDashboard', order: 10 },
      { slug: 'deposit-requests', labelKey: 'menu.deposit_requests', label: 'Deposit Requests', path: '/collections/deposits', icon: 'Circle', order: 20 },
      { slug: 'cashier-deposits', labelKey: 'menu.cashier_deposits', label: 'Deposit Approvals', path: '/collections/cashier', icon: 'ShieldCheck', order: 30 },
    ],
  },

  // ── 7. Cash & Vault Management ────────────────────────────────────────────
  {
    slug: 'cash-management',
    labelKey: 'sidebar.cash_management',
    label: 'Cash & Vault Management',
    path: '/cash-management',
    icon: 'Wallet',
    color: '#16a34a',
    bg: '#dcfce7',
    order: 70,
    children: [
      { slug: 'cash_overview', labelKey: 'sidebar.cash_overview', label: 'Cash Overview & Tills', path: '/cash-management', icon: 'LayoutDashboard', order: 10 },
      { slug: 'cash_vault', labelKey: 'sidebar.cash_vault', label: 'Vault & Bank Movements', path: '/cash-management/vault', icon: 'Building2', order: 20 },
      { slug: 'cash_tills', labelKey: 'sidebar.cash_tills', label: 'Till Drawers & Sessions', path: '/cash-management/tills', icon: 'PiggyBank', order: 30 },
      { slug: 'cash_transfers', labelKey: 'sidebar.cash_transfers', label: 'Cash Transfers & Approvals', path: '/cash-management/transfers', icon: 'Layers', order: 40 },
      { slug: 'cash_variances', labelKey: 'sidebar.cash_variances', label: 'Variances & Reconciliation', path: '/cash-management/variances', icon: 'Scale', order: 50 },
      { slug: 'cash_reports', labelKey: 'sidebar.cash_reports', label: 'Daily Vault & Till Reports', path: '/cash-management/reports', icon: 'FileSpreadsheet', order: 60 },
    ],
  },

  // ── 8. Accounting & General Ledger ────────────────────────────────────────
  {
    slug: 'accounting',
    labelKey: 'sidebar.accounting',
    label: 'Accounting & GL',
    path: '/accounting',
    icon: 'Calculator',
    color: '#0d9488',
    bg: '#ccfbf1',
    order: 80,
    children: [
      { slug: 'accounting_coa', labelKey: '', label: 'Chart of Accounts (CoA)', path: '/accounting', icon: 'BookOpen', order: 10 },
      { slug: 'accounting_journal', labelKey: '', label: 'Atomic Journal Processor', path: '/accounting', icon: 'Scale', order: 20 },
      { slug: 'accounting_statements', labelKey: '', label: 'Financial Statements', path: '/accounting', icon: 'FileSpreadsheet', order: 30 },
      { slug: 'accounting_assets', labelKey: '', label: 'Asset & Risk Reserves', path: '/accounting', icon: 'ShieldAlert', order: 40 },
    ],
  },

  // ── 9. Human Resources (HRMS) ─────────────────────────────────────────────
  {
    slug: 'hr',
    labelKey: 'nav.hr',
    label: 'Human Resources (HRMS)',
    path: '/hr/overview',
    icon: 'Briefcase',
    color: '#4f46e5',
    bg: '#eef2ff',
    order: 90,
    children: [
      { slug: 'hr_overview', labelKey: '', label: 'HR Overview & Analytics', path: '/hr/overview', icon: 'LayoutDashboard', order: 10 },
      { slug: 'hr_employees', labelKey: '', label: 'Employee Directory', path: '/hr/employees', icon: 'Users', order: 20 },
      { slug: 'hr_org', labelKey: '', label: 'Org Structure & Positions', path: '/hr/org', icon: 'Building2', order: 30 },
      { slug: 'hr_leave', labelKey: '', label: 'Leave Administration', path: '/hr/leave', icon: 'Circle', order: 40 },
      { slug: 'hr_attendance', labelKey: '', label: 'Time & Attendance Logs', path: '/hr/attendance', icon: 'Circle', order: 50 },
      { slug: 'hr_performance', labelKey: '', label: 'Performance (PMS)', path: '/hr/performance', icon: 'BarChart2', order: 60 },
      { slug: 'hr_movements', labelKey: '', label: 'Promotions & Transfers', path: '/hr/movements', icon: 'Layers', order: 70 },
      { slug: 'hr_training', labelKey: '', label: 'Training & Capacity', path: '/hr/training', icon: 'BookOpen', order: 80 },
      { slug: 'hr_planning', labelKey: '', label: 'Workforce Planning', path: '/hr/planning', icon: 'Calculator', order: 90 },
      { slug: 'hr_offboarding', labelKey: '', label: 'Exit Clearance & Alumni', path: '/hr/offboarding', icon: 'LogOut', order: 100 },
      { slug: 'hr_self_service', labelKey: '', label: 'My Self-Service Portal', path: '/hr/self-service', icon: 'UserCheck', order: 110 },
    ],
  },

  // ── 10. Member Self-Service Portal ────────────────────────────────────────
  {
    slug: 'member_portal',
    labelKey: 'sidebar.member_portal',
    label: 'Member Self-Service',
    path: '/portal',
    icon: 'UserCheck',
    color: '#10b981',
    bg: '#d1fae5',
    order: 100,
    children: [
      { slug: 'portal_dashboard', labelKey: 'sidebar.portal_dashboard', label: 'Account & KYC Status', path: '/portal', icon: 'ShieldCheck', order: 10 },
      { slug: 'portal_savings', labelKey: 'sidebar.portal_savings', label: 'Savings & Passbook', path: '/portal/savings', icon: 'PiggyBank', order: 20 },
      { slug: 'portal_loans', labelKey: 'sidebar.portal_loans', label: 'Loans & Eligibility', path: '/portal/loans', icon: 'CreditCard', order: 30 },
      { slug: 'portal_shares', labelKey: 'sidebar.portal_shares', label: 'Shares & Dividends', path: '/portal/shares', icon: 'Layers', order: 40 },
    ],
  },

  // ── 11. Public Website & CMS ──────────────────────────────────────────────
  {
    slug: 'website-management',
    labelKey: 'sidebar.website_management',
    label: 'Website & CMS Portal',
    path: '/website-management',
    icon: 'Globe',
    color: '#ea580c',
    bg: '#ffedd5',
    order: 110,
    children: [
      { slug: 'cms_overview', labelKey: '', label: 'CMS Dashboard & Stats', path: '/website-management', icon: 'LayoutDashboard', order: 10 },
      { slug: 'cms_articles', labelKey: '', label: 'News & Blog Articles', path: '/website-management', icon: 'BookOpen', order: 20 },
      { slug: 'cms_applications', labelKey: '', label: 'Online Member Leads', path: '/website-management', icon: 'Users', order: 30 },
      { slug: 'cms_inquiries', labelKey: '', label: 'Contact Inquiries', path: '/website-management', icon: 'Circle', order: 40 },
      { slug: 'cms_banners', labelKey: '', label: 'Hero Slider Banners', path: '/website-management', icon: 'Layers', order: 50 },
      { slug: 'cms_branches', labelKey: '', label: 'Branch Directory', path: '/website-management', icon: 'Building2', order: 60 },
      { slug: 'cms_settings', labelKey: '', label: 'Public Website Settings', path: '/website-management', icon: 'Settings2', order: 70 },
    ],
  },

  // ── 12. Auditor & Compliance ──────────────────────────────────────────────
  {
    slug: 'auditor',
    labelKey: 'sidebar.auditor',
    label: 'Auditor & Audit Logs',
    path: '/auditor/transactions',
    icon: 'ShieldAlert',
    color: '#b91c1c',
    bg: '#fee2e2',
    order: 120,
    children: [
      { slug: 'auditor_transactions', labelKey: '', label: 'All Transactions', path: '/auditor/transactions', icon: 'Circle', order: 10 },
      { slug: 'auditor_logs', labelKey: '', label: 'System Audit Logs', path: '/audit-logs', icon: 'ShieldAlert', order: 20 },
    ],
  },

  // ── 13. Account Verification & Security ───────────────────────────────────
  {
    slug: 'verifications',
    labelKey: 'sidebar.verifications',
    label: 'Account Verification & Security',
    path: '/security/verifications',
    icon: 'ShieldCheck',
    color: '#2563eb',
    bg: '#dbeafe',
    order: 130,
  },

  // ── 14. Reports & Business Intelligence ───────────────────────────────────
  {
    slug: 'reports',
    labelKey: 'sidebar.reports',
    label: 'Reports & Analytics',
    path: '/reports',
    icon: 'BarChart2',
    color: '#e65100',
    bg: '#fff0e6',
    order: 140,
    children: [
      { slug: 'reports_general', labelKey: '', label: 'General Reports', path: '/reports', icon: 'BarChart2', order: 10 },
      { slug: 'reports_grand_summary', labelKey: '', label: 'Grand Summary', path: '/reports/grand-summary', icon: 'FileSpreadsheet', order: 11 },
      { slug: 'reports_crm_followup', labelKey: '', label: 'CRM Follow-Up', path: '/reports/crm-follow-up', icon: 'Users', order: 12 },
      { slug: 'reports_member', labelKey: '', label: 'Member Report', path: '/reports/member', icon: 'Users', order: 13 },
      { slug: 'reports_share', labelKey: '', label: 'Share Report', path: '/reports/share', icon: 'Layers', order: 14 },
      { slug: 'reports_loan', labelKey: '', label: 'Loan Report', path: '/reports/loan', icon: 'CreditCard', order: 15 },
      { slug: 'reports_collection', labelKey: '', label: 'Collection Report', path: '/reports/collection', icon: 'Wallet', order: 16 },
      { slug: 'reports_guarantor', labelKey: '', label: 'Guarantor & Liabilities', path: '/reports/guarantor', icon: 'ShieldAlert', order: 17 },
      { slug: 'reports_financial', labelKey: '', label: 'Financial Report', path: '/reports/financial', icon: 'FileSpreadsheet', order: 18 },
    ],
  },

  // ── 15. Database & System Snapshots ───────────────────────────────────────
  {
    slug: 'backups',
    labelKey: 'sidebar.backups',
    label: 'Database & Backups',
    path: '/backups',
    icon: 'Database',
    color: '#0284c7',
    bg: '#e0f2fe',
    order: 150,
    children: [
      { slug: 'backups_full', labelKey: '', label: 'Full System Snapshots', path: '/backups', icon: 'HardDrive', order: 10 },
      { slug: 'backups_modules', labelKey: '', label: 'Module Exporter & Importer', path: '/backups', icon: 'Download', order: 20 },
      { slug: 'backups_restore', labelKey: '', label: 'System Restore Console', path: '/backups', icon: 'RotateCcw', order: 30 },
    ],
  },

  // ── 16. System Settings & Administration ──────────────────────────────────
  {
    slug: 'settings',
    labelKey: 'sidebar.settings',
    label: 'Settings & Administration',
    path: '/settings',
    icon: 'Settings2',
    color: '#374151',
    bg: '#f3f4f6',
    order: 160,
    children: [
      { slug: 'settings_overview', labelKey: '', label: 'Settings Overview', path: '/settings', icon: 'Settings2', order: 5 },
      { slug: 'settings_verifications', labelKey: '', label: 'Account Verification & Security', path: '/security/verifications', icon: 'ShieldCheck', order: 10 },
      { slug: 'settings_users', labelKey: '', label: 'User Management', path: '/settings/users', icon: 'Users', order: 20 },
      { slug: 'settings_roles', labelKey: '', label: 'Role & Permissions', path: '/settings/roles', icon: 'ShieldCheck', order: 30 },
      { slug: 'settings_branches', labelKey: '', label: 'Branch Management', path: '/settings/branches', icon: 'Building2', order: 40 },
      { slug: 'settings_crm_assignment', labelKey: '', label: 'CRM Assignments', path: '/settings/crm-assignment', icon: 'Users', order: 50 },
      { slug: 'settings_audit', labelKey: '', label: 'System Audit Logs', path: '/audit-logs', icon: 'ShieldAlert', order: 60 },
    ],
  },
];

export async function migrateAllMenus() {
  console.log('🚀 Migrating all system menus to database...');

  const allInsertedMenuIds: string[] = [];

  for (const parentDef of MASTER_MENU_CATALOG) {
    const { children, ...parentData } = parentDef;

    const parentMenu = await prisma.menu.upsert({
      where: { slug: parentData.slug },
      update: {
        labelKey: parentData.labelKey,
        label: parentData.label,
        path: parentData.path,
        icon: parentData.icon,
        color: parentData.color,
        bg: parentData.bg,
        order: parentData.order,
      },
      create: {
        slug: parentData.slug,
        labelKey: parentData.labelKey,
        label: parentData.label,
        path: parentData.path,
        icon: parentData.icon,
        color: parentData.color,
        bg: parentData.bg,
        order: parentData.order,
      },
    });

    allInsertedMenuIds.push(parentMenu.id);

    if (children && children.length > 0) {
      for (const childDef of children) {
        const childMenu = await prisma.menu.upsert({
          where: { slug: childDef.slug },
          update: {
            labelKey: childDef.labelKey,
            label: childDef.label,
            path: childDef.path,
            icon: childDef.icon,
            color: childDef.color || parentData.color,
            bg: childDef.bg || 'transparent',
            parentId: parentMenu.id,
            order: childDef.order,
          },
          create: {
            slug: childDef.slug,
            labelKey: childDef.labelKey,
            label: childDef.label,
            path: childDef.path,
            icon: childDef.icon,
            color: childDef.color || parentData.color,
            bg: childDef.bg || 'transparent',
            parentId: parentMenu.id,
            order: childDef.order,
          },
        });

        allInsertedMenuIds.push(childMenu.id);
      }
    }
  }

  console.log(`✅ Upserted ${allInsertedMenuIds.length} menus & submenus into database.`);

  // ── Grant ALL menus to `admin` and `super_admin` ───────────────────────────
  console.log('🔒 Granting ALL menus to admin and super_admin...');

  const adminRoles = await prisma.role.findMany({
    where: { slug: { in: ['super_admin', 'admin'] } },
  });

  for (const role of adminRoles) {
    let count = 0;
    for (const menuId of allInsertedMenuIds) {
      await prisma.roleMenu.upsert({
        where: {
          roleId_menuId: {
            roleId: role.id,
            menuId,
          },
        },
        update: {},
        create: {
          roleId: role.id,
          menuId,
        },
      });
      count++;
    }
    console.log(`✨ Granted ${count} menus to role "${role.name}" (${role.slug}).`);
  }

  console.log('🎉 Menu migration and admin permissions grant completed successfully!');
}

if (require.main === module) {
  migrateAllMenus()
    .catch((e) => {
      console.error('Error during menu migration:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

