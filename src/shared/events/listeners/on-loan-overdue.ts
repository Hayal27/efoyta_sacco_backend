import { eventBus } from '../event-bus';
import { prisma } from '../../../config/prisma';
import { processNotification } from '../../../modules/notifications/notifications.service';

eventBus.on('loan.overdue', async ({ loanId, memberId, daysOverdue }) => {
  try {
    const smsNotif = await prisma.notification.create({
      data: {
        memberId,
        channel: 'sms',
        triggerEvent: 'loan.overdue',
        payload: JSON.stringify({ loanId, daysOverdue }),
        status: 'pending',
      },
    });
    await processNotification(smsNotif.id);

    // Also queue email (for future email implementation)
    await prisma.notification.create({
      data: {
        memberId,
        channel: 'email',
        triggerEvent: 'loan.overdue',
        payload: JSON.stringify({ loanId, daysOverdue }),
        status: 'pending',
      },
    });
  } catch (err) {
    console.error('on-loan-overdue listener failed:', err);
  }
});
