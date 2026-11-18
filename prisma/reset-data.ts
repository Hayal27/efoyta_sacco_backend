import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function resetAllData() {
  console.log('🧹 Starting full transaction & loan reset...');

  try {
    // 1. Delete all repayments
    const repaymentsDeleted = await prisma.repayment.deleteMany({});
    console.log(`✅ Deleted ${repaymentsDeleted.count} repayment records.`);

    // 2. Delete all loans
    const loansDeleted = await prisma.loan.deleteMany({});
    console.log(`✅ Deleted ${loansDeleted.count} loan records.`);

    // 3. Delete all savings transactions
    const savingsTxnsDeleted = await prisma.savingsTxn.deleteMany({});
    console.log(`✅ Deleted ${savingsTxnsDeleted.count} savings transactions.`);

    // 4. Delete all share transactions
    const shareTxnsDeleted = await prisma.shareTxn.deleteMany({});
    console.log(`✅ Deleted ${shareTxnsDeleted.count} share transactions.`);

    // 5. Delete collection entries and collection sessions
    const collectionEntriesDeleted = await prisma.dailyCollectionEntry.deleteMany({});
    const collectionsDeleted = await prisma.dailyCollection.deleteMany({});
    console.log(`✅ Deleted ${collectionEntriesDeleted.count} collection entries and ${collectionsDeleted.count} sessions.`);

    // 6. Delete dividend runs & payouts if any model exists
    try {
      if ((prisma as any).dividendPayout) await (prisma as any).dividendPayout.deleteMany({});
      if ((prisma as any).dividendRun) await (prisma as any).dividendRun.deleteMany({});
      console.log('✅ Reset dividend runs & payouts.');
    } catch (e) {
      // ignore if dividend tables do not exist
    }

    // 7. Delete notifications & audit logs
    const notificationsDeleted = await prisma.notification.deleteMany({});
    const auditLogsDeleted = await prisma.auditLog.deleteMany({});
    console.log(`✅ Deleted ${notificationsDeleted.count} notifications and ${auditLogsDeleted.count} audit logs.`);

    // 8. Reset Savings Account balances to 0
    const savingsReset = await prisma.savingsAccount.updateMany({
      data: { balance: 0 },
    });
    console.log(`✅ Reset ${savingsReset.count} savings accounts balance to 0.00 ETB.`);

    // 9. Reset Share Account balances to 0
    const sharesReset = await prisma.shareAccount.updateMany({
      data: { balance: 0 },
    });
    console.log(`✅ Reset ${sharesReset.count} share accounts balance to 0.00 ETB.`);

    console.log('🎉 ALL TRANSACTIONS AND LOANS RESET TO 0 SUCCESSFUL!');
  } catch (error) {
    console.error('❌ Reset failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

resetAllData();
