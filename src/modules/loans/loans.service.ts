import { NotFoundError, BusinessRuleError } from '../../shared/errors/app-error';
import { eventBus } from '../../shared/events/event-bus';
import * as loansRepo from './loans.repository';
import * as savingsRepo from '../savings/savings.repository';
import { prisma } from '../../config/prisma';
import { getPrimaryBranchId } from '../../shared/utils/branch.utils';
import { generateReceiptNo } from '../../shared/utils/receipt.utils';
import { createLoanAlert } from '../notifications/alerts.service';
import type { LoanProductCreateDto, LoanProductUpdateDto, DayInterestTier, ShareRequirement } from '@coop/types';

// ── Product CRUD ──────────────────────────────────────────────────────────────

export async function listProducts() {
  return loansRepo.listProducts();
}

export async function getProduct(id: string) {
  const product = await loansRepo.findProductById(id);
  if (!product) throw new NotFoundError('Loan Product');
  return product;
}

export async function createProduct(data: LoanProductCreateDto) {
  return loansRepo.createProduct({
    name: String(data.name),
    loanType: data.loanType,
    isActive: true,
    description: data.description,
    minAmount: Number(data.minAmount ?? 0),
    maxAmount: Number(data.maxAmount ?? 0),
    termMonths: parseInt(String(data.termMonths ?? 12), 10),
    termUnit: data.termUnit ?? 'month',
    interestCalcMode: data.interestCalcMode ?? 'prorated',
    penaltyRate: Number(data.penaltyRate ?? 0),
    reqDailyLoanSaving: Number(data.reqDailyLoanSaving ?? 0),
    reqRegistrationFee: Number(data.reqRegistrationFee ?? 0),
    loanSavingMultiplier: Number(data.loanSavingMultiplier ?? 0),
    bookFee: Number(data.bookFee ?? 0),
    interestRate: Number(data.interestRate ?? 0),
    insuranceRate: Number(data.insuranceRate ?? 0),
    serviceRate: Number(data.serviceRate ?? 0),
    shareRequirements: (data.shareRequirements ?? []) as any,
    dayInterestTiers: (data.dayInterestTiers ?? []) as any,
  });
}

export async function updateProduct(id: string, data: LoanProductUpdateDto) {
  await getProduct(id); // ensure exists
  return loansRepo.updateProduct(id, {
    ...(data.name !== undefined       && { name: String(data.name) }),
    ...(data.loanType !== undefined   && { loanType: data.loanType }),
    ...(data.description !== undefined && { description: String(data.description) }),
    ...(data.isActive !== undefined   && { isActive: Boolean(data.isActive) }),
    ...(data.minAmount !== undefined  && { minAmount: Number(data.minAmount) }),
    ...(data.maxAmount !== undefined  && { maxAmount: Number(data.maxAmount) }),
    ...(data.termMonths !== undefined && { termMonths: parseInt(String(data.termMonths), 10) }),
    ...(data.reqDailyLoanSaving !== undefined   && { reqDailyLoanSaving: Number(data.reqDailyLoanSaving) }),
    ...(data.reqRegistrationFee !== undefined   && { reqRegistrationFee: Number(data.reqRegistrationFee) }),
    ...(data.loanSavingMultiplier !== undefined && { loanSavingMultiplier: Number(data.loanSavingMultiplier) }),
    ...(data.bookFee !== undefined    && { bookFee: Number(data.bookFee) }),
    ...(data.interestRate !== undefined  && { interestRate: Number(data.interestRate) }),
    ...(data.insuranceRate !== undefined && { insuranceRate: Number(data.insuranceRate) }),
    ...(data.serviceRate !== undefined   && { serviceRate: Number(data.serviceRate) }),
    ...(data.termMonths !== undefined && { termMonths: parseInt(String(data.termMonths), 10) }),
    ...(data.termUnit !== undefined   && { termUnit: data.termUnit }),
    ...(data.interestCalcMode !== undefined && { interestCalcMode: data.interestCalcMode }),
    ...(data.penaltyRate !== undefined && { penaltyRate: Number(data.penaltyRate) }),
    ...(data.shareRequirements !== undefined && { shareRequirements: data.shareRequirements as any }),
    ...(data.dayInterestTiers !== undefined   && { dayInterestTiers: data.dayInterestTiers as any }),
  });
}

// ── Eligibility Check ─────────────────────────────────────────────────────────

