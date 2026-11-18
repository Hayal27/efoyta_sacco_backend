import { Member } from './member.types';
import { User } from './user.types';

export interface ShareConfig {
  id: string;
  sharePrice: number;
  totalAvailable: number;
  minPerMember: number;
  maxPerMember: number;
  updatedAt: Date;
}

export interface ShareAccount {
  id: string;
  memberId: string;
  balance: number;
  openedAt: Date;
  member?: Member;
  txns?: ShareTxn[];
}

export type ShareTxnType = 'purchase' | 'transfer_in' | 'transfer_out';

export interface ShareTxn {
  id: string;
  accountId: string;
  type: ShareTxnType;
  shares: number;
  pricePerShare: number;
  totalAmount: number;
  paymentMethod: 'cash' | 'bank' | 'mobile_money';
  txnDate: Date;
  receiptNo?: string | null;
  focalAgentId?: string | null;
  recordedBy: string;
  createdAt: Date;
  
  account?: ShareAccount;
  recordedByUser?: User;
}

export interface SharePurchaseDto {
  memberId: string;
  shares: number;
  paymentMethod: 'cash' | 'bank' | 'mobile_money';
  txnDate: string;
  focalAgentId?: string;
  receiptNo?: string;
}

export interface ShareTransferDto {
  fromMemberId: string;
  toMemberId: string;
  shares: number;
  txnDate: string;
  focalAgentId?: string;
}

export interface ShareConfigUpdateDto {
  sharePrice?: number;
  totalAvailable?: number;
  minPerMember?: number;
  maxPerMember?: number;
}

export type DividendStrategy = 'flat_rate' | 'time_weighted';
export type DividendRunStatus = 'draft' | 'calculated' | 'approved' | 'posted';

export interface DividendCalculateDto {
  fiscalYear: number;
  totalPool: number;
  distributionStrategy: DividendStrategy;
}

export interface DividendPayoutDto {
  id: string;
  memberId: string;
  memberName?: string;
  memberCode?: string;
  shareBalance: number;
  weightedShareBalance: number;
  payoutAmount: number;
  isPosted: boolean;
  postedAt?: Date | null;
}

export interface DividendRunDto {
  id: string;
  fiscalYear: number;
  totalPool: number;
  distributionStrategy: DividendStrategy;
  status: DividendRunStatus;
  totalSharesEligible: number;
  totalDividendPaid: number;
  calculatedAt?: Date | null;
  approvedAt?: Date | null;
  postedAt?: Date | null;
  createdAt: Date;
  payouts?: DividendPayoutDto[];
}

