import { eventBus } from '../event-bus';
import { prisma } from '../../../config/prisma';
import { processNotification } from '../../../modules/notifications/notifications.service';

eventBus.on('savings.withdrawn', async (payload: any) => {
  try {
    const { memberId, accountId, amount, receiptNo, balance, accountNumber, productName, txnId } = payload;
    const notification = await prisma.notification.create({
      data: {
        memberId,
        channel: 'sms',
        triggerEvent: 'savings.withdrawn',
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
    console.error('on-savings-withdrawn listener failed:', err);
  }
});
