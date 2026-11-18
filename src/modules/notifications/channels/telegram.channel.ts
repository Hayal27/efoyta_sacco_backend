import { env } from '../../../config/env';

/**
 * Telegram Bot Notification Channel
 * Dispatches instant OTP codes, security alerts, and financial transaction receipts
 * through the Telegram Bot API (@Ethiopian_IT_Park_bot).
 */

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  parseMode: 'HTML' | 'Markdown' = 'HTML'
): Promise<boolean> {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('[Telegram Channel] TELEGRAM_BOT_TOKEN not configured. Skipping message.');
    return false;
  }

  if (!chatId) {
    return false;
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
      }),
    });

    const data = (await response.json()) as any;
    if (data.ok) {
      console.info(`✈️ [Telegram Sent] To Chat: ${chatId} | MessageID: ${data.result?.message_id}`);
      return true;
    } else {
      console.warn(`⚠️ [Telegram API Error] To Chat: ${chatId} | Error:`, data.description);
      return false;
    }
  } catch (err) {
    console.error('❌ [Telegram Channel Exception]', err);
    return false;
  }
}

/**
 * Dispatches an OTP verification code via Telegram
 */
export async function sendTelegramOtp(chatId: string, otpCode: string, title: string = 'Verification Code'): Promise<boolean> {
  const expiryMins = env.OTP_EXPIRY_MINUTES || 15;
  const message = `
🏛 <b>EFOYTA SACCO — Security Alert</b>
<b>${title}</b>

Your One-Time Passcode (OTP) is:
<code>${otpCode}</code>

⏱ <i>This verification code expires in ${expiryMins} minutes.</i>
🔒 <i>Never share your OTP with anyone, including SACCO staff.</i>
`;

  return sendTelegramMessage(chatId, message.trim());
}

/**
 * Dispatches an official transaction notice via Telegram
 */
export async function sendTelegramTransactionAlert(
  chatId: string,
  params: {
    title: string;
    amount: string;
    isCredit: boolean;
    receiptNo: string;
    accountNumber: string;
    productName: string;
    balance?: string;
  }
): Promise<boolean> {
  const symbol = params.isCredit ? '🟢 CREDIT' : '🔴 DEBIT';
  const sign = params.isCredit ? '+' : '−';

  const message = `
🏛 <b>EFOYTA SACCO • Transaction Notice</b>
━━━━━━━━━━━━━━━━━━━━
<b>Status:</b> ${symbol}
<b>Amount:</b> <code>${sign}${params.amount} ETB</code>
<b>Account:</b> <code>${params.accountNumber}</code> (${params.productName})
<b>Receipt Ref:</b> <code>${params.receiptNo}</code>
${params.balance ? `<b>Available Balance:</b> <code>${params.balance} ETB</code>\n` : ''}<b>Time:</b> ${new Date().toLocaleString()}
━━━━━━━━━━━━━━━━━━━━
<i>Thank you for banking with EFOYTA SACCO.</i>
`;

  return sendTelegramMessage(chatId, message.trim());
}
