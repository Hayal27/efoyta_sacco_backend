import { calculateMonthlyInstallment, roundCurrency, addMonths } from '@coop/utils';
import type { RepaymentScheduleItem } from '@coop/types';

export function generateRepaymentSchedule(
  principal: number,
  annualInterestRate: number,
  termMonths: number,
  disbursedDate: Date,
  amortizationType: 'declining_balance' | 'flat_rate' | 'equal_principal' | string = 'declining_balance',
): RepaymentScheduleItem[] {
  const schedule: RepaymentScheduleItem[] = [];
  let currentDate = new Date(disbursedDate);

  if (amortizationType === 'flat_rate') {
    // ── Straight-Line Flat Rate Schedule ──────────────────────────────────────
    const totalInterest = principal * (annualInterestRate / 100) * (termMonths / 12);
    const monthlyPrincipal = principal / termMonths;
    const monthlyInterest = totalInterest / termMonths;
    let balance = principal;

    for (let i = 1; i <= termMonths; i++) {
      currentDate = addMonths(currentDate, 1);
      let pDue = monthlyPrincipal;
      const iDue = monthlyInterest;

      if (i === termMonths) {
        pDue = balance;
      }
      balance -= pDue;

      schedule.push({
        installmentNo: i,
        dueDate: new Date(currentDate),
        principalDue: roundCurrency(pDue),
        interestDue: roundCurrency(iDue),
        totalDue: roundCurrency(pDue + iDue),
        balance: Math.max(0, roundCurrency(balance)),
      });
    }

  } else if (amortizationType === 'equal_principal') {
    // ── Equal Principal (Reducing Interest) ────────────────────────────────────
    const monthlyRate = annualInterestRate / 100 / 12;
    const monthlyPrincipal = principal / termMonths;
    let balance = principal;

    for (let i = 1; i <= termMonths; i++) {
      currentDate = addMonths(currentDate, 1);
      const iDue = balance * monthlyRate;
      let pDue = monthlyPrincipal;

      if (i === termMonths) {
        pDue = balance;
      }
      balance -= pDue;

      schedule.push({
        installmentNo: i,
        dueDate: new Date(currentDate),
        principalDue: roundCurrency(pDue),
        interestDue: roundCurrency(iDue),
        totalDue: roundCurrency(pDue + iDue),
        balance: Math.max(0, roundCurrency(balance)),
      });
    }

  } else {
    // ── Declining Balance (Standard Amortized Annuity Formula) ────────────────
    const pmt = calculateMonthlyInstallment(principal, annualInterestRate, termMonths);
    const monthlyRate = annualInterestRate / 100 / 12;
    let balance = principal;

    for (let i = 1; i <= termMonths; i++) {
      currentDate = addMonths(currentDate, 1);
      const iDue = balance * monthlyRate;
      let pDue = pmt - iDue;

      if (i === termMonths) {
        pDue = balance;
      }
      balance -= pDue;

      schedule.push({
        installmentNo: i,
        dueDate: new Date(currentDate),
        principalDue: roundCurrency(pDue),
        interestDue: roundCurrency(iDue),
        totalDue: roundCurrency(pDue + iDue),
        balance: Math.max(0, roundCurrency(balance)),
      });
    }
  }

  return schedule;
}