async function checkEligibility(product: any, memberId: string, principal: number) {
  const reasons: string[] = [];

  // 0. Active Loan Check — Member cannot have more than 1 active/pending loan at a time
  const existingActiveLoan = await prisma.loan.findFirst({
    where: {
      memberId,
      status: { in: ['pending', 'pending_approval', 'approved', 'active', 'defaulted'] },
    },
    include: { loanProduct: { select: { name: true } } },
  });

  if (existingActiveLoan) {
    const statusText = existingActiveLoan.status.replace('_', ' ').toUpperCase();
    reasons.push(
      `Member currently has an uncleared loan (${existingActiveLoan.loanProduct.name} - ${statusText}). Policy permits only 1 active loan per member. Please clear the existing loan first.`
    );
  }

  // 1. Loan saving balance
  const loanSavingBalance = await loansRepo.getMemberLoanSavingBalance(memberId);

  // 2. Loan saving percentage ceiling
  let maxLoanableAmount = Number(product.maxAmount);
  if (Number(product.loanSavingMultiplier) > 0) {
    const percentage = Number(product.loanSavingMultiplier);
    const ceiling = loanSavingBalance * (100 / percentage);
    maxLoanableAmount = Math.min(maxLoanableAmount, ceiling);
    if (principal > ceiling) {
      reasons.push(
        `Loan amount (${principal} ETB) requires ${percentage}% in savings. Your loan-saving balance (${loanSavingBalance.toFixed(2)} ETB) only supports up to ${ceiling.toFixed(2)} ETB.`
      );
    }
  }

  // 3. Amount range
  if (principal < Number(product.minAmount)) {
    reasons.push(`Minimum loan amount is ${product.minAmount} ETB.`);
  }
  if (principal > Number(product.maxAmount)) {
    reasons.push(`Maximum loan amount is ${product.maxAmount} ETB.`);
  }

  // 4. Registration fee
  if (Number(product.reqRegistrationFee) > 0) {
    const regFee = await loansRepo.getMemberRegistrationFee(memberId);
    if (regFee < Number(product.reqRegistrationFee)) {
      reasons.push(
        `Member must have paid at least ${product.reqRegistrationFee} ETB registration fee (paid: ${regFee} ETB).`
      );
    }
  }

  // 5. Share requirement (regular / special)
  if (product.loanType !== 'emergency') {
    const tiers: ShareRequirement[] = Array.isArray(product.shareRequirements) ? product.shareRequirements : [];
    if (tiers.length > 0) {
      const applicableTier = tiers.find(
        (t: ShareRequirement) => principal >= t.fromAmount && principal <= t.toAmount
      );
      if (applicableTier) {
        const shareBalance = await loansRepo.getMemberShareBalance(memberId);
        if (shareBalance < applicableTier.minShares) {
          reasons.push(
            `For a loan of ${principal} ETB you need at least ${applicableTier.minShares} shares (you own ${shareBalance}).`
          );
        }
      }
    }
  }

  // 6. Compute fees / interest
  const bookFee = Number(product.bookFee);
  let interestRate = Number(product.interestRate);
  const insuranceRate = Number(product.insuranceRate);
  const serviceRate = Number(product.serviceRate);

  // For emergency loans, override interestRate from day tiers if tiers exist
  // (caller picks the actual rate at disbursal based on repayment window)
  const tiers: DayInterestTier[] = Array.isArray(product.dayInterestTiers) ? product.dayInterestTiers : [];

  const totalFees = bookFee; // base; interest is periodic, not upfront

  return {
    eligible: reasons.length === 0,
    reasons,
    loanSavingBalance,
    maxLoanableAmount,
    totalFees,
    breakdown: { bookFee, interestRate, insuranceRate, serviceRate },
    dayInterestTiers: tiers,
  };
}
export async function getMemberEligibilitySummary(memberId: string) {
  const [loanSavingBalance, sharesOwned, registrationFeePaid, existingActiveLoan, products] = await Promise.all([
    loansRepo.getMemberLoanSavingBalance(memberId),
    loansRepo.getMemberShareBalance(memberId),
    loansRepo.getMemberRegistrationFee(memberId),
    prisma.loan.findFirst({
      where: {
        memberId,
        status: { in: ['pending', 'pending_approval', 'approved', 'active', 'defaulted'] },
      },
      include: { loanProduct: { select: { name: true } } },
    }),
    loansRepo.listProducts()
  ]);

  const activeProducts = products.filter(p => p.isActive);
  const analyses: any[] = [];

  for (const product of activeProducts) {
    let maxApprovedAmount = Number(product.maxAmount);
    let isEligible = true;
    const reasons: string[] = [];
    const recommendations: string[] = [];

    // 0. Active Loan Check
    if (existingActiveLoan) {
      isEligible = false;
      const statusText = existingActiveLoan.status.replace('_', ' ').toUpperCase();
      reasons.push(`Member already has an uncleared loan (${existingActiveLoan.loanProduct.name} - ${statusText}).`);
      recommendations.push(`Fully clear/repay the existing loan before applying for a new loan.`);
    }

    // 1. Registration Fee
    if (Number(product.reqRegistrationFee) > 0 && registrationFeePaid < Number(product.reqRegistrationFee)) {
      isEligible = false;
      const missingReg = Number(product.reqRegistrationFee) - registrationFeePaid;
      reasons.push(`Missing registration fee (paid: ${registrationFeePaid.toFixed(2)} ETB, required: ${product.reqRegistrationFee} ETB)`);
      recommendations.push(`Pay ${missingReg.toFixed(2)} ETB towards registration fee to qualify.`);
    }

    // 2. Loan Saving Percentage
    if (Number(product.loanSavingMultiplier) > 0) {
      const percentage = Number(product.loanSavingMultiplier);
      const ceiling = loanSavingBalance * (100 / percentage);
      if (ceiling < maxApprovedAmount) {
        maxApprovedAmount = ceiling;
        if (ceiling === 0) {
          isEligible = false;
          reasons.push(`No loan savings deposited yet. (Requires ${percentage}%)`);
          recommendations.push(`Deposit loan savings to start qualifying for this loan.`);
        } else {
          recommendations.push(`Currently limited to ${ceiling.toFixed(2)} ETB because you must maintain ${percentage}% in savings. Deposit more loan savings to increase this limit.`);
        }
      }
    }

    // 3. Share Requirements (for regular/special)
    if (product.loanType !== 'emergency') {
      const tiers: any[] = Array.isArray(product.shareRequirements) ? product.shareRequirements : [];
      if (tiers.length > 0) {
        let maxAllowedByShares = 0;
        let nextTierMinShares: number | null = null;
        let nextTierAmount = 0;

        // Sort by fromAmount
        const sortedTiers = [...tiers].sort((a, b) => Number(a.fromAmount) - Number(b.fromAmount));

        for (const tier of sortedTiers) {
          if (sharesOwned >= Number(tier.minShares)) {
            maxAllowedByShares = Number(tier.toAmount);
          } else {
            if (nextTierMinShares === null) {
              nextTierMinShares = Number(tier.minShares);
              nextTierAmount = Number(tier.toAmount);
            }
          }
        }

        if (maxAllowedByShares === 0 && nextTierMinShares !== null) {
          isEligible = false;
          maxApprovedAmount = 0;
          reasons.push(`You own ${sharesOwned} shares, but at least ${nextTierMinShares} shares are required for this loan type.`);
          recommendations.push(`Purchase ${nextTierMinShares - sharesOwned} more shares to borrow up to ${Number(nextTierAmount).toFixed(2)} ETB.`);
        } else if (maxAllowedByShares > 0 && maxAllowedByShares < maxApprovedAmount) {
          maxApprovedAmount = maxAllowedByShares;
          if (nextTierMinShares !== null) {
             recommendations.push(`Share requirement caps this loan at ${Number(maxAllowedByShares).toFixed(2)} ETB. Purchase ${nextTierMinShares - sharesOwned} more shares to borrow up to ${Math.min(Number(nextTierAmount), Number(product.maxAmount)).toFixed(2)} ETB.`);
          }
        }
      }
    }

    // 4. Absolute Minimum check
    if (maxApprovedAmount < Number(product.minAmount) && isEligible && maxApprovedAmount > 0) {
       isEligible = false;
       const cachedMax = maxApprovedAmount;
       maxApprovedAmount = 0;
       reasons.push(`Calculated maximum (${cachedMax.toFixed(2)} ETB) is less than the minimum required loan amount of ${product.minAmount} ETB.`);
       recommendations.push(`Increase your savings/shares to qualify for the minimum amount of ${product.minAmount} ETB.`);
    }

    analyses.push({
      product,
      isEligible,
      maxApprovedAmount,
      reasons,
      recommendations,
    });
  }

  return {
    memberId,
    financialProfile: {
      loanSavingBalance,
      sharesOwned,
      registrationFeePaid,
    },
    products: analyses,
  };
}

