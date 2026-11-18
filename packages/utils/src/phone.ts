/**
 * Normalize a phone number by stripping spaces and ensuring a + prefix
 * if it starts with a country code digit sequence.
 */
export function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-().]/g, '');
  // Convert 09XXXXXXXX (Ethiopian) to +2519XXXXXXXX
  if (/^09\d{8}$/.test(cleaned)) {
    cleaned = '+251' + cleaned.slice(1);
  }
  // Convert 9XXXXXXXX (no leading 0) to +2519XXXXXXXX
  if (/^9\d{8}$/.test(cleaned)) {
    cleaned = '+251' + cleaned;
  }
  return cleaned;
}

/**
 * Format a phone number for display.
 * +251911234567 → +251 91 123 4567
 */
export function formatPhone(phone: string): string {
  const normalized = normalizePhone(phone);
  if (normalized.startsWith('+251') && normalized.length === 13) {
    return `${normalized.slice(0, 4)} ${normalized.slice(4, 6)} ${normalized.slice(6, 9)} ${normalized.slice(9)}`;
  }
  return normalized;
}

/**
 * Check if a phone string is valid (9–15 digits, optional + prefix).
 */
export function isValidPhone(phone: string): boolean {
  return /^\+?[0-9]{9,15}$/.test(phone.replace(/[\s\-().]/g, ''));
}

/**
 * Mask a phone number for display (e.g. +251 91 ***  4567)
 */
export function maskPhone(phone: string): string {
  const formatted = formatPhone(phone);
  return formatted.replace(/(\d{3})(?=\d{4}$)/, '***');
}
