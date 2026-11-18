/**
 * Format a Date or ISO string as a human-readable date (e.g. "Jan 15, 2026").
 */
export function formatDate(date: Date | string, locale = 'en-ET'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Format a Date as ISO date string (YYYY-MM-DD) suitable for MySQL DATE columns.
 */
export function toISODate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Add N months to a date. Used for calculating due dates.
 */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

/**
 * Return the number of full days between two dates.
 */
export function daysBetween(from: Date, to: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor((to.getTime() - from.getTime()) / msPerDay);
}

/**
 * Check whether a date is in the past (strictly before today).
 */
export function isPast(date: Date): boolean {
  return date < new Date();
}

/**
 * Return start-of-day for a Date (midnight UTC).
 */
export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Return end-of-day for a Date (23:59:59.999 UTC).
 */
export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

/**
 * Return the first and last day of the current month.
 */
export function currentMonthRange(): { from: Date; to: Date } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from, to };
}
