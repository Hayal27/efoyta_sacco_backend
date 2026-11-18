import { eventBus } from '../event-bus';
import { prisma } from '../../../config/prisma';
import { processNotification } from '../../../modules/notifications/notifications.service';

eventBus.on('savings.transferred', async (payload: any) => {
  try {
    const {
      fromAccountId,
      toAccountId,
      amount,
      fromMemberId,
      toMemberId,
      fromBalance,
      toBalance,
      fromAccountNumber,
      toAccountNumber,
      withdrawalReceiptNo,
      depositReceiptNo,
    } = payload;

    // 1. Debit alert for Sender
    if (fromMemberId) {
      const nSender = await prisma.notification.create({
        data: {
          memberId: fromMemberId,
          channel: 'sms',
          triggerEvent: 'savings.withdrawn',
          payload: JSON.stringify({
            accountId: fromAccountId,
            amount,
            receiptNo: withdrawalReceiptNo,
            balance: fromBalance,
            accountNumber: fromAccountNumber,
            description: `Transfer Out to Account ${toAccountNumber}`,
          }),
          status: 'pending',
        },
      });
      await processNotification(nSender.id);
    }

    // 2. Credit alert for Receiver
    if (toMemberId) {
      const nReceiver = await prisma.notification.create({
        data: {
          memberId: toMemberId,
          channel: 'sms',
          triggerEvent: 'savings.deposited',
          payload: JSON.stringify({
            accountId: toAccountId,
            amount,
            receiptNo: depositReceiptNo,
            balance: toBalance,
            accountNumber: toAccountNumber,
            description: `Transfer In from Account ${fromAccountNumber}`,
          }),
          status: 'pending',
        },
      });
      await processNotification(nReceiver.id);
    }
  } catch (err) {
    console.error('on-savings-transferred listener failed:', err);
  }
});
