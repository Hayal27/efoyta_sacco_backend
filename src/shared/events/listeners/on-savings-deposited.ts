import { eventBus } from '../event-bus';
import { prisma } from '../../../config/prisma';
import { processNotification } from '../../../modules/notifications/notifications.service';

eventBus.on('savings.deposited', async (payload: any) => {
  try {
    const { memberId, accountId, amount, receiptNo, balance, accountNumber, productName, txnId } = payload;
    const notification = await prisma.notification.create({
      data: {
        memberId,
        channel: 'sms',
        triggerEvent: 'savings.deposited',
        payload: JSON.stringify({
          accountId,
          amount,
          receiptNo,
          balance,
          accountNumber,
          productName,
          txnId,
        }),
        status: 'pending',
      },
    });
    await processNotification(notification.id);
  } catch (err) {
    console.error('on-savings-deposited listener failed:', err);
  }
});
