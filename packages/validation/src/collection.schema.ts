import { z } from 'zod';

export const collectionSessionSchema = z.object({
  focalAgentId: z.string().uuid('Invalid focal agent').optional(),
  collectionDate: z.coerce.date({ required_error: 'Collection date is required' }),
});

export const collectionEntrySchema = z.object({
  sessionId: z.string().uuid('Invalid session'),
  memberId: z.string().uuid('Invalid member'),
  voluntarySaving: z.number().min(0).default(0),
  interestFromVoluntary: z.number().min(0).default(0),
  loanSaving: z.number().min(0).default(0),
  regularSaving: z.number().min(0).default(0),
  interestFromRegular: z.number().min(0).default(0),
  childrensSaving: z.number().min(0).default(0),
  loanAmount: z.number().min(0).default(0),
  dailyLoanRepayment: z.number().min(0).default(0),
  bookFee: z.number().min(0).default(0),
  dailyCollectedShare: z.number().min(0).default(0),
  registrationFee: z.number().min(0).default(0),
  loanInterestAmount: z.number().min(0).default(0),
  receiptNo: z.string().max(30).optional(),
  paymentMethod: z.enum(['cash', 'bank', 'mobile_money']).default('cash'),
  notes: z.string().max(500).optional(),
});

export const reconciliationSchema = z.object({
  sessionId: z.string().uuid('Invalid session'),
  cashOnHand: z.number().min(0, 'Cash on hand must be non-negative'),
  notes: z.string().max(500).optional(),
});

export type CollectionSessionInput = z.infer<typeof collectionSessionSchema>;
export type CollectionEntryInput = z.infer<typeof collectionEntrySchema>;
export type ReconciliationInput = z.infer<typeof reconciliationSchema>;
