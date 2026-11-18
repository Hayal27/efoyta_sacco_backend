/**
 * Menu Seed — Accounting & GL Sub-Menus
 * Adds/upserts the main "accounting" parent menu & sub-menus:
 *   - accounting            → /accounting
 *   - accounting_coa        → /accounting (Tab: Chart of Accounts)
 *   - accounting_journal    → /accounting (Tab: Atomic Journal Processor)
 *   - accounting_statements → /accounting (Tab: Core Financial Statements)
 *   - accounting_assets     → /accounting (Tab: Asset & Liability Risk Management)
 *
 * Safe to run multiple times (upsert by slug).
 * Assigns to all existing roles by default.
 *
 * Run via tsx: npx tsx prisma/add-accounting-menus.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addAccountingMenus() {
  console.log('🌱 Upserting Financial & GL Accounting menus in DB...');

  try {
    // ── 1. Create or Update Main Parent Menu "accounting" ─────────────────────
    const parent = await prisma.menu.upsert({
      where: { slug: 'accounting' },
      update: {
        labelKey: 'nav.accounting',
        label: 'Accounting & GL',
        path: '/accounting',
        icon: 'Calculator',
        color: '#00838f',
        bg: '#e0f7fa',
        order: 60,
      },
      create: {
        slug: 'accounting',
        labelKey: 'nav.accounting',
        label: 'Accounting & GL',
        path: '/accounting',
        icon: 'Calculator',
        color: '#00838f',
        bg: '#e0f7fa',
        order: 60,
      },
    });

    console.log(`✅ Main parent menu "Accounting & GL" ready: ${parent.id}`);

    // ── 2. Define Child Sub-Menus ─────────────────────────────────────────────
    const children = [
      {
        slug: 'accounting_coa',
        labelKey: 'nav.accounting.coa',
        label: 'Chart of Accounts (CoA)',
        path: '/accounting',
        icon: 'BookOpen',
        color: '#00838f',
        bg: '#e0f7fa',
        order: 1,
      },
      {
        slug: 'accounting_journal',
        labelKey: 'nav.accounting.journal',
        label: 'Atomic Journal Processor',
        path: '/accounting',
        icon: 'Scale',
        color: '#00838f',
        bg: '#e0f7fa',
        order: 2,
      },
      {
        slug: 'accounting_statements',
        labelKey: 'nav.accounting.statements',
        label: 'Financial Statements',
        path: '/accounting',
        icon: 'FileSpreadsheet',
        color: '#00838f',
        bg: '#e0f7fa',
        order: 3,
      },
      {
        slug: 'accounting_assets',
        labelKey: 'nav.accounting.assets',
        label: 'Asset & Risk Reserves',
        path: '/accounting',
        icon: 'ShieldAlert',
        color: '#00838f',
        bg: '#e0f7fa',
        order: 4,
      },
    ];

    const childMenuIds: string[] = [parent.id];

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
      childMenuIds.push(child.id);
      console.log(`   └─ ✅ Child menu "${c.label}" (${c.slug}) ready: ${child.id}`);
    }

    // ── 3. Connect to all roles in DB ─────────────────────────────────────────
    const roles = await prisma.role.findMany();
    console.log(`🔗 Assigning Accounting & GL menus to ${roles.length} roles...`);

    for (const role of roles) {
      for (const menuId of childMenuIds) {
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
      console.log(`   └─ Assigned to role: ${role.name} (${role.slug})`);
    }

    console.log('\n🎉 Accounting & GL menus successfully created and attached to all roles!');
  } catch (error) {
    console.error('❌ Failed to seed Accounting & GL menus:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addAccountingMenus();
