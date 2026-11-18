import { z } from 'zod';

export const depositSchema = z.object({
  accountId: z.string().uuid('Invalid savings account'),
  amount: z.number().positive('Amount must be greater than zero'),
  paymentMethod: z.enum(['cash', 'bank', 'mobile_money']).default('cash'),
  txnDate: z.coerce.date({ required_error: 'Transaction date is required' }),
  receiptNo: z.string().max(30).optional(),
  focalAgentId: z.string().uuid().optional().nullable(),
  reasonCode: z.string().max(50).optional(),
});

export const withdrawalSchema = z.object({
  accountId: z.string().uuid('Invalid savings account'),
  amount: z.number().positive('Amount must be greater than zero'),
  paymentMethod: z.enum(['cash', 'bank', 'mobile_money']).default('cash'),
  txnDate: z.coerce.date({ required_error: 'Transaction date is required' }),
  receiptNo: z.string().max(30).optional(),
  reasonCode: z.string().max(50).optional(),
});

export const savingsProductSchema = z.object({
  name: z.string().min(2).max(100),
  type: z.enum(['voluntary', 'regular', 'children', 'loan_saving']),
  interestRate: z.number().min(0).max(100),
  minBalance: z.number().min(0).default(0),
  noticePeriodDays: z.number().int().min(0).default(0),
});

export type DepositInput = z.infer<typeof depositSchema>;
export type WithdrawalInput = z.infer<typeof withdrawalSchema>;
export type SavingsProductInput = z.infer<typeof savingsProductSchema>;