// ── Loan Apply ────────────────────────────────────────────────────────────────

export async function apply(input: any) {
  const product = await loansRepo.findProductById(input.loanProductId);
  if (!product) throw new NotFoundError('Loan Product');
  if (!product.isActive) throw new BusinessRuleError('This loan product is currently inactive.');

  const member = await prisma.member.findUnique({ where: { id: input.memberId }, select: { branchId: true } });
  if (!member) throw new NotFoundError('Member');

  const eligibility = await checkEligibility(product, input.memberId, Number(input.principal));
  if (!eligibility.eligible) {
    throw new BusinessRuleError('Eligibility check failed:\n• ' + eligibility.reasons.join('\n• '));
  }

  const principal = Number(input.principal);
  const term = parseInt(String(input.termMonths || product.termMonths), 10);
  const termUnit: string = product.termUnit ?? 'month';
  const interestRate = Number(product.interestRate);
  const bookFee = Number(product.bookFee);
  const insuranceRate = Number(product.insuranceRate);
  const serviceRate = Number(product.serviceRate);

  // Calculate total interest and fees based on calculation mode (flat_term vs prorated APR)
  const interestCalcMode: string = (product as any).interestCalcMode ?? 'prorated';

  let totalInterest = 0;
  let totalInsurance = 0;
  let totalService = 0;

  if (interestCalcMode === 'flat_term') {
    // Flat percentage over the entire loan term regardless of duration
    totalInterest = principal * (interestRate / 100);
    totalInsurance = principal * (insuranceRate / 100);
    totalService = principal * (serviceRate / 100);
  } else {
    // Annualized (APR) prorated per period
    const periodsPerYear: Record<string, number> = { day: 365, week: 52, month: 12, annual: 1 };
    const ppy = periodsPerYear[termUnit] ?? 12;
    const periodRate = interestRate / 100 / ppy;  // interest rate per period
    const insurancePeriodRate = insuranceRate / 100 / ppy;
    const servicePeriodRate = serviceRate / 100 / ppy;

    totalInterest = (principal * periodRate) * term;
    totalInsurance = (principal * insurancePeriodRate) * term;
    totalService = (principal * servicePeriodRate) * term;
  }

  const totalFees = bookFee + totalInsurance + totalService;
  const initialOutstanding = principal + totalInterest + totalFees;

  const loan = await loansRepo.createLoan({
    memberId: input.memberId,
    loanProductId: input.loanProductId,
    loanType: product.loanType,
    principal,
    interestRate,
    insuranceRate,
    serviceRate,
    bookFee,
    totalFees,
    termMonths: term,
    outstanding: initialOutstanding,
    branchId: member.branchId,
  });

  // Save Collateral, Amortization policy & Application Documents
  await prisma.loan.update({
    where: { id: loan.id },
    data: {
      collateralValue: input.collateralValue ? Number(input.collateralValue) : 0,
      collateralDescription: input.collateralDescription || null,
      amortizationType: (product as any).amortizationType || 'declining_balance',
      applicationDocuments: input.applicationDocuments || null,
    },
  });

  // Bind Guarantors if provided (Member or External Guarantor Profile)
  if (Array.isArray(input.guarantors) && input.guarantors.length > 0) {
    for (const g of input.guarantors) {
      if (Number(g.guaranteedAmount) > 0) {
        let memberId = g.guarantorMemberId || null;
        let profileId = g.guarantorProfileId || null;

        // If neither memberId nor profileId passed, but name provided, auto-create a standalone profile
        if (!memberId && !profileId && g.fullName) {
          const profile = await prisma.guarantorProfile.create({
            data: {
              fullName: g.fullName,
              phone: g.phone || null,
              email: g.email || null,
              nationalId: g.nationalId || null,
              employer: g.employer || null,
              relation: g.relation || null,
              notes: g.notes || null,
              attachments: g.attachments || null,
            },
          });
          profileId = profile.id;
        }

        // Find primary savings account for member guarantor to lock lien
        let guarantorAccountId: string | null = null;
        if (memberId) {
          const guarantorAccount = await prisma.savingsAccount.findFirst({
            where: { memberId },
          });
          guarantorAccountId = guarantorAccount?.id || null;
        }

        await prisma.guarantor.create({
          data: {
            loanId: loan.id,
            guarantorMemberId: memberId,
            guarantorProfileId: profileId,
            guarantorAccountId,
            guaranteedAmount: Number(g.guaranteedAmount),
            relation: g.relation || null,
            employer: g.employer || null,
            phone: g.phone || null,
            nationalId: g.nationalId || null,
            notes: g.notes || null,
            attachments: g.attachments || null,
            status: 'active',
          },
        });
      }
    }
  }

  // Trigger notification alert
  createLoanAlert({
    event: 'loan.submitted',
    loanId: loan.id,
    memberId: loan.memberId,
    memberName: loan.member.fullName,
    memberCode: loan.member.memberCode,
    principal: Number(loan.principal),
    productName: product.name,
  }).catch(console.error);

  return loan;
}

// ── Check eligibility without applying ────────────────────────────────────────

export async function checkLoanEligibility(loanProductId: string, memberId: string, principal: number) {
  const product = await loansRepo.findProductById(loanProductId);
  if (!product) throw new NotFoundError('Loan Product');
  return checkEligibility(product, memberId, principal);
}

// ── Loan Approval Workflow ─────────────────────────────────────────────────────────────

