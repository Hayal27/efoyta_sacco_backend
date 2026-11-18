export type SavingsType = 'voluntary' | 'regular' | 'children' | 'loan_saving';
export type TxnType = 'deposit' | 'withdrawal' | 'interest';
export type PaymentMethod = 'cash' | 'bank' | 'mobile_money';

export interface SavingsProduct {
  id: string;
  name: string;
  type: SavingsType;
  interestRate: number;
  minBalance: number;
  noticePeriodDays: number;
}

export interface SavingsAccount {
  id: string;
  memberId: string;
  productId: string;
  product?: SavingsProduct;
  balance: number; // computed from transactions
  openedAt: Date;
}

export interface SavingsTxn {
  id: string;
  accountId: string;
  type: TxnType;
  amount: number;
  receiptNo?: string;
  focalAgentId?: string;
  paymentMethod: PaymentMethod;
  txnDate: Date;
  reasonCode?: string;
  recordedBy: string;
  createdAt: Date;
}
