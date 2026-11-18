import { z } from 'zod';

export const loanApplicationSchema = z.object({
  memberId: z.string().uuid('Invalid member'),
  loanProductId: z.string().uuid('Invalid loan product'),
  principal: z.number().positive('Loan amount must be greater than zero'),
  termMonths: z.number().int().positive('Term must be a positive integer'),
  purpose: z.string().min(5, 'Please describe the loan purpose').max(500).optional(),
});

export const loanApprovalSchema = z.object({
  loanId: z.string().uuid(),
  action: z.enum(['approve', 'reject']),
  note: z.string().max(500).optional(),
});

export const disbursementSchema = z.object({
  loanId: z.string().uuid(),
  disbursedDate: z.coerce.date({ required_error: 'Disbursement date is required' }),
  paymentMethod: z.enum(['cash', 'bank', 'mobile_money']).default('cash'),
});

export const repaymentSchema = z.object({
  loanId: z.string().uuid('Invalid loan'),
  amount: z.number().positive('Repayment amount must be greater than zero'),
  paidDate: z.coerce.date({ required_error: 'Payment date is required' }),
  receiptNo: z.string().max(30).optional(),
  paymentMethod: z.enum(['cash', 'bank', 'mobile_money']).default('cash'),
});

export const loanProductSchema = z.object({
  name: z.string().min(2).max(100),
  interestRate: z.number().min(0).max(100),
  maxAmount: z.number().positive(),
  termMonths: z.number().int().positive(),
  minMembershipDays: z.number().int().min(0).default(0),
});

export type LoanApplicationInput = z.infer<typeof loanApplicationSchema>;
export type LoanApprovalInput = z.infer<typeof loanApprovalSchema>;
export type DisbursementInput = z.infer<typeof disbursementSchema>;
export type RepaymentInput = z.infer<typeof repaymentSchema>;
export type LoanProductInput = z.infer<typeof loanProductSchema>;