export async function reviewLoan(loanId: string, action: 'forward' | 'reject', note: string, reviewerId: string) {
  const loan = await loansRepo.findLoanById(loanId);
  if (!loan) throw new NotFoundError('Loan');
  if (loan.status !== 'pending') throw new BusinessRuleError('Only pending loans can be reviewed');

  const status = action === 'forward' ? 'pending_approval' : 'rejected';

  const reviewer = await prisma.user.findUnique({ where: { id: reviewerId }, select: { fullName: true } });

  const updated = await loansRepo.updateLoan(loanId, {
    status,
    reviewNote: note,
    reviewedBy: reviewerId,
    reviewedAt: new Date(),
  });

  // Trigger notification alert
  createLoanAlert({
    event: action === 'forward' ? 'loan.reviewed' : 'loan.rejected',
    loanId: loan.id,
    memberId: loan.memberId,
    memberName: loan.member.fullName,
    memberCode: loan.member.memberCode,
    principal: Number(loan.principal),
    productName: loan.loanProduct.name,
    actorId: reviewerId,
    actorName: reviewer?.fullName || 'Reviewer',
  }).catch(console.error);

  return updated;
}

export async function approveLoan(loanId: string, action: 'approve' | 'reject', note: string, approverId: string) {
  const loan = await loansRepo.findLoanById(loanId);
  if (!loan) throw new NotFoundError('Loan');
  if (loan.status !== 'pending_approval') throw new BusinessRuleError('Only loans pending final approval can be approved or rejected');

  // When approved: move to 'approved' status (pending disbursement), NOT active
  // When rejected: move to 'rejected'
  const status = action === 'approve' ? 'approved' : 'rejected';

  const approver = await prisma.user.findUnique({ where: { id: approverId }, select: { fullName: true } });

  const updated = await loansRepo.updateLoan(loanId, {
    status,
    approvalNote: note,
    approvedBy: approverId,
    approvedAt: new Date(),
  });

  // Trigger notification alert
  createLoanAlert({
    event: action === 'approve' ? 'loan.approved' : 'loan.rejected',
    loanId: loan.id,
    memberId: loan.memberId,
    memberName: loan.member.fullName,
    memberCode: loan.member.memberCode,
    principal: Number(loan.principal),
    productName: loan.loanProduct.name,
    actorId: approverId,
    actorName: approver?.fullName || 'Approver',
  }).catch(console.error);

  return updated;
}

// ── List Approved Loans (Pending Disbursement) ────────────────────────────────

export async function listApprovedLoans() {
  return prisma.loan.findMany({
    where: { status: 'approved' },
    include: {
      member: { select: { id: true, fullName: true, memberCode: true, phone: true } },
      loanProduct: {
        select: {
          id: true, name: true, loanType: true,
          interestRate: true, insuranceRate: true, serviceRate: true,
          bookFee: true, termMonths: true, termUnit: true,
          interestCalcMode: true, penaltyRate: true,
        },
      },
      branch: { select: { name: true } },
      approver: { select: { fullName: true } },
    },
    orderBy: { approvedAt: 'asc' },
  });
}

// ── Disburse Loan ─────────────────────────────────────────────────────────────

export async function disburseLoan(
  loanId: string,
  opts: {
    disbursementDate: Date;
    deductFeesUpfront: boolean;
    disbursedById: string;
  }
) {
  const loan = await loansRepo.findLoanById(loanId);
  if (!loan) throw new NotFoundError('Loan');
  if (loan.status !== 'approved') throw new BusinessRuleError('Only approved loans can be disbursed');

  const principal = Number(loan.principal);
  const interestRate = Number(loan.interestRate);
  const insuranceRate = Number(loan.insuranceRate);
  const serviceRate = Number(loan.serviceRate);
  const bookFee = Number(loan.bookFee);
  const termMonths = loan.termMonths;
  const interestCalcMode = (loan.loanProduct as any).interestCalcMode || 'prorated';
  const termUnit = loan.loanProduct.termUnit || 'month';

  // Calculate total interest over term
  let totalInterest = 0;
  if (interestCalcMode === 'flat_term') {
    totalInterest = principal * (interestRate / 100);
  } else {
    const periodsPerYear: Record<string, number> = { day: 365, week: 52, month: 12, annual: 1 };
    const ppy = periodsPerYear[termUnit] ?? 12;
    const periodRate = interestRate / 100 / ppy;
    totalInterest = principal * periodRate * termMonths;
  }

  let totalInsurance = 0;
  let totalService = 0;
  if (interestCalcMode === 'flat_term') {
    totalInsurance = principal * (insuranceRate / 100);
    totalService = principal * (serviceRate / 100);
  } else {
    const periodsPerYear: Record<string, number> = { day: 365, week: 52, month: 12, annual: 1 };
    const ppy = periodsPerYear[termUnit] ?? 12;
    totalInsurance = principal * (insuranceRate / 100 / ppy) * termMonths;
    totalService = principal * (serviceRate / 100 / ppy) * termMonths;
  }

  const upfrontDeduction = opts.deductFeesUpfront
    ? parseFloat((totalInterest + totalInsurance + totalService + bookFee).toFixed(2))
    : 0;

  const netDisbursed = parseFloat((principal - upfrontDeduction).toFixed(2));
  
  // When fees are pre-deducted upfront, the outstanding balance to be repaid over the schedule is pure principal.
  const initialOutstanding = opts.deductFeesUpfront
    ? principal
    : parseFloat((principal + totalInterest + totalInsurance + totalService + bookFee).toFixed(2));

  // Calculate due date based on disbursementDate + term
  const dueDate = new Date(opts.disbursementDate);
  if (termUnit === 'day') dueDate.setDate(dueDate.getDate() + termMonths);
  else if (termUnit === 'week') dueDate.setDate(dueDate.getDate() + termMonths * 7);
  else if (termUnit === 'annual') dueDate.setFullYear(dueDate.getFullYear() + termMonths);
  else dueDate.setMonth(dueDate.getMonth() + termMonths);

  const updated = await loansRepo.updateLoan(loanId, {
    status: 'active',
    disbursedDate: opts.disbursementDate,
    scheduleStartDate: opts.disbursementDate,
    dueDate,
    netDisbursed,
    upfrontDeduction,
    deductFeesUpfront: opts.deductFeesUpfront,
    outstanding: initialOutstanding,
  });

  // If fees were pre-deducted upfront, record it as a fee-collection repayment transaction
  if (opts.deductFeesUpfront && upfrontDeduction > 0) {
    const userBranchId = await getPrimaryBranchId(opts.disbursedById);
    const receiptNo = generateReceiptNo();
    await loansRepo.createRepayment({
      loanId: loan.id,
      amount: upfrontDeduction,
      principalPortion: 0,
      interestPortion: upfrontDeduction,
      receiptNo,
      paidDate: opts.disbursementDate,
      focalAgentId: loan.member.focalAgentId,
      branchId: userBranchId,
      recordedBy: opts.disbursedById,
    });
  }

  // Lock Guarantor Savings Liens on Disbursement
  const guarantors = await prisma.guarantor.findMany({ where: { loanId: loan.id, status: 'active' } });
  for (const g of guarantors) {
    if (g.guarantorAccountId) {
      await prisma.savingsAccount.update({
        where: { id: g.guarantorAccountId },
        data: { lienBalance: { increment: g.guaranteedAmount } },
      });
      await prisma.guarantor.update({
        where: { id: g.id },
        data: { lienAmount: g.guaranteedAmount },
      });
    }
  }

  // Emit loan activated event
  eventBus.emit({ type: 'loan.approved', payload: { loanId: loan.id, memberId: loan.memberId } });

  // Notify admins about disbursement
  createLoanAlert({
    event: 'loan.approved',
    loanId: loan.id,
    memberId: loan.memberId,
    memberName: loan.member.fullName,
    memberCode: loan.member.memberCode,
    principal,
    productName: loan.loanProduct.name,
  }).catch(console.error);

  return { ...updated, netDisbursed, upfrontDeduction };
}

