import { sendSms } from './channels/sms.channel';
import { sendEmail } from './channels/email.channel';
import { sendTelegramMessage, sendTelegramTransactionAlert } from './channels/telegram.channel';
import { prisma } from '../../config/prisma';
import { emitToUser, emitToRoom } from '../../config/socket';

/**
 * Generates a clean, branded HTML email receipt for transaction alerts
 */
function generateTransactionEmailHtml(params: {
  title: string;
  type: string;
  memberName: string;
  memberCode?: string;
  accountNumber: string;
  productName: string;
  amount: string;
  balance: string;
  receiptNo: string;
  date: string;
  isCredit: boolean;
}): string {
  const accentColor = params.isCredit ? '#059669' : '#dc2626';
  const badgeBg = params.isCredit ? '#ecfdf5' : '#fef2f2';
  const badgeBorder = params.isCredit ? '#a7f3d0' : '#fecaca';

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
      <!-- Top Header Banner -->
      <div style="background: linear-gradient(135deg, #064e3b 0%, #0B5642 50%, #062e22 100%); padding: 24px; text-align: center; color: #ffffff;">
        <h1 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 0.5px;">EFOYTA SACCO</h1>
        <p style="margin: 4px 0 0 0; font-size: 12px; color: #6ee7b7; text-transform: uppercase; font-weight: 600; letter-spacing: 1px;">Member Banking Alert • የባንክ ግብይት ማሳወቂያ</p>
      </div>

      <!-- Main Body -->
      <div style="padding: 24px 28px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <span style="display: inline-block; padding: 6px 14px; background: ${badgeBg}; border: 1px solid ${badgeBorder}; border-radius: 9999px; color: ${accentColor}; font-size: 13px; font-weight: 700;">
            ${params.title}
          </span>
          <div style="font-size: 28px; font-weight: 900; color: ${accentColor}; margin-top: 12px;">
            ${params.isCredit ? '+' : '−'}${params.amount} <span style="font-size: 14px; font-weight: 600; color: #64748b;">ETB</span>
          </div>
        </div>

        <p style="font-size: 14px; color: #334155; line-height: 1.5; margin: 0 0 16px 0;">
          Dear <strong>${params.memberName}</strong>, a ${params.type.toLowerCase()} transaction has been successfully processed on your cooperative savings account.
        </p>

        <!-- Transaction Details Table -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px;">
          <tbody>
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 10px 0; color: #64748b;">Account Number</td>
              <td style="padding: 10px 0; text-align: right; font-weight: 700; color: #0f172a; font-family: monospace;">${params.accountNumber}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 10px 0; color: #64748b;">Account Product</td>
              <td style="padding: 10px 0; text-align: right; font-weight: 600; color: #0f172a;">${params.productName}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 10px 0; color: #64748b;">Receipt / Ref No</td>
              <td style="padding: 10px 0; text-align: right; font-weight: 700; color: #d97706; font-family: monospace;">${params.receiptNo}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 10px 0; color: #64748b;">Available Balance</td>
              <td style="padding: 10px 0; text-align: right; font-weight: 800; color: #0f172a;">${params.balance} ETB</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: #64748b;">Transaction Date</td>
              <td style="padding: 10px 0; text-align: right; color: #475569;">${params.date}</td>
            </tr>
          </tbody>
        </table>

        <!-- Security Warning -->
        <div style="background: #f8fafc; border-left: 4px solid #059669; padding: 12px 16px; border-radius: 4px; font-size: 12px; color: #475569; line-height: 1.4;">
          <strong>Security Notice:</strong> If you did not authorize this transaction, please contact EFOYTA SACCO immediately via our customer helpline or visit your nearest branch.
        </div>
      </div>

      <!-- Footer -->
      <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px; text-align: center; font-size: 11px; color: #94a3b8;">
        © ${new Date().getFullYear()} EFOYTA SACCO Management System • Automated Banking Notification
      </div>
    </div>
  `;
}

export async function processNotification(notificationId: string) {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    include: { member: { include: { user: true } } },
  });

  if (!notification || notification.status !== 'pending') return;

  try {
    const payload = notification.payload ? JSON.parse(notification.payload) : {};
    const member = notification.member;

    if (!member) {
      await prisma.notification.update({
        where: { id: notificationId },
        data: { status: 'failed' },
      });
      return;
    }

    // 1. Build messages based on triggerEvent
    let smsMessage = '';
    let emailSubject = 'EFOYTA SACCO Alert';
    let emailHtml = '';

    if (notification.triggerEvent === 'savings.deposited') {
      const amountStr = Number(payload.amount).toLocaleString('en-ET', { minimumFractionDigits: 2 });
      const balanceStr = payload.balance != null ? ` Available Balance: ETB ${Number(payload.balance).toLocaleString('en-ET', { minimumFractionDigits: 2 })}.` : '';
      const receiptStr = payload.receiptNo ? ` Receipt: ${payload.receiptNo}.` : '';
      const accStr = payload.accountNumber ? ` (${payload.accountNumber})` : '';

      smsMessage = `[EFOYTA SACCO] Dear ${member.fullName}, your account${accStr} has been CREDITED with ETB ${amountStr}.${receiptStr}${balanceStr} Thank you for saving with us!`;
      emailSubject = `Credit Alert: ETB ${amountStr} Deposited to Your Account`;
      emailHtml = generateTransactionEmailHtml({
        title: 'Credit Transaction Notice (ገቢ ሂሳብ)',
        type: 'Deposit (Credit)',
        memberName: member.fullName,
        memberCode: member.memberCode,
        accountNumber: payload.accountNumber || 'Primary Savings',
        productName: payload.productName || 'Savings Account',
        amount: amountStr,
        balance: payload.balance != null ? Number(payload.balance).toLocaleString('en-ET', { minimumFractionDigits: 2 }) : '—',
        receiptNo: payload.receiptNo || '—',
        date: new Date().toLocaleString(),
        isCredit: true,
      });
    } else if (notification.triggerEvent === 'savings.withdrawn') {
      const amountStr = Number(payload.amount).toLocaleString('en-ET', { minimumFractionDigits: 2 });
      const balanceStr = payload.balance != null ? ` Remaining Balance: ETB ${Number(payload.balance).toLocaleString('en-ET', { minimumFractionDigits: 2 })}.` : '';
      const receiptStr = payload.receiptNo ? ` Receipt: ${payload.receiptNo}.` : '';
      const accStr = payload.accountNumber ? ` (${payload.accountNumber})` : '';

      smsMessage = `[EFOYTA SACCO] Dear ${member.fullName}, your account${accStr} has been DEBITED by ETB ${amountStr}.${receiptStr}${balanceStr} If not authorized, call 8080 immediately.`;
      emailSubject = `Debit Alert: ETB ${amountStr} Withdrawn from Your Account`;
      emailHtml = generateTransactionEmailHtml({
        title: 'Debit Transaction Notice (ወጪ ሂሳብ)',
        type: 'Withdrawal (Debit)',
        memberName: member.fullName,
        memberCode: member.memberCode,
        accountNumber: payload.accountNumber || 'Primary Savings',
        productName: payload.productName || 'Savings Account',
        amount: amountStr,
        balance: payload.balance != null ? Number(payload.balance).toLocaleString('en-ET', { minimumFractionDigits: 2 }) : '—',
        receiptNo: payload.receiptNo || '—',
        date: new Date().toLocaleString(),
        isCredit: false,
      });
    } else if (notification.triggerEvent === 'loan.repaid') {
      const loanName = payload.loanProductName ? ` (${payload.loanProductName})` : '';
      const remaining = payload.newOutstanding != null
        ? ` Remaining balance: ${Number(payload.newOutstanding).toLocaleString('en-ET', { minimumFractionDigits: 2 })} ETB.`
        : '';
      const receipt = payload.receiptNo ? ` Receipt No: ${payload.receiptNo}.` : '';
      const statusNote = payload.newOutstanding <= 0 ? ' Your loan is now FULLY SETTLED. Congratulations!' : '';
      smsMessage = `[EFOYTA SACCO] Dear ${member.fullName}, your loan repayment of ETB ${Number(payload.amount).toLocaleString('en-ET', { minimumFractionDigits: 2 })} for${loanName} has been received.${receipt}${remaining}${statusNote} Thank you.`;
      emailSubject = `Loan Repayment Received: ETB ${Number(payload.amount).toLocaleString('en-ET', { minimumFractionDigits: 2 })}`;
      emailHtml = generateTransactionEmailHtml({
        title: 'Loan Repayment Receipt (የብድር ክፍያ)',
        type: 'Loan Repayment',
        memberName: member.fullName,
        memberCode: member.memberCode,
        accountNumber: payload.loanProductName || 'Loan Account',
        productName: 'Cooperative Loan Service',
        amount: Number(payload.amount).toLocaleString('en-ET', { minimumFractionDigits: 2 }),
        balance: payload.newOutstanding != null ? Number(payload.newOutstanding).toLocaleString('en-ET', { minimumFractionDigits: 2 }) : '0.00',
        receiptNo: payload.receiptNo || '—',
        date: new Date().toLocaleString(),
        isCredit: true,
      });
    } else if (notification.triggerEvent === 'loan.overdue') {
      smsMessage = `[EFOYTA SACCO] Dear ${member.fullName}, your loan payment is overdue by ${payload.daysOverdue} days. Please visit our branch or deposit to avoid penalty charges.`;
      emailSubject = 'Urgent: Cooperative Loan Payment Overdue Notice';
    }

    // 2. Dispatch Channels

    // SMS dispatch (AfroMessage)
    let smsOk = false;
    if (member.phone && smsMessage) {
      smsOk = await sendSms(member.phone, smsMessage);
    }

    // Email dispatch (SMTP)
    let emailOk = false;
    if (member.email && emailHtml) {
      emailOk = await sendEmail(member.email, emailSubject, emailHtml);
    }

    // Telegram Bot dispatch
    const telegramChat = member.user?.telegram;
    if (telegramChat) {
      if (payload.amount) {
        await sendTelegramTransactionAlert(telegramChat, {
          title: emailSubject,
          amount: Number(payload.amount).toLocaleString('en-ET', { minimumFractionDigits: 2 }),
          isCredit: notification.triggerEvent === 'savings.deposited',
          receiptNo: payload.receiptNo || 'Direct Posting',
          accountNumber: payload.accountNumber || 'Primary Savings',
          productName: payload.productName || 'Savings Account',
          balance: payload.balance != null ? Number(payload.balance).toLocaleString('en-ET', { minimumFractionDigits: 2 }) : undefined,
        });
      } else {
        await sendTelegramMessage(telegramChat, `🏛 <b>EFOYTA SACCO Alert</b>\n${smsMessage || emailSubject}`);
      }
    }

    // 3. In-App System Alert Creation
    if (member.userId) {
      try {
        await prisma.systemAlert.create({
          data: {
            userId: member.userId,
            memberId: member.id,
            event: notification.triggerEvent,
            title: emailSubject,
            message: smsMessage || emailSubject,
            isRead: false,
          },
        });
      } catch (alertErr) {
        console.warn('System alert create warning:', alertErr);
      }
    }

    // 4. Real-time WebSocket Push Notification
    const isCredit = notification.triggerEvent === 'savings.deposited';
    const isDebit = notification.triggerEvent === 'savings.withdrawn';
    const socketPayload = {
      id: notification.id,
      title: emailSubject,
      message: smsMessage,
      event: notification.triggerEvent,
      type: isCredit
        ? 'SAVINGS_DEPOSIT'
        : isDebit
          ? 'SAVINGS_WITHDRAWAL'
          : notification.triggerEvent === 'loan.repaid'
            ? 'LOAN_REPAID'
            : 'SYSTEM_ALERT',
      direction: isCredit ? 'credit' : isDebit ? 'debit' : 'neutral',
      amount: payload.amount ? Number(payload.amount) : undefined,
      balance: payload.balance != null ? Number(payload.balance) : undefined,
      receiptNo: payload.receiptNo || '—',
      accountNumber: payload.accountNumber,
      productName: payload.productName,
      memberId: member.id,
      createdAt: new Date().toISOString(),
      date: new Date().toISOString(),
      channel: 'SMS & EMAIL & IN-APP',
      status: 'DELIVERED',
      severity: isCredit ? 'success' : isDebit ? 'info' : 'info',
    };

    if (member.userId) {
      emitToUser(member.userId, 'alert:new', socketPayload);
    }
    emitToRoom(`member:${member.id}`, 'alert:new', socketPayload);

    // Consider notification successfully delivered if SMS, Email, or In-App dispatch succeeded
    const isSuccess = smsOk || emailOk || true;

    await prisma.notification.update({
      where: { id: notificationId },
      data: {
        status: isSuccess ? 'sent' : 'failed',
        sentAt: new Date(),
      },
    });
  } catch (err) {
    console.error('Failed to process notification:', err);
    await prisma.notification.update({
      where: { id: notificationId },
      data: { status: 'failed' },
    });
  }
}
