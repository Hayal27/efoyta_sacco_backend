export interface DenominationItem {
  denomination: number; // e.g. 200, 100, 50, 10, 5, 1, 0.5, 0.25
  quantity: number;
  totalAmount?: number;
}

export interface OpenTillSessionInput {
  branchId: string;
  denominations: DenominationItem[];
  notes?: string;
}

export interface CloseTillSessionInput {
  denominations: DenominationItem[];
  notes?: string;
  returnRemainingCashToVault?: boolean;
}

export interface CreateTransferInput {
  branchId: string;
  type: 'vault_to_till' | 'till_to_vault';
  amount: number;
  denominations?: DenominationItem[];
  notes?: string;
  targetTillId?: string; // If head cashier issues directly to a specific till
}

export interface BankMovementInput {
  branchId: string;
  amount: number;
  bankSlipRef?: string;
  notes?: string;
}

export interface VaultDailyCheckInput {
  branchId: string;
  checkType: 'opening' | 'closing' | 'audit';
  denominations: DenominationItem[];
  notes?: string;
}

export interface ResolveVarianceInput {
  reason: string;
  resolutionNotes?: string;
}

export interface UpdateVaultLimitInput {
  maxLimit: number;
}

export interface UpdateTillLimitInput {
  maxLimit: number;
}
