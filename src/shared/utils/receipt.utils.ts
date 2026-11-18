import { randomBytes } from 'crypto';

/**
 * Generates a unique receipt number.
 * Format: RCPT-<YYYYMMDD>-<4_HEX_CHARS>
 * Example: RCPT-20231024-A1B2
 */
export function generateReceiptNo(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomHex = randomBytes(2).toString('hex').toUpperCase();
  return `RCPT-${dateStr}-${randomHex}`;
}
