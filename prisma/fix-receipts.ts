import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Fixing DailyCollectionEntry receipt numbers...');
  const entries = await prisma.dailyCollectionEntry.findMany({
    where: {
      OR: [
        { receiptNo: null },
        { receiptNo: '' }
      ]
    }
  });

  console.log(`Found ${entries.length} entries without a receipt number.`);
  
  for (let i = 0; i < entries.length; i++) {
    const uniqueReceipt = `RCP-DCE-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await prisma.dailyCollectionEntry.update({
      where: { id: entries[i].id },
      data: { receiptNo: uniqueReceipt }
    });
  }

  console.log('Done fixing receipt numbers.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
