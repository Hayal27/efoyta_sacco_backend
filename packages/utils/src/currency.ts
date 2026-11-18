/**
 * Format a number as Ethiopian Birr currency.
 * Uses ETB locale formatting (e.g. ETB 1,250.00)
 */
export function formatCurrency(
  amount: number,
  options: { currency?: string; locale?: string } = {},
): string {
  const { currency = 'ETB', locale = 'en-ET' } = options;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Fallback for environments without ETB support
    return `${currency} ${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  }
}

/**
 * Format a raw number with comma separators (no currency symbol).
 */
export function formatNumber(amount: number, decimals = 2): string {
  return amount.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Parse a currency string back to a number.
 * Strips currency symbols and commas.
 */
export function parseCurrency(value: string): number {
  const cleaned = value.replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Calculate simple interest.
 * @param principal - Loan or savings principal
 * @param annualRate - Annual interest rate (0–100)
 * @param months - Loan term in months
 */
export function calculateSimpleInterest(
  principal: number,
  annualRate: number,
  months: number,
): number {
  return (principal * annualRate * months) / (100 * 12);
}

/**
 * Calculate reducing-balance (declining-balance) monthly installment.
 * Standard loan formula: PMT = P * r / (1 - (1 + r)^-n)
 */
export function calculateMonthlyInstallment(
  principal: number,
  annualRate: number,
  termMonths: number,
): number {
  if (annualRate === 0) return principal / termMonths;
  const r = annualRate / 100 / 12;
  return (principal * r) / (1 - Math.pow(1 + r, -termMonths));
}

/**
 * Round a currency value to 2 decimal places (banker's rounding avoided — using Math.round).
 */
export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}
