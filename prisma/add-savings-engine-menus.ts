/**
 * Menu Seed — Savings Sub-Menus
 * Adds/upserts the following child menu items under the "savings" parent:
 *   - savings_open              → /savings/open-account
 *   - savings_config            → /savings/products
 *   - savings_standing          → /savings/standing-instructions
 *   - savings_engines           → /savings/engines   ← NEW (Background Engines Console)
 *
 * Safe to run multiple times (upsert by slug).
 * Assigns to all existing roles by default (adjust roleFilter if needed).
 *
 * Run:
 *   npx ts-node --project tsconfig.json prisma/add-savings-engine-menus.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addSavingsMenus() {
  console.log('🌱 Upserting Savings sub-menus...');

  try {
    // ── 1. Find the parent savings menu ──────────────────────────────────────
    const parent = await prisma.menu.findUnique({ where: { slug: 'savings' } });
    if (!parent) {
      console.error('❌  Parent "savings" menu not found! Make sure the base seed has been run first.');
      return;
    }

    // ── 2. Define child menus ─────────────────────────────────────────────────
    const children = [
      {
        slug:  'savings_list',
        label: 'Accounts',
        path:  '/savings',
        icon:  'PiggyBank',
        color: '#2e7d32',
        order: 1,
      },
      {
        slug:  'savings_open',
        label: 'Open Account',
        path:  '/savings/open-account',
        icon:  'Plus',
        color: '#2e7d32',
        order: 2,
      },
      {
        slug:  'savings_config',
        label: 'Saving Types',
        path:  '/savings/products',
        icon:  'Settings2',
        color: '#2e7d32',
        order: 3,
      },
      {
        slug:  'savings_standing_instructions',
        label: 'Standing Instructions',
        path:  '/savings/standing-instructions',
        icon:  'Layers',
        color: '#2e7d32',
        order: 4,
      },
      {
        slug:  'savings_engines',
        label: 'Background Engines',
        path:  '/savings/engines',
        icon:  'Cpu',
        color: '#4f46e5',   // indigo — engine / automation
        order: 5,
      },
    ];

    // ── 3. Fetch all roles that should have access to savings ─────────────────
    //    Restrict to admin-level roles; cashier/focal_agent access can be tuned
    //    in the Role Management UI as needed.
    const targetRoles = await prisma.role.findMany({
      where: {
        slug: { in: ['super_admin', 'admin', 'manager', 'cashier', 'accountant'] },
      },
    });

    if (targetRoles.length === 0) {
      console.warn('⚠️  No matching roles found. Menu items created but not assigned.');
    }

    // ── 4. Upsert each child menu and assign to roles ──────────────────────
    for (const item of children) {
      // Upsert menu entry
      const menu = await prisma.menu.upsert({
        where:  { slug: item.slug },
        update: {
          label:    item.label,
          path:     item.path,
          icon:     item.icon,
          color:    item.color,
          parentId: parent.id,
          order:    item.order,
        },
        create: {
          slug:      item.slug,
          labelKey:  '',
          label:     item.label,
          path:      item.path,
          icon:      item.icon,
          color:     item.color,
          bg:        'transparent',
          parentId:  parent.id,
          order:     item.order,
        },
      });

      console.log(`  ✅  Menu upserted: ${item.slug}  →  ${item.path}`);

      // Assign to each role
      for (const role of targetRoles) {
        await prisma.roleMenu.upsert({
          where: {
            roleId_menuId: { roleId: role.id, menuId: menu.id },
          },
          update: {},
          create: { roleId: role.id, menuId: menu.id },
        });
      }
      console.log(`       🔑 Assigned to ${targetRoles.length} role(s)`);
    }

    console.log('\n🎉  Savings sub-menus fully seeded and assigned!');
    console.log('   Navigate to /savings/engines to access the Background Engines Console.\n');
  } catch (err) {
    console.error('❌  Failed to seed savings menus:', err);
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

addSavingsMenus();
