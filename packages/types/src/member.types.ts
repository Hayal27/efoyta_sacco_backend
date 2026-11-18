export type MemberStatus = 'active' | 'suspended' | 'exited';
export type MaritalStatus = 'single' | 'married' | 'divorced' | 'widowed';

export type DocType = 'biometric_photo' | 'signature_graphic' | 'national_id' | 'proof_of_address';
export type DocVerificationStatus = 'pending' | 'verified' | 'rejected';

export interface MemberDocument {
  id: string;
  memberId: string;
  docType: DocType;
  fileName: string;
  fileKey: string;
  mimeType: string;
  fileSize: number;
  checksum?: string | null;
  isEncrypted: boolean;
  verificationStatus: DocVerificationStatus;
  rejectionReason?: string | null;
  uploadedAt: Date;
  verifiedAt?: Date | null;
}

export interface KycUploadDto {
  memberId: string;
  docType: DocType;
  fileName: string;
  fileKey: string;
  mimeType: string;
  fileSize: number;
  checksum?: string;
  isEncrypted?: boolean;
}

export interface KycVerifyDto {
  documentId: string;
  status: 'verified' | 'rejected';
  rejectionReason?: string;
}

export interface GuarantorExposureDto {
  id: string;
  loanId: string;
  borrowerName: string;
  guaranteedAmount: number;
  lockedSavingsAccount?: string | null;
  status: 'active' | 'released' | 'invoked';
  createdAt: Date;
}

export interface Member360PortfolioDto {
  member: Member;
  documents: MemberDocument[];
  savings: {
    totalBalance: number;
    accounts: Array<{
      id: string;
      productName: string;
      accountNumber?: string | null;
      type: string;
      balance: number;
    }>;
  };
  loans: {
    totalOutstanding: number;
    activeLoans: Array<{
      id: string;
      productName: string;
      principal: number;
      outstanding: number;
      status: string;
      dueDate?: Date | null;
    }>;
  };
  shares: {
    balance: number;
    sharePrice: number;
    totalEquityValue: number;
    minThreshold: number;
    isCompliant: boolean;
  };
  guarantorLocks: {
    totalGuaranteedAmount: number;
    activeCommitments: GuarantorExposureDto[];
  };
}

export interface FocalAgent {
  id: string;
  userId: string;
  fullName: string;
  phone: string;
  region?: string;
  createdAt: Date;
}

export interface Member {
  id: string;
  memberCode: string;
  fullName: string;
  phone: string;
  email?: string;
  nationalId?: string;
  address?: string;
  gender?: 'm' | 'f' | null;
  dateOfBirth?: Date | string | null;
  qualification?: string | null;
  maritalStatus?: MaritalStatus | null;
  familyMembers?: number | null;
  birthPlace?: string | null;
  focalAgentId?: string;
  focalAgent?: FocalAgent;
  registrationFee: number;
  joinDate: Date;
  status: MemberStatus;
  createdBy: string;
  createdAt: Date;
  documents?: MemberDocument[];
}

export interface MemberListItem {
  id: string;
  memberCode: string;
  fullName: string;
  phone: string;
  status: MemberStatus;
  focalAgent?: { id: string; fullName: string };
  joinDate: Date;
}

