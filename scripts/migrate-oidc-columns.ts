import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Checking users table for OIDC columns...');

  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`users\`
        ADD COLUMN \`oidcSub\` VARCHAR(255) NULL,
        ADD COLUMN \`idpProvider\` VARCHAR(50) NOT NULL DEFAULT 'local',
        ADD COLUMN \`isExternal\` BOOLEAN NOT NULL DEFAULT false;
    `);
    console.log('✅ Added columns oidcSub, idpProvider, isExternal to `users` table.');
  } catch (err: any) {
    if (err?.message?.includes('Duplicate column name')) {
      console.log('ℹ️ Columns already exist in `users` table.');
    } else {
      console.error('Column error:', err.message);
    }
  }

  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`users\` ADD UNIQUE INDEX \`users_oidcSub_key\` (\`oidcSub\`);
    `);
    console.log('✅ Added unique index `users_oidcSub_key` on `users(oidcSub)`.');
  } catch (err: any) {
    if (err?.message?.includes('Duplicate key name')) {
      console.log('ℹ️ Unique index `users_oidcSub_key` already exists.');
    } else {
      console.error('Index error:', err.message);
    }
  }

  console.log('🎉 Migration complete!');

  // Test query
  const testUser = await prisma.user.findFirst({
    select: { id: true, email: true, oidcSub: true, idpProvider: true, isExternal: true },
  });
  console.log('✅ Successfully queried user with oidcSub:', testUser);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
