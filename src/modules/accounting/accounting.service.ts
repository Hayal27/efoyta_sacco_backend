import { BusinessRuleError, NotFoundError } from '../../shared/errors/app-error';
import { accountingRepo } from './accounting.repository';
import { prisma } from '../../config/prisma';

// ── Standard SACCO Chart of Accounts Seed Data ─────────────────────────────────

const STANDARD_COA_SEED = [
  // 1000 - ASSETS
  { code: '1000', name: 'ASSETS', type: 'asset', isHeader: true, description: 'Header for all Asset Accounts' },
  { code: '1010', name: 'Cash on Hand', type: 'asset', parentCode: '1000', isHeader: false, description: 'Vault & Cashier Cash' },
  { code: '1011', name: 'Cash in Vault', type: 'asset', parentCode: '1000', isHeader: false, description: 'Branch Vault Cash Reserves' },
  { code: '1012', name: 'Cash in Till', type: 'asset', parentCode: '1000', isHeader: false, description: 'Teller Drawer Operating Cash' },
  { code: '1020', name: 'Bank Account - CBE', type: 'asset', parentCode: '1000', isHeader: false, description: 'Commercial Bank of Ethiopia' },
  { code: '1030', name: 'Member Loans Receivable', type: 'asset', parentCode: '1000', isHeader: false, description: 'Outstanding Loan Portfolio' },
  { code: '1040', name: 'Allowance for Loan Loss Reserves', type: 'asset', parentCode: '1000', isHeader: false, description: 'Contra-Asset Loan Loss Reserve' },
  { code: '1050', name: 'Fixed Assets - Office Equipment & Furniture', type: 'asset', parentCode: '1000', isHeader: false, description: 'Computers, Furniture, Equipment' },
  { code: '1060', name: 'Accumulated Depreciation - Fixed Assets', type: 'asset', parentCode: '1000', isHeader: false, description: 'Contra-Asset Depreciation' },

  // 2000 - LIABILITIES
  { code: '2000', name: 'LIABILITIES', type: 'liability', isHeader: true, description: 'Header for all Liability Accounts' },
  { code: '2010', name: 'Member Regular Savings Deposits', type: 'liability', parentCode: '2000', isHeader: false, description: 'Regular Savings Liabilities' },
  { code: '2020', name: 'Member Special / Target Savings Deposits', type: 'liability', parentCode: '2000', isHeader: false, description: 'Target & Term Deposits' },
  { code: '2030', name: 'Accrued Interest Payable on Savings', type: 'liability', parentCode: '2000', isHeader: false, description: 'Interest Accrued Payable' },

  // 3000 - EQUITY
  { code: '3000', name: 'EQUITY & RESERVES', type: 'equity', isHeader: true, description: 'Header for Equity & Reserves' },
  { code: '3010', name: 'Member Share Capital', type: 'equity', parentCode: '3000', isHeader: false, description: 'Paid-Up Share Capital' },
  { code: '3020', name: 'Statutory Reserve Fund', type: 'equity', parentCode: '3000', isHeader: false, description: 'Cooperative Statutory Reserve' },
  { code: '3030', name: 'Retained Earnings', type: 'equity', parentCode: '3000', isHeader: false, description: 'Accumulated Retained Earnings' },

  // 4000 - REVENUE
  { code: '4000', name: 'REVENUE & INCOME', type: 'revenue', isHeader: true, description: 'Header for Revenue Accounts' },
  { code: '4010', name: 'Interest Income on Loans', type: 'revenue', parentCode: '4000', isHeader: false, description: 'Interest Earned from Member Loans' },
  { code: '4020', name: 'Loan Processing & Book Fees Income', type: 'revenue', parentCode: '4000', isHeader: false, description: 'Fee Income' },
  { code: '4030', name: 'Share Transfer & Registration Fees', type: 'revenue', parentCode: '4000', isHeader: false, description: 'Registration Fees' },
  { code: '4040', name: 'Cash Over/Short Income', type: 'revenue', parentCode: '4000', isHeader: false, description: 'Till Session Cash Overage Income' },

  // 5000 - EXPENSES
  { code: '5000', name: 'OPERATING & FINANCIAL EXPENSES', type: 'expense', isHeader: true, description: 'Header for Expense Accounts' },
  { code: '5010', name: 'Interest Expense on Member Savings', type: 'expense', parentCode: '5000', isHeader: false, description: 'Interest Paid to Members' },
  { code: '5020', name: 'Loan Loss Provision Expense', type: 'expense', parentCode: '5000', isHeader: false, description: 'Risk Loss Provision Expense' },
  { code: '5030', name: 'Depreciation Expense - Fixed Assets', type: 'expense', parentCode: '5000', isHeader: false, description: 'Asset Depreciation Expense' },
  { code: '5040', name: 'Administrative & Staff Salaries Expense', type: 'expense', parentCode: '5000', isHeader: false, description: 'Operating Expense' },
  { code: '5050', name: 'Cash Over/Short Expense', type: 'expense', parentCode: '5000', isHeader: false, description: 'Till Session Cash Shortage Expense' },
];

