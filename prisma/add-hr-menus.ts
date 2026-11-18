/**
 * Menu Seed & Role Privileges Migration — Human Resources (HRMS)
 * Adds/upserts the main "hr" parent menu & sub-menus:
 *   - hr              → /hr (Human Resources)
 *   - hr_org          → /hr/org (Org Structure & Positions)
 *   - hr_employees    → /hr/employees (Employee Directory & Digital ID)
 *   - hr_leave        → /hr/leave (Leave Management)
 *   - hr_attendance   → /hr/attendance (Time & Attendance)
 *   - hr_performance  → /hr/performance (Performance Management PMS)
 *   - hr_movements    → /hr/movements (Promotions & Transfers)
 *   - hr_training     → /hr/training (Training & Capacity Building)
 *   - hr_planning     → /hr/planning (Workforce Planning & Gap Analysis)
 *   - hr_offboarding  → /hr/offboarding (Exit Clearance & Alumni)
 *
 * Configures role privileges:
 *   - Super Admin & Admin: Full HR access
 *   - HR Manager (upserted): Full HR access
 *   - Auditor: Compliance & audit visibility
 *   - Staff/Focal Agents/Cashiers: Employee self-service
 *
 * Safe to run multiple times (upsert by slug).
 * Run via: npx tsx prisma/add-hr-menus.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addHrMenus() {
  console.log('🌱 Upserting Human Resources (HRMS) Menus & Role Privileges in DB...');

  try {
    // ── 1. Create or Update Main Parent Menu "hr" ────────────────────────────
    const parent = await prisma.menu.upsert({
      where: { slug: 'hr' },
      update: {
        labelKey: 'nav.hr',
        label: 'Human Resources',
        path: '/hr',
        icon: 'Briefcase',
        color: '#4f46e5',
        bg: '#eef2ff',
        order: 65,
      },
      create: {
        slug: 'hr',
        labelKey: 'nav.hr',
        label: 'Human Resources',
        path: '/hr',
        icon: 'Briefcase',
        color: '#4f46e5',
        bg: '#eef2ff',
        order: 65,
      },
    });

    console.log(`✅ Main parent menu "Human Resources" ready: ${parent.id}`);

    // ── 2. Define Child Sub-Menus ────────────────────────────────────────────
    const children = [
      {
        slug: 'hr_org',
        labelKey: 'nav.hr.org',
        label: 'Org & Positions',
        path: '/hr/org',
        icon: 'Building2',
        color: '#4f46e5',
        bg: '#eef2ff',
        order: 1,
      },
      {
        slug: 'hr_employees',
        labelKey: 'nav.hr.employees',
        label: 'Employee Directory',
        path: '/hr/employees',
        icon: 'Users',
        color: '#4f46e5',
        bg: '#eef2ff',
        order: 2,
      },
      {
        slug: 'hr_leave',
        labelKey: 'nav.hr.leave',
        label: 'Leave Management',
        path: '/hr/leave',
        icon: 'Layers',
        color: '#4f46e5',
        bg: '#eef2ff',
        order: 3,
      },
      {
        slug: 'hr_attendance',
        labelKey: 'nav.hr.attendance',
        label: 'Time & Attendance',
        path: '/hr/attendance',
        icon: 'Cpu',
        color: '#4f46e5',
        bg: '#eef2ff',
        order: 4,
      },
      {
        slug: 'hr_performance',
        labelKey: 'nav.hr.performance',
        label: 'Performance (PMS)',
        path: '/hr/performance',
        icon: 'ShieldCheck',
        color: '#4f46e5',
        bg: '#eef2ff',
        order: 5,
      },
      {
        slug: 'hr_movements',
        labelKey: 'nav.hr.movements',
        label: 'Promotions & Transfers',
        path: '/hr/movements',
        icon: 'Scale',
        color: '#4f46e5',
        bg: '#eef2ff',
        order: 6,
      },
      {
        slug: 'hr_training',
        labelKey: 'nav.hr.training',
        label: 'Training & Capacity',
        path: '/hr/training',
        icon: 'BookOpen',
        color: '#4f46e5',
        bg: '#eef2ff',
        order: 7,
      },
      {
        slug: 'hr_planning',
        labelKey: 'nav.hr.planning',
        label: 'Workforce Planning',
        path: '/hr/planning',
        icon: 'BarChart2',
        color: '#4f46e5',
        bg: '#eef2ff',
        order: 8,
      },
      {
        slug: 'hr_offboarding',
        labelKey: 'nav.hr.offboarding',
        label: 'Exit Clearance & Alumni',
        path: '/hr/offboarding',
        icon: 'RotateCcw',
        color: '#4f46e5',
        bg: '#eef2ff',
        order: 9,
      },
    ];

    const childMenuMap: Record<string, string> = { hr: parent.id };

    for (const c of children) {
      const child = await prisma.menu.upsert({
        where: { slug: c.slug },
        update: {
          labelKey: c.labelKey,
          label: c.label,
          path: c.path,
          icon: c.icon,
          color: c.color,
          bg: c.bg,
          parentId: parent.id,
          order: c.order,
        },
        create: {
          slug: c.slug,
          labelKey: c.labelKey,
          label: c.label,
          path: c.path,
          icon: c.icon,
          color: c.color,
          bg: c.bg,
          parentId: parent.id,
          order: c.order,
        },
      });
      childMenuMap[c.slug] = child.id;
      console.log(`   └─ ✅ Child menu "${c.label}" (${c.slug}) ready: ${child.id}`);
    }

    // ── 3. Upsert Specialized "HR Manager" Role ──────────────────────────────
    const hrRole = await prisma.role.upsert({
      where: { slug: 'hr_manager' },
      update: { name: 'HR Manager', description: 'Comprehensive Human Resource and Workforce Administration' },
      create: {
        name: 'HR Manager',
        slug: 'hr_manager',
        description: 'Comprehensive Human Resource and Workforce Administration',
      },
    });
    console.log(`✅ Role "HR Manager" ready: ${hrRole.id}`);

    // ── 4. Granular Role Privileges Configuration ────────────────────────────
    const allMenuIds = Object.values(childMenuMap);
    const selfServiceMenuIds = [
      childMenuMap['hr'],
      childMenuMap['hr_employees'],
      childMenuMap['hr_leave'],
      childMenuMap['hr_attendance'],
      childMenuMap['hr_training'],
    ];
    const auditMenuIds = [
      childMenuMap['hr'],
      childMenuMap['hr_org'],
      childMenuMap['hr_employees'],
      childMenuMap['hr_leave'],
      childMenuMap['hr_attendance'],
      childMenuMap['hr_performance'],
      childMenuMap['hr_planning'],
      childMenuMap['hr_offboarding'],
    ];

    const roles = await prisma.role.findMany();
    console.log(`\n🔗 Assigning HR Privileges across ${roles.length} roles...`);

    for (const role of roles) {
      let targetMenuIds: string[] = [];

      switch (role.slug) {
        case 'super_admin':
        case 'admin':
        case 'hr_manager':
          targetMenuIds = allMenuIds;
          break;
        case 'auditor':
          targetMenuIds = auditMenuIds;
          break;
        case 'crm_head':
        case 'cashier':
        case 'focal_agent':
          targetMenuIds = selfServiceMenuIds;
          break;
        default:
          targetMenuIds = selfServiceMenuIds;
          break;
      }

      for (const menuId of targetMenuIds) {
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
      }

      console.log(`   └─ Role "${role.name}" (${role.slug}): Granted ${targetMenuIds.length} HR privileges`);
    }

    console.log('\n🎉 HRMS Menus & Role Privileges Migration Successfully Completed!');
  } catch (error) {
    console.error('❌ Failed to seed HR menus:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addHrMenus();
