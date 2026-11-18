import { EventEmitter } from 'events';

/**
 * Internal typed event bus for decoupling side-effects from business logic.
 *
 * Financial mutations (loan repaid, savings deposited) emit events here.
 * Listeners handle SMS, email, and audit-log side effects asynchronously.
 *
 * This keeps write endpoints fast and service code clean.
 */

export type CoopEvent =
  | { type: 'loan.repaid'; payload: { loanId: string; memberId: string; amount: number; receiptNo: string; newOutstanding: number; loanProductName?: string } }
  | { type: 'loan.approved'; payload: { loanId: string; memberId: string } }
  | { type: 'loan.overdue'; payload: { loanId: string; memberId: string; daysOverdue: number } }
  | { type: 'savings.deposited'; payload: { accountId: string; memberId: string; amount: number; receiptNo?: string; balance?: number; accountNumber?: string; productName?: string; txnId?: string } }
  | { type: 'savings.withdrawn'; payload: { accountId: string; memberId: string; amount: number; receiptNo?: string; balance?: number; accountNumber?: string; productName?: string; txnId?: string } }
  | {
      type: 'savings.transferred';
      payload: {
        fromAccountId: string;
        toAccountId: string;
        amount: number;
        fromMemberId?: string;
        toMemberId?: string;
        fromBalance?: number;
        toBalance?: number;
        fromAccountNumber?: string;
        toAccountNumber?: string;
        withdrawalReceiptNo?: string;
        depositReceiptNo?: string;
      };
    }
  | { type: 'member.registered'; payload: { memberId: string } }
  | { type: 'collection.reconciled'; payload: { sessionId: string; focalAgentId: string } };

class TypedEventBus extends EventEmitter {
  emit<E extends CoopEvent>(event: E): boolean {
    return super.emit(event.type, event.payload);
  }

  on<E extends CoopEvent, K extends E['type'] = E['type']>(
    eventType: K,
    listener: (payload: Extract<CoopEvent, { type: K }>['payload']) => void | Promise<void>,
  ): this {
    return super.on(eventType, listener as any);
  }
}

export const eventBus = new TypedEventBus();
eventBus.setMaxListeners(20);
