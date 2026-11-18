import { z } from 'zod';

/**
 * Standard CloudEvents 1.0 compliant envelope for all microservice domain events.
 */
export interface CoopEventEnvelope<T = Record<string, unknown>> {
  /** Unique event identifier (UUID v4) */
  id: string;
  /** Hierarchical topic or event name (e.g. 'financial.savings.deposited') */
  type: string;
  /** URI of the service emitting the event (e.g. 'urn:coop:service:savings') */
  source: string;
  /** CloudEvents spec version */
  specversion: '1.0';
  /** ISO 8601 timestamp */
  time: string;
  /** Primary domain entity ID (e.g. loanId, memberId) */
  subject: string;
  /** MIME content type */
  datacontenttype: 'application/json';
  /** Correlation/Trace ID propagated across service boundaries */
  traceparent?: string;
  /** Optional tenant or branch identifier */
  branchId?: string;
  /** Domain event payload */
  data: T;
}

// ── Event Schemas ─────────────────────────────────────────────────────────────

export const SavingsDepositedPayloadSchema = z.object({
  accountId: z.string().uuid(),
  memberId: z.string().uuid(),
  amount: z.number().positive(),
  paymentMethod: z.string(),
  reference: z.string().optional(),
  branchId: z.string().uuid().optional(),
  depositedAt: z.string().datetime().optional(),
});
export type SavingsDepositedPayload = z.infer<typeof SavingsDepositedPayloadSchema>;

export const SavingsWithdrawnPayloadSchema = z.object({
  accountId: z.string().uuid(),
  memberId: z.string().uuid(),
  amount: z.number().positive(),
  branchId: z.string().uuid().optional(),
  withdrawnAt: z.string().datetime().optional(),
});
export type SavingsWithdrawnPayload = z.infer<typeof SavingsWithdrawnPayloadSchema>;

export const LoanDisbursedPayloadSchema = z.object({
  loanId: z.string().uuid(),
  memberId: z.string().uuid(),
  principal: z.number().positive(),
  netDisbursed: z.number().positive(),
  branchId: z.string().uuid().optional(),
  disbursedAt: z.string().datetime().optional(),
});
export type LoanDisbursedPayload = z.infer<typeof LoanDisbursedPayloadSchema>;

export const LoanRepaidPayloadSchema = z.object({
  loanId: z.string().uuid(),
  memberId: z.string().uuid(),
  amount: z.number().positive(),
  principalPaid: z.number().nonnegative().optional(),
  interestPaid: z.number().nonnegative().optional(),
  penaltyPaid: z.number().nonnegative().optional(),
  receiptNo: z.string(),
  newOutstanding: z.number().nonnegative(),
  branchId: z.string().uuid().optional(),
  loanProductName: z.string().optional(),
  repaidAt: z.string().datetime().optional(),
});
export type LoanRepaidPayload = z.infer<typeof LoanRepaidPayloadSchema>;

export const LoanOverduePayloadSchema = z.object({
  loanId: z.string().uuid(),
  memberId: z.string().uuid(),
  daysOverdue: z.number().int().positive(),
  amountOverdue: z.number().positive().optional(),
});
export type LoanOverduePayload = z.infer<typeof LoanOverduePayloadSchema>;

export const CollectionReconciledPayloadSchema = z.object({
  sessionId: z.string().uuid(),
  focalAgentId: z.string().uuid(),
  cashierId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  totalAmount: z.number().nonnegative(),
  entriesCount: z.number().int().nonnegative(),
  reconciledAt: z.string().datetime().optional(),
});
export type CollectionReconciledPayload = z.infer<typeof CollectionReconciledPayloadSchema>;

export const NotificationDispatchPayloadSchema = z.object({
  channel: z.enum(['sms', 'email', 'in_app']),
  recipient: z.string(),
  title: z.string().optional(),
  body: z.string(),
  metadata: z.record(z.unknown()).optional(),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
});
export type NotificationDispatchPayload = z.infer<typeof NotificationDispatchPayloadSchema>;

export const AuditLogPayloadSchema = z.object({
  actorId: z.string().uuid().optional(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  branchId: z.string().uuid().optional(),
  ipAddress: z.string().optional(),
  details: z.record(z.unknown()).optional(),
  timestamp: z.string().datetime().optional(),
});
export type AuditLogPayload = z.infer<typeof AuditLogPayloadSchema>;

// ── Event Types Mapping ───────────────────────────────────────────────────────

export const COOP_EVENT_TYPES = {
  SAVINGS_DEPOSITED: 'financial.savings.deposited',
  SAVINGS_WITHDRAWN: 'financial.savings.withdrawn',
  LOAN_DISBURSED: 'financial.loan.disbursed',
  LOAN_REPAID: 'financial.loan.repaid',
  LOAN_OVERDUE: 'financial.loan.overdue',
  COLLECTION_RECONCILED: 'financial.collection.reconciled',
  NOTIFICATION_DISPATCH: 'system.notification.dispatch',
  AUDIT_ENTRY: 'system.audit.entry',
} as const;

export type CoopEventType = (typeof COOP_EVENT_TYPES)[keyof typeof COOP_EVENT_TYPES];

/**
 * Factory helper to construct a CloudEvents envelope.
 */
export function createEventEnvelope<T>(
  type: CoopEventType | string,
  source: string,
  subject: string,
  data: T,
  options?: { traceparent?: string; branchId?: string; id?: string },
): CoopEventEnvelope<T> {
  return {
    id: options?.id ?? (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).substring(2)),
    type,
    source,
    specversion: '1.0',
    time: new Date().toISOString(),
    subject,
    datacontenttype: 'application/json',
    traceparent: options?.traceparent,
    branchId: options?.branchId,
    data,
  };
}