export async function resubmitLoan(loanId: string, note: string) {
  const loan = await loansRepo.findLoanById(loanId);
  if (!loan) throw new NotFoundError('Loan');
  if (loan.status !== 'rejected') throw new BusinessRuleError('Only rejected loans can be resubmitted');

  // We append the resubmission note to the review note for history, or just keep it simple.
  const newNote = `[Resubmitted]: ${note}`;

  return loansRepo.updateLoan(loanId, {
    status: 'pending',
    reviewNote: newNote, // Override or append. Let's just override to signify the new state's context
    reviewedBy: null,
    reviewedAt: null,
    approvalNote: null,
    approvedBy: null,
    approvedAt: null,
  });
}

// ── Repayment ─────────────────────────────────────────────────────────────────

export async function repay(input: any, recordedBy: string) {
  const loan = await loansRepo.findLoanById(input.loanId);
  if (!loan) throw new NotFoundError('Loan');
  if (loan.status !== 'active' && loan.status !== 'defaulted') {
    throw new BusinessRuleError('Can only repay active or defaulted loans');
  }

  if (input.receiptNo) {
    const existing = await loansRepo.findRepaymentByReceipt(input.receiptNo);
    if (existing) throw new BusinessRuleError(`Receipt ${input.receiptNo} already recorded`);
  }

  const amount = Number(input.amount);
  const outstanding = Number(loan.outstanding);
  const principal = Number(loan.principal);
  const rate = Number(loan.interestRate);
  const insuranceRate = Number((loan as any).insuranceRate ?? 0);
  const serviceRate = Number((loan as any).serviceRate ?? 0);

  const monthlyInterest = parseFloat(((principal * rate) / 100 / 12).toFixed(2));
  const monthlyInsurance = parseFloat(((principal * insuranceRate) / 100 / 12).toFixed(2));
  const monthlyService = parseFloat(((principal * serviceRate) / 100 / 12).toFixed(2));
  const totalMonthlyFees = parseFloat((monthlyInterest + monthlyInsurance + monthlyService).toFixed(2));

  const isUpfrontDeducted = Boolean((loan as any).deductFeesUpfront || Number((loan as any).upfrontDeduction ?? 0) > 0);

  // ── Waterfall Repayment Distributor Execution Engine ────────────────────────
  // Strict execution order:
  // 1. Late Penalties & Legal Fees
  // 2. Accrued Interest & Administrative Fees
  // 3. Principal Balance
  let remainingCash = amount;

  // 1. Penalty Portion
  const penaltyRate = Number((loan as any).loanProduct?.penaltyRate ?? 0);
  const daysOverdue = Math.max(0, (loan as any).daysPastDue ?? 0);
  let penaltyDue = 0;
  if (daysOverdue > 0 && penaltyRate > 0) {
    penaltyDue = parseFloat(((outstanding * (penaltyRate / 100) * daysOverdue) / 365).toFixed(2));
  }
  const penaltyPortion = Math.min(penaltyDue, remainingCash);
  remainingCash = parseFloat((remainingCash - penaltyPortion).toFixed(2));

  // 2. Accrued Interest & Fee Portion
  const interestPortionCalculated = isUpfrontDeducted ? 0 : Math.min(totalMonthlyFees, remainingCash);
  const interestPortion = interestPortionCalculated;
  remainingCash = parseFloat((remainingCash - interestPortion).toFixed(2));

  // 3. Principal Portion
  const principalPortion = Math.min(Number(loan.outstanding), remainingCash);
  const feePortion = parseFloat((remainingCash - principalPortion).toFixed(2));

  const userBranchId = await getPrimaryBranchId(recordedBy);
  const focalAgentId = loan.member.focalAgentId;
  const receiptNo = input.receiptNo || generateReceiptNo();

  const repayment = await prisma.repayment.create({
    data: {
      loanId: input.loanId,
      amount,
      principalPortion,
      interestPortion,
      penaltyPortion,
      feePortion,
      receiptNo,
      paidDate: input.paidDate ? new Date(input.paidDate) : new Date(),
      focalAgentId,
      branchId: userBranchId,
      recordedBy,
    },
  });

  const newOutstanding = Math.max(0, outstanding - amount);
  const newStatus = newOutstanding <= 0 ? 'closed' : loan.status;

  await loansRepo.updateLoan(input.loanId, {
    outstanding: newOutstanding,
    status: newStatus,
  });

  // ── Proportional Guarantor Lien Release ────────────────────────────────────
  if (principal > 0) {
    const repaymentRatio = amount / principal;
    const activeGuarantors = await prisma.guarantor.findMany({ where: { loanId: loan.id, status: 'active' } });
    for (const g of activeGuarantors) {
      if (g.guarantorAccountId && Number(g.lienAmount) > 0) {
        const releaseAmount = Math.min(Number(g.lienAmount), parseFloat((Number(g.guaranteedAmount) * repaymentRatio).toFixed(2)));
        await prisma.savingsAccount.update({
          where: { id: g.guarantorAccountId },
          data: { lienBalance: { decrement: releaseAmount } },
        });
        const newLien = Math.max(0, Number(g.lienAmount) - releaseAmount);
        const gStatus = newStatus === 'closed' || newLien <= 0 ? 'released' : 'active';
        await prisma.guarantor.update({
          where: { id: g.id },
          data: { lienAmount: newLien, status: gStatus },
        });
      }
    }
  }

  eventBus.emit({ type: 'loan.repaid', payload: { loanId: loan.id, memberId: loan.memberId, amount, receiptNo: repayment.receiptNo, newOutstanding, loanProductName: (loan as any).loanProduct?.name } });
  return repayment;
}

