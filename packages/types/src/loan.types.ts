export type LoanStatus = 'pending' | 'pending_approval' | 'active' | 'rejected' | 'closed' | 'defaulted' | 'written_off';
export type LoanType = 'emergency' | 'regular' | 'special';
export type TermUnit = 'day' | 'week' | 'month' | 'annual';
export type InterestCalcMode = 'prorated' | 'flat_term';

export interface DayInterestTier {
  maxDays: number;  // up to this many days (inclusive)
  rate: number;     // flat % applied for this bracket
}

export interface ShareRequirement {
  fromAmount: number;
  toAmount: number;
  minShares: number;
}

export interface LoanProduct {
  id: string;
  name: string;
  loanType: LoanType;
  isActive: boolean;
  description?: string | null;
  // Amount range
  minAmount: number;
  maxAmount: number;
  termMonths: number;
  termUnit: TermUnit;
  interestCalcMode?: InterestCalcMode;
  // Eligibility
  reqDailyLoanSaving: number;
  reqRegistrationFee: number;
  loanSavingMultiplier: number;
  // Fees
  bookFee: number;
  penaltyRate: number;
  // Interest (regular / special)
  interestRate: number;
  insuranceRate: number;
  serviceRate: number;
  // JSON fields
  shareRequirements?: ShareRequirement[] | null;
  dayInterestTiers?: DayInterestTier[] | null;
}

export interface LoanProductCreateDto {
  name: string;
  loanType: LoanType;
  description?: string;
  minAmount: number;
  maxAmount: number;
  termMonths: number;
  termUnit: TermUnit;
  interestCalcMode?: InterestCalcMode;
  penaltyRate: number;
  reqDailyLoanSaving: number;
  reqRegistrationFee: number;
  loanSavingMultiplier: number;
  bookFee: number;
  interestRate: number;
  insuranceRate: number;
  serviceRate: number;
  shareRequirements?: ShareRequirement[];
  dayInterestTiers?: DayInterestTier[];
}

export interface LoanProductUpdateDto extends Partial<LoanProductCreateDto> {
  isActive?: boolean;
}

export interface Loan {
  id: string;
  memberId: string;
  loanProductId: string;
  loanType: LoanType;
  loanProduct?: LoanProduct;
  principal: number;
  interestRate: number;
  insuranceRate: number;
  serviceRate: number;
  bookFee: number;
  totalFees: number;
  termMonths: number;
  disbursedDate?: Date;
  dueDate?: Date;
  status: LoanStatus;
  outstanding: number;
  
  reviewNote?: string;
  reviewedBy?: string;
  reviewedAt?: Date;

  approvalNote?: string;
  approvedBy?: string;
  approvedAt?: Date;
  
  createdAt: Date;
}

export interface LoanApplyDto {
  memberId: string;
  loanProductId: string;
  principal: number;
  termMonths?: number;
}

export interface EligibilityResult {
  eligible: boolean;
  reasons: string[];
  loanSavingBalance: number;
  maxLoanableAmount: number;
  totalFees: number;
  breakdown: {
    bookFee: number;
    interestRate: number;
    insuranceRate?: number;
    serviceRate?: number;
  };
}

export interface RepaymentScheduleItem {
  installmentNo: number;
  dueDate: Date;
  principalDue: number;
  interestDue: number;
  totalDue: number;
  balance: number;
}

export interface Repayment {
  id: string;
  loanId: string;
  amount: number;
  principalPortion: number;
  interestPortion: number;
  receiptNo?: string;
  paidDate: Date;
  recordedBy: string;
  createdAt: Date;
}

export interface ProductEligibilityAnalysis {
  product: LoanProduct;
  isEligible: boolean;
  maxApprovedAmount: number;
  reasons: string[];
  recommendations: string[];
}

export interface MemberEligibilitySummary {
  memberId: string;
  financialProfile: {
    loanSavingBalance: number;
    sharesOwned: number;
    registrationFeePaid: number;
  };
  products: ProductEligibilityAnalysis[];
}
