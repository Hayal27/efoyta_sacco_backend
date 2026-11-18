import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.role.upsert({
    where: { slug: 'crm_head' },
    update: {},
    create: {
      name: 'CRM Head',
      slug: 'crm_head',
      description: 'Manages and tracks focal agents assigned to them.',
      isSystem: true,
    }
  });
  console.info('✅ CRM Head role seeded');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