export async function getChartOfAccounts() {
  let accounts = await accountingRepo.findGLAccounts();

  // If no accounts exist yet, auto-seed standard SACCO Chart of Accounts & DB Menu permissions
  if (accounts.length === 0) {
    await seedStandardChartOfAccounts();
    accounts = await accountingRepo.findGLAccounts();
  }

  // Ensure DB Menu entries exist for RBAC permissions
  ensureAccountingDbMenus().catch((e) => console.error('Menu seed check error:', e.message));

  return accounts;
}

async function ensureAccountingDbMenus() {
  try {
    const existing = await prisma.menu.findUnique({ where: { slug: 'accounting' } });
    if (!existing) {
      const parent = await prisma.menu.create({
        data: {
          slug: 'accounting',
          label: 'Accounting & GL',
          path: '/accounting',
          icon: 'Calculator',
          color: '#00838f',
          order: 60,
        },
      });

      const children = [
        { slug: 'accounting_coa', label: 'Chart of Accounts (CoA)', path: '/accounting', icon: 'BookOpen', order: 1 },
        { slug: 'accounting_journal', label: 'Atomic Journal Processor', path: '/accounting', icon: 'Scale', order: 2 },
        { slug: 'accounting_statements', label: 'Financial Statements', path: '/accounting', icon: 'FileSpreadsheet', order: 3 },
        { slug: 'accounting_assets', label: 'Asset & Risk Reserves', path: '/accounting', icon: 'ShieldAlert', order: 4 },
      ];

      const menuIds = [parent.id];
      for (const c of children) {
        const child = await prisma.menu.create({
          data: {
            slug: c.slug,
            label: c.label,
            path: c.path,
            icon: c.icon,
            color: '#00838f',
            parentId: parent.id,
            order: c.order,
          },
        });
        menuIds.push(child.id);
      }

      // Assign to all roles
      const roles = await prisma.role.findMany();
      for (const role of roles) {
        for (const menuId of menuIds) {
          await prisma.roleMenu.create({
            data: { roleId: role.id, menuId },
          }).catch(() => {});
        }
      }
    }
  } catch (e) {
    // Ignore duplicate errors
  }
}


export async function seedStandardChartOfAccounts() {
  const codeToIdMap = new Map<string, string>();

  // 1. Create headers first
  for (const item of STANDARD_COA_SEED.filter((s) => s.isHeader)) {
    const acc = await accountingRepo.createGLAccount({
      code: item.code,
      name: item.name,
      type: item.type as any,
      isHeader: true,
      description: item.description,
    });
    codeToIdMap.set(item.code, acc.id);
  }

  // 2. Create child accounts
  for (const item of STANDARD_COA_SEED.filter((s) => !s.isHeader)) {
    const parentId = item.parentCode ? codeToIdMap.get(item.parentCode) : undefined;
    const acc = await accountingRepo.createGLAccount({
      code: item.code,
      name: item.name,
      type: item.type as any,
      isHeader: false,
      description: item.description,
      parent: parentId ? { connect: { id: parentId } } : undefined,
    });
    codeToIdMap.set(item.code, acc.id);
  }
}

// ── 2. Atomic Journal Entry Processor ──────────────────────────────────────────

export async function createJournalEntry(
  input: {
    entryDate?: string;
    description: string;
    reference?: string;
    postedById?: string;
    lines: Array<{
      glAccountId: string;
      debit: number;
      credit: number;
      memo?: string;
    }>;
  }
) {
  if (!input.lines || input.lines.length < 2) {
    throw new BusinessRuleError('A double-entry journal transaction requires at least 2 lines (1 Debit, 1 Credit).');
  }

  // Calculate total debits and credits
  let totalDebits = 0;
  let totalCredits = 0;

  input.lines.forEach((line) => {
    totalDebits += Number(line.debit || 0);
    totalCredits += Number(line.credit || 0);
  });

  // Atomic Double-Entry Balance Rule Check: Σ Debits must EQUAL Σ Credits
  const roundedDebits = Math.round(totalDebits * 100) / 100;
  const roundedCredits = Math.round(totalCredits * 100) / 100;

  if (roundedDebits !== roundedCredits) {
    throw new BusinessRuleError(
      `Unbalanced Journal Entry Rejected! Total Debits (ETB ${roundedDebits.toLocaleString()}) must equal Total Credits (ETB ${roundedCredits.toLocaleString()}). Difference: ETB ${Math.abs(roundedDebits - roundedCredits).toLocaleString()}`
    );
  }

  const entryNumber = `JE-${Date.now().toString().slice(-8)}`;
  const entryDate = input.entryDate ? new Date(input.entryDate) : new Date();

  return accountingRepo.createJournalEntry({
    entryNumber,
    entryDate,
    description: input.description,
    reference: input.reference,
    postedById: input.postedById,
    lines: input.lines,
  });
}