export const recordRepayment = repay;

// ── List / Get ────────────────────────────────────────────────────────────────

export async function listLoans(filters?: { 
  status?: string; 
  memberId?: string; 
  loanType?: string; 
  page?: number; 
  limit?: number; 
  branchIds?: string[] | null;
}) {
  const result = await loansRepo.listLoans(filters);
  const data = await Promise.all(result.data.map(async (loan: any) => {
    const isUpfrontDeducted = Boolean(loan.deductFeesUpfront || Number(loan.upfrontDeduction ?? 0) > 0);
    let effectiveOutstanding = Number(loan.outstanding);
    
    if (isUpfrontDeducted && effectiveOutstanding > Number(loan.principal)) {
      effectiveOutstanding = Number(loan.principal);
      // Auto-correct DB row to pure principal
      await prisma.loan.update({ where: { id: loan.id }, data: { outstanding: effectiveOutstanding } }).catch(() => {});
    }

    return {
      ...loan,
      outstanding: effectiveOutstanding,
    };
  }));

  return { ...result, data };
}

export async function getLoan(id: string) {
  const loan = await loansRepo.findLoanById(id);
  if (!loan) throw new NotFoundError('Loan');
  
  const { totalPenalty, outstandingWithPenalty } = await buildScheduleWithPenalties(loan);
  
  return {
    ...loan,
    totalPenalty,
    outstandingWithPenalty,
  };
}

export async function getRepaymentSchedule(loanId: string) {
  const loan = await loansRepo.findLoanById(loanId);
  if (!loan) throw new NotFoundError('Loan');

  const { schedule } = await buildScheduleWithPenalties(loan);
  return schedule;
}

export async function buildScheduleWithPenalties(loan: any) {
  // For pending/not-yet-disbursed loans, use today as projected start date
  const startDate: Date = loan.disbursedDate ? new Date(loan.disbursedDate) : new Date();
  const isProjected = !loan.disbursedDate;

  const principal = Number(loan.principal);
  const rate = Number(loan.interestRate);
  const insuranceRate = Number(loan.insuranceRate ?? 0);
  const serviceRate = Number(loan.serviceRate ?? 0);
  const bookFee = Number(loan.bookFee ?? 0);
  const termCount = loan.termMonths; // stores # of periods regardless of unit

  // Load term unit and interest calculation mode from loanProduct  
  const product = loan.loanProduct || await loansRepo.findProductById(loan.loanProductId);
  const termUnit: string = product?.termUnit ?? 'month';
  const interestCalcMode: string = product?.interestCalcMode ?? 'prorated';
  const penaltyRate = Number(product?.penaltyRate ?? 0);

  // Check if fees were pre-deducted upfront at fund release
  const isUpfrontDeducted = Boolean((loan as any).deductFeesUpfront || Number((loan as any).upfrontDeduction ?? 0) > 0);

  // Calculate rate based on calculation mode: prorated (annualized APR) vs flat_term (flat percentage applied over the full term)
  let periodRate = 0;
  let insurancePeriodRate = 0;
  let servicePeriodRate = 0;

  if (isUpfrontDeducted) {
    // Fees were pre-deducted at disbursement; schedule is based on pure principal
    periodRate = 0;
    insurancePeriodRate = 0;
    servicePeriodRate = 0;
  } else if (interestCalcMode === 'flat_term') {
    // Total fee percentage is flat over the entire loan term, split equally among installments
    periodRate = (rate / 100) / termCount;
    insurancePeriodRate = (insuranceRate / 100) / termCount;
    servicePeriodRate = (serviceRate / 100) / termCount;
  } else {
    // Annualized (APR) prorated per period
    const periodsPerYear: Record<string, number> = { day: 365, week: 52, month: 12, annual: 1 };
    const ppy = periodsPerYear[termUnit] ?? 12;
    periodRate = rate / 100 / ppy;
    insurancePeriodRate = insuranceRate / 100 / ppy;
    servicePeriodRate = serviceRate / 100 / ppy;
  }

  const effectiveBookFee = isUpfrontDeducted ? 0 : bookFee;
  const perPeriodPrincipal = parseFloat((principal / termCount).toFixed(2));
  const perPeriodInterest  = parseFloat((principal * periodRate).toFixed(2));
  const perPeriodInsurance = parseFloat((principal * insurancePeriodRate).toFixed(2));
  const perPeriodService   = parseFloat((principal * servicePeriodRate).toFixed(2));

  // Full starting balance
  let balance = principal
    + (perPeriodInterest * termCount)
    + (perPeriodInsurance * termCount)
    + (perPeriodService * termCount)
    + effectiveBookFee;

  // Helper: advance date by one period
  const addPeriod = (date: Date, unit: string, n: number): Date => {
    const d = new Date(date);
    if (unit === 'day')    d.setDate(d.getDate() + n);
    else if (unit === 'week')   d.setDate(d.getDate() + n * 7);
    else if (unit === 'month')  d.setMonth(d.getMonth() + n);
    else if (unit === 'annual') d.setFullYear(d.getFullYear() + n);
    return d;
  };

  const schedule = [];
  let totalPenalty = 0;
  // Only count repayments that actually reduce the principal/scheduled balance.
  // Upfront fee deduction receipts have principalPortion=0 and interestPortion=fees;
  // they must NOT be allocated to installments (fees are already "paid" at disbursement).
  let repaidSoFar = (loan.repayments || [])
    .filter((r: any) => Number(r.principalPortion ?? 0) > 0 || (Number(r.amount) > 0 && Number(r.interestPortion ?? 0) < Number(r.amount)))
    .reduce((acc: number, r: any) => acc + Number(r.amount), 0);
  const today = new Date();

  for (let i = 1; i <= termCount; i++) {
    const dueDate = addPeriod(startDate, termUnit, i);
    const totalPeriod = perPeriodPrincipal + perPeriodInterest + perPeriodInsurance + perPeriodService;
    balance -= totalPeriod;
    
    // Calculate penalty on the current un-repaid base if overdue
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfDueDate = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
    const isOverdue = !isProjected && startOfDueDate < startOfToday;

    let penalty = 0;
    let perPeriodPenalty = 0;

    if (isOverdue) {
      const diffTime = startOfToday.getTime() - startOfDueDate.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
      let periodsOverdue = 0;
      if (termUnit === 'day') periodsOverdue = diffDays;
      else if (termUnit === 'week') periodsOverdue = Math.floor(diffDays / 7);
      else if (termUnit === 'month') periodsOverdue = Math.floor(diffDays / 30);
      else if (termUnit === 'annual') periodsOverdue = Math.floor(diffDays / 365);

      if (periodsOverdue > 0) {
        penalty = totalPeriod * (penaltyRate / 100) * periodsOverdue;
        perPeriodPenalty = totalPeriod * (penaltyRate / 100);
      }
    }

    const roundedPenalty = parseFloat(penalty.toFixed(2));
    const roundedPerPeriodPenalty = parseFloat(perPeriodPenalty.toFixed(2));

    // Allocate repaidSoFar to this installment:
    // Required to clear this installment = totalPeriod base + 1-period penalty (if overdue)
    const penaltyRequired = isOverdue ? roundedPerPeriodPenalty : 0;
    const baseRequired = totalPeriod;

    let status = 'unpaid';
    let paidAmount = 0;
    let unpaidAmount = totalPeriod;
    let paidPenalty = 0;

    if (repaidSoFar > 0) {
      // 1. Pay off penalty first for this installment
      paidPenalty = Math.min(repaidSoFar, penaltyRequired);
      repaidSoFar -= paidPenalty;

      // 2. Pay off base installment with remaining repaidSoFar
      if (repaidSoFar >= baseRequired) {
        status = 'paid';
        paidAmount = totalPeriod;
        unpaidAmount = 0;
        repaidSoFar -= baseRequired;
      } else if (repaidSoFar > 0) {
        status = 'partial';
        paidAmount = repaidSoFar;
        unpaidAmount = parseFloat((totalPeriod - repaidSoFar).toFixed(2));
        repaidSoFar = 0;
      } else {
        // Only penalty was covered
        status = 'unpaid';
        paidAmount = 0;
        unpaidAmount = totalPeriod;
      }
    }

    if (status !== 'paid') {
      totalPenalty += roundedPenalty;
    }

    schedule.push({
      installment: i,
      dueDate,
      principal: perPeriodPrincipal,
      interest: perPeriodInterest,
      insurance: perPeriodInsurance,
      service: perPeriodService,
      total: parseFloat(totalPeriod.toFixed(2)),
      balance: parseFloat(Math.max(0, balance).toFixed(2)),
      termUnit,
      isProjected,
      status,
      paidAmount: parseFloat(paidAmount.toFixed(2)),
      paidPenalty: parseFloat(paidPenalty.toFixed(2)),
      unpaidAmount: parseFloat(unpaidAmount.toFixed(2)),
      penalty: roundedPenalty,           // cumulative penalty since due date
      perPeriodPenalty: roundedPerPeriodPenalty  // penalty for exactly 1 period (day/week/month)
    });
  }
  
  const outstandingWithPenalty = parseFloat((Number(loan.outstanding) + totalPenalty).toFixed(2));

  return { schedule, totalPenalty, outstandingWithPenalty };
}

