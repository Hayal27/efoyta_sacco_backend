import { eventBus } from '../event-bus';
import { prisma } from '../../../config/prisma';
import { processNotification } from '../../../modules/notifications/notifications.service';

/**
 * When a loan is repaid:
 * 1. Queue an SMS notification to the member
 * 2. Immediately dispatch via AfroMessage
 */
eventBus.on('loan.repaid', async ({ loanId, memberId, amount }) => {
  try {
    const notification = await prisma.notification.create({
      data: {
        memberId,
        channel: 'sms',
        triggerEvent: 'loan.repaid',
        payload: JSON.stringify({ loanId, amount }),
        status: 'pending',
      },
    });
    // Send immediately — no BullMQ worker needed
    await processNotification(notification.id);
  } catch (err) {
    console.error('on-loan-repaid listener failed:', err);
  }
});