export async function listJournalEntries(params?: { page?: number; limit?: number }) {
  return accountingRepo.listJournalEntries(params);
}

// ── 3. Asset & Liability Management System ──────────────────────────────────

export async function listFixedAssets() {
  return accountingRepo.listFixedAssets();
}

export async function createFixedAsset(input: {
  code: string;
  name: string;
  purchaseDate: string;
  purchaseCost: number;
  salvageValue?: number;
  usefulLifeYears?: number;
  depreciationMethod?: 'straight_line' | 'declining_balance';
}) {
  return accountingRepo.createFixedAsset({
    code: input.code,
    name: input.name,
    purchaseDate: new Date(input.purchaseDate),
    purchaseCost: input.purchaseCost,
    salvageValue: input.salvageValue || 0,
    usefulLifeYears: input.usefulLifeYears || 5,
    depreciationMethod: input.depreciationMethod || 'straight_line',
  });
}

// Compute fixed asset depreciation schedules & post journal entry
export async function runAssetDepreciationBatch() {
  const assets = await accountingRepo.listFixedAssets();
  let totalDepreciationPosted = 0;
  const postedEntries = [];

  // Find Depreciation Expense GL account and Accumulated Depreciation GL account
  const expAccount = await accountingRepo.findGLAccountByCode('5030'); // Depreciation Expense
  const accumAccount = await accountingRepo.findGLAccountByCode('1060'); // Accumulated Depreciation

  for (const asset of assets) {
    const cost = Number(asset.purchaseCost);
    const salvage = Number(asset.salvageValue);
    const lifeYears = asset.usefulLifeYears || 5;
    const currentAccum = Number(asset.accumulatedDepreciation);

    const maxDepreciable = cost - salvage;
    if (currentAccum >= maxDepreciable) continue;

    // Monthly depreciation straight-line amount
    const annualDepreciation = maxDepreciable / lifeYears;
    const monthlyDepreciation = Math.round((annualDepreciation / 12) * 100) / 100;

    const newAccum = Math.min(maxDepreciable, currentAccum + monthlyDepreciation);
    const actualCharge = newAccum - currentAccum;

    if (actualCharge > 0) {
      await accountingRepo.updateFixedAssetDepreciation(asset.id, newAccum);
      totalDepreciationPosted += actualCharge;

      // Auto-post GL Journal Entry if GL accounts are mapped
      if (expAccount && accumAccount) {
        const je = await createJournalEntry({
          description: `Monthly Fixed Asset Depreciation - ${asset.name} (${asset.code})`,
          reference: `ASSET-DEP-${asset.code}`,
          lines: [
            { glAccountId: expAccount.id, debit: actualCharge, credit: 0, memo: `Depreciation Expense - ${asset.name}` },
            { glAccountId: accumAccount.id, debit: 0, credit: actualCharge, memo: `Accumulated Depreciation - ${asset.name}` },
          ],
        });
        postedEntries.push(je);
      }
    }
  }

  return {
    processedAssets: assets.length,
    totalDepreciationPosted,
    journalEntriesCreated: postedEntries.length,
  };
}

// Compute Loan Portfolio Loss Risk Reserves based on Risk Classification
export async function calculateLoanRiskReserves() {
  // Query all active/pending loans and categorize by asset quality
  const loans = await prisma.loan.findMany({
    where: { status: 'active' },
    select: { principal: true, outstanding: true, assetQuality: true, daysPastDue: true },
  });

  let passAmount = 0;          // Pass (0-30 days past due) -> 1% reserve
  let specialMention = 0;      // Special Mention (31-60 days) -> 5% reserve
  let substandard = 0;         // Substandard (61-90 days) -> 20% reserve
  let doubtful = 0;            // Doubtful (91-180 days) -> 50% reserve
  let lossAmount = 0;          // Loss (>180 days) -> 100% reserve

  loans.forEach((loan) => {
    const balance = Number(loan.outstanding > 0 ? loan.outstanding : loan.principal);
    const quality = (loan.assetQuality || 'pass').toLowerCase();

    if (quality === 'pass') passAmount += balance;
    else if (quality === 'special_mention') specialMention += balance;
    else if (quality === 'substandard') substandard += balance;
    else if (quality === 'doubtful') doubtful += balance;
    else if (quality === 'loss') lossAmount += balance;
    else passAmount += balance;
  });

  const requiredReserve =
    passAmount * 0.01 +
    specialMention * 0.05 +
    substandard * 0.20 +
    doubtful * 0.50 +
    lossAmount * 1.00;

  return {
    asOfDate: new Date().toISOString(),
    passAmount,
    specialMention,
    substandard,
    doubtful,
    lossAmount,
    requiredReserve: Math.round(requiredReserve * 100) / 100,
    totalPortfolio: passAmount + specialMention + substandard + doubtful + lossAmount,
  };
}