// ── Control Room ──────────────────────────────────────────────────────────────

export async function getLoanControlRoomStats() {
  const allLoans = await prisma.loan.findMany({
    include: {
      member: { select: { fullName: true, memberCode: true, phone: true } },
      loanProduct: { select: { name: true, loanType: true, interestRate: true, termMonths: true, termUnit: true, interestCalcMode: true, penaltyRate: true } },
      repayments: { select: { amount: true, principalPortion: true, interestPortion: true, paidDate: true } },
      branch: { select: { name: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  const recentRepayments = await prisma.repayment.findMany({
    take: 10,
    orderBy: { paidDate: 'desc' },
    include: {
      loan: {
        include: {
          member: { select: { fullName: true, memberCode: true } },
          loanProduct: { select: { name: true } },
        }
      }
    }
  });

  let totalDisbursed = 0;
  let totalExpectedProfit = 0;
  let totalCollectedProfit = 0;
  let totalOutstanding = 0;
  let totalOverduePenalties = 0;
  let totalPrincipalOutstanding = 0;
  let totalFeesOutstanding = 0;
  let totalPerPeriodInstallment = 0;

  const loansDetail = await Promise.all(allLoans.map(async (loan) => {
    const principal = Number(loan.principal);
    const interestRate = Number(loan.interestRate || loan.loanProduct.interestRate);
    const insuranceRate = Number((loan as any).insuranceRate ?? 0);
    const serviceRate = Number((loan as any).serviceRate ?? 0);
    const bookFee = Number((loan as any).bookFee ?? 0);
    const termMonths = loan.termMonths || loan.loanProduct.termMonths;
    const termUnit = loan.loanProduct.termUnit || 'month';
    const interestCalcMode = (loan.loanProduct as any).interestCalcMode || 'prorated';
    const isApprovedOrActive = ['active', 'completed', 'defaulted'].includes(loan.status);

    let perPeriodInterest = 0;
    let totalInsuranceFee = 0;
    let totalServiceFee = 0;

    if (interestCalcMode === 'flat_term') {
      const periodRate = (interestRate / 100) / termMonths;
      perPeriodInterest = principal * periodRate;
      totalInsuranceFee = principal * (insuranceRate / 100);
      totalServiceFee = principal * (serviceRate / 100);
    } else {
      const periodsPerYear: Record<string, number> = { day: 365, week: 52, month: 12, annual: 1 };
      const ppy = periodsPerYear[termUnit] ?? 12;
      const periodRate = interestRate / 100 / ppy;
      perPeriodInterest = principal * periodRate;
      totalInsuranceFee = principal * (insuranceRate / 100 / ppy) * termMonths;
      totalServiceFee = principal * (serviceRate / 100 / ppy) * termMonths;
    }

    const totalBaseFees = bookFee + totalInsuranceFee + totalServiceFee;
    let expectedProfit = (perPeriodInterest * termMonths) + totalBaseFees;
    
    // Sum of actual repayments
    let collectedProfit = 0;
    let collectedPrincipal = 0;
    for (const r of loan.repayments) {
      collectedProfit += Number(r.interestPortion);
      collectedPrincipal += Number(r.principalPortion);
    }
    const totalPaid = collectedProfit + collectedPrincipal;
    
    // Use official schedule generator to accurately calculate active penalties
    const { totalPenalty, outstandingWithPenalty } = await buildScheduleWithPenalties(loan);
    const outstanding = outstandingWithPenalty;

    expectedProfit += totalPenalty;
    
    // Per-period installment: outstanding divided by number of term periods
    const perPeriodInstallment = termMonths > 0 ? parseFloat((outstanding / termMonths).toFixed(2)) : 0;

    if (isApprovedOrActive) {
      totalDisbursed += principal;
      totalExpectedProfit += expectedProfit;
      totalCollectedProfit += collectedProfit;
      totalOutstanding += outstanding;
      totalOverduePenalties += totalPenalty;
      totalPrincipalOutstanding += Math.max(0, principal - collectedPrincipal);
      totalFeesOutstanding += totalBaseFees;
      totalPerPeriodInstallment += perPeriodInstallment;
    }

    const monthlyExpected = (principal / termMonths) + perPeriodInterest;

    return {
      id: loan.id,
      memberCode: loan.member.memberCode,
      memberName: loan.member.fullName,
      phone: loan.member.phone,
      productName: loan.loanProduct.name,
      branchName: loan.branch?.name || 'N/A',
      status: loan.status,
      disbursedDate: loan.disbursedDate,
      dueDate: loan.dueDate,
      principal,
      interestRate,
      insuranceRate,
      serviceRate,
      bookFee,
      totalBaseFees,
      penaltyRate: Number(loan.loanProduct.penaltyRate || 0),
      totalPenalty,
      termMonths,
      termUnit: loan.loanProduct.termUnit || 'month',
      expectedProfit,
      totalExpected: principal + expectedProfit,
      totalPaid,
      collectedPrincipal,
      collectedProfit,
      outstanding,
      monthlyExpected,
      perPeriodInstallment,
      repaymentCount: loan.repayments.length,
    };
  }));

  return {
    kpis: {
      totalDisbursed,
      totalExpectedProfit,
      totalCollectedProfit,
      totalOutstanding,
      totalOverduePenalties,
      totalPrincipalOutstanding,
      totalFeesOutstanding,
      totalPerPeriodInstallment,
    },
    loans: loansDetail,
    recentRepayments: recentRepayments.map(r => ({
      id: r.id,
      receiptNo: r.receiptNo,
      amount: Number(r.amount),
      principalPortion: Number(r.principalPortion),
      interestPortion: Number(r.interestPortion),
      paidDate: r.paidDate,
      memberName: r.loan.member.fullName,
      memberCode: r.loan.member.memberCode,
      productName: r.loan.loanProduct.name,
      loanId: r.loanId,
    }))
  };
}

export async function resetAllTransactionsAndLoans() {
  await prisma.repayment.deleteMany({});
  await prisma.loan.deleteMany({});
  await prisma.savingsTxn.deleteMany({});
  await prisma.shareTxn.deleteMany({});
  await prisma.dailyCollectionEntry.deleteMany({});
  await prisma.dailyCollection.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.auditLog.deleteMany({});
  try {
    if ((prisma as any).dividendPayout) await (prisma as any).dividendPayout.deleteMany({});
    if ((prisma as any).dividendRun) await (prisma as any).dividendRun.deleteMany({});
  } catch (e) {}
  await prisma.savingsAccount.updateMany({ data: { balance: 0 } });
  await prisma.shareAccount.updateMany({ data: { balance: 0 } });
  return { message: 'All transactions, loans, and balances have been reset to 0.' };
}

// ── Financial Report helpers ───────────────────────────────────────────────────

export async function listAllRepayments() {
  return prisma.repayment.findMany({
    orderBy: { paidDate: 'desc' },
    include: {
      loan: {
        select: {
          id: true,
          member: { select: { fullName: true, memberCode: true } },
          loanProduct: { select: { name: true } },
        },
      },
    },
  });
}

// ── Add Guarantor to Existing Loan ────────────────────────────────────────────

export async function addGuarantorToLoan(
  loanId: string,
  data: {
    guarantorMemberId?: string;
    guarantorProfileId?: string;
    guaranteedAmount: number;
    lienAmount?: number;
    relation?: string;
    notes?: string;
  }
) {
  // Verify loan exists and is in a valid state for adding guarantors
  const loan = await loansRepo.findLoanById(loanId);
  if (!loan) throw new NotFoundError('Loan');

  const allowedStatuses = ['pending', 'pending_approval', 'approved', 'active'];
  if (!allowedStatuses.includes(loan.status)) {
    throw new BusinessRuleError(
      `Cannot add guarantor to a loan with status '${loan.status}'. Only pending, pending_approval, approved, or active loans allow guarantor changes.`
    );
  }

  if (!data.guarantorMemberId && !data.guarantorProfileId) {
    throw new BusinessRuleError('Either guarantorMemberId or guarantorProfileId must be provided.');
  }

  // Prevent guarantor from co-signing their own loan
  if (data.guarantorMemberId && data.guarantorMemberId === loan.memberId) {
    throw new BusinessRuleError('A member cannot be a guarantor on their own loan.');
  }

  const guarantor = await prisma.guarantor.create({
    data: {
      loanId,
      guarantorMemberId: data.guarantorMemberId || null,
      guarantorProfileId: data.guarantorProfileId || null,
      guaranteedAmount: data.guaranteedAmount,
      lienAmount: data.lienAmount ?? 0,
      relation: data.relation || null,
      notes: data.notes || null,
      status: 'active',
    },
    include: {
      guarantorMember: { select: { id: true, fullName: true, memberCode: true, phone: true } },
      guarantorProfile: { select: { id: true, fullName: true, phone: true } },
    },
  });

  return guarantor;
}
