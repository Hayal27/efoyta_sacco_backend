import { env } from '../../../config/env';

const AFROMESSAGE_URL = 'https://api.afromessage.com/api/send';

/**
 * Sends an SMS via the AfroMessage API.
 * Token is configured via AFROMESSAGE_TOKEN env variable.
 * Falls back to a console mock when no token is configured.
 */
export async function sendSms(to: string, message: string): Promise<boolean> {
  if (!env.AFROMESSAGE_TOKEN) {
    console.warn(`[SMS Mock] To: ${to} | Message: ${message}`);
    return true;
  }

  // Normalise phone: ensure it starts with 251 (Ethiopia country code)
  const phone = normalisePhone(to);

  try {
    const response = await fetch(AFROMESSAGE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.AFROMESSAGE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: phone,
        message,
        sender: env.AFROMESSAGE_SENDER_ID || undefined,
      }),
    });

    const data = await response.json() as any;

    if (!response.ok || data?.acknowledge === 'error') {
      console.error('[AfroMessage] Send failed:', data);
      return false;
    }

    console.info('[AfroMessage] SMS sent successfully to', phone);
    return true;
  } catch (err) {
    console.error('[AfroMessage] Request error:', err);
    return false;
  }
}

/** Normalise to Ethiopian international format: 2519XXXXXXXX */
function normalisePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('251')) return `+${digits}`;
  if (digits.startsWith('09') || digits.startsWith('07')) return `+251${digits.slice(1)}`;
  if (digits.startsWith('9') || digits.startsWith('7')) return `+251${digits}`;
  return `+${digits}`;
}