// ── 4. Core Financial Statement Compiler ──────────────────────────────────────

export async function generateTrialBalance() {
  const accounts = await getChartOfAccounts();

  let totalDebits = 0;
  let totalCredits = 0;

  const trialBalanceRows = accounts.map((acc: any) => {
    const bal = Number(acc.balance);
    let debit = 0;
    let credit = 0;

    if (acc.type === 'asset' || acc.type === 'expense') {
      if (bal >= 0) debit = bal;
      else credit = Math.abs(bal);
    } else {
      if (bal >= 0) credit = bal;
      else debit = Math.abs(bal);
    }

    totalDebits += debit;
    totalCredits += credit;

    return {
      id: acc.id,
      code: acc.code,
      name: acc.name,
      type: acc.type,
      isHeader: acc.isHeader,
      debit,
      credit,
    };
  });

  return {
    asOfDate: new Date().toISOString(),
    accounts: trialBalanceRows,
    totalDebits: Math.round(totalDebits * 100) / 100,
    totalCredits: Math.round(totalCredits * 100) / 100,
    isBalanced: Math.abs(totalDebits - totalCredits) < 0.01,
  };
}

export async function generateBalanceSheet() {
  const accounts = await getChartOfAccounts();

  const assetAccounts = accounts.filter((a: any) => a.type === 'asset' && !a.isHeader);
  const liabilityAccounts = accounts.filter((a: any) => a.type === 'liability' && !a.isHeader);
  const equityAccounts = accounts.filter((a: any) => a.type === 'equity' && !a.isHeader);

  // Compute Income Statement Net Profit/Loss to add to Retained Earnings
  const pnl = await generateProfitAndLoss();
  const netIncome = pnl.netProfitOrLoss;

  const totalAssets = assetAccounts.reduce((sum: number, a: any) => sum + Number(a.balance), 0);
  const totalLiabilities = liabilityAccounts.reduce((sum: number, a: any) => sum + Number(a.balance), 0);
  const totalEquityWithoutIncome = equityAccounts.reduce((sum: number, a: any) => sum + Number(a.balance), 0);
  const totalEquity = totalEquityWithoutIncome + netIncome;

  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

  return {
    asOfDate: new Date().toISOString(),
    assets: {
      accounts: assetAccounts,
      totalAssets: Math.round(totalAssets * 100) / 100,
    },
    liabilities: {
      accounts: liabilityAccounts,
      totalLiabilities: Math.round(totalLiabilities * 100) / 100,
    },
    equity: {
      accounts: equityAccounts,
      netIncomeForPeriod: netIncome,
      totalEquity: Math.round(totalEquity * 100) / 100,
    },
    totalLiabilitiesAndEquity: Math.round(totalLiabilitiesAndEquity * 100) / 100,
    isAccountingEquationBalanced: Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01,
  };
}

export async function generateProfitAndLoss() {
  const accounts = await getChartOfAccounts();

  const revenueAccounts = accounts.filter((a: any) => a.type === 'revenue' && !a.isHeader);
  const expenseAccounts = accounts.filter((a: any) => a.type === 'expense' && !a.isHeader);

  const totalRevenue = revenueAccounts.reduce((sum: number, a: any) => sum + Number(a.balance), 0);
  const totalExpenses = expenseAccounts.reduce((sum: number, a: any) => sum + Number(a.balance), 0);

  const netProfitOrLoss = totalRevenue - totalExpenses;

  return {
    asOfDate: new Date().toISOString(),
    revenues: {
      accounts: revenueAccounts,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
    },
    expenses: {
      accounts: expenseAccounts,
      totalExpenses: Math.round(totalExpenses * 100) / 100,
    },
    netProfitOrLoss: Math.round(netProfitOrLoss * 100) / 100,
    isProfitable: netProfitOrLoss >= 0,
  };
}
