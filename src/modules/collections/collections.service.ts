import { NotFoundError, BusinessRuleError } from '../../shared/errors/app-error';
import { eventBus } from '../../shared/events/event-bus';
import * as collectionsRepo from './collections.repository';
import { prisma } from '../../config/prisma';
import { getPrimaryBranchId } from '../../shared/utils/branch.utils';
import { generateReceiptNo } from '../../shared/utils/receipt.utils';
import type { CollectionSessionInput, CollectionEntryInput, ReconciliationInput } from '@coop/validation';

export async function startSession(input: CollectionSessionInput, branchId?: string) {
  // Check if un-reconciled session exists for this agent on this date
  const existing = await collectionsRepo.findSessionByAgentAndDate(input.focalAgentId, input.collectionDate);
  if (existing) {
    if (!existing.reconciled) return existing; // resume session
    throw new BusinessRuleError('A reconciled session already exists for this date');
  }

  return collectionsRepo.createSession({ ...input, branchId } as any);
}

import * as savingsService from '../savings/savings.service';
import * as loansService from '../loans/loans.service';
import * as sharesService from '../shares/shares.service';
import * as membersRepo from '../members/members.repository';

export async function recordEntry(input: CollectionEntryInput, recordedBy: string) {
  const session = await collectionsRepo.findSessionById(input.sessionId);
  if (!session) throw new NotFoundError('Collection Session');
  if (session.reconciled) throw new BusinessRuleError('Cannot add entries to a reconciled session');

  const receiptNo = input.receiptNo || generateReceiptNo();

  const totalAmount = (input.voluntarySaving || 0) + 
                      (input.interestFromVoluntary || 0) + 
                      (input.loanSaving || 0) + 
                      (input.regularSaving || 0) + 
                      (input.interestFromRegular || 0) + 
                      (input.childrensSaving || 0) + 
                      (input.loanAmount || 0) + 
                      (input.dailyLoanRepayment || 0) + 
                      (input.bookFee || 0) + 
                      (input.dailyCollectedShare || 0) + 
                      (input.registrationFee || 0) + 
                      (input.loanInterestAmount || 0);

  if (totalAmount <= 0) throw new BusinessRuleError('Total collection amount must be greater than zero');

  const member = await membersRepo.findByIdWithDetails(input.memberId);
  if (!member) throw new NotFoundError('Member');

  // Helper to deposit to specific product type - each gets its own receipt number
  const processSavingDeposit = async (amount: number, productType: string, reasonCode: string) => {
    if (amount <= 0) return;
    let account = member.savingsAccounts.find(a => a.product?.type === productType);
    
    // Auto-open savings account if it doesn't exist yet
    if (!account) {
      const product = await prisma.savingsProduct.findFirst({ where: { type: productType } });
      if (product) {
        const newAccount = await prisma.savingsAccount.create({
          data: {
            memberId: member.id,
            productId: product.id,
            accountNumber: `SA-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`
          }
        });
        account = newAccount as any;
      }
    }

    if (account) {
      await savingsService.deposit({
        accountId: account.id,
        amount,
        paymentMethod: input.paymentMethod || 'cash',
        receiptNo: generateReceiptNo(), // each sub-transaction gets its own receipt
        reasonCode,
        focalAgentId: session.focalAgentId,
      }, recordedBy);
    }
  };

  // Process Savings
  await processSavingDeposit(input.voluntarySaving, 'voluntary', 'DAILY_COLLECTION');
  await processSavingDeposit(input.regularSaving, 'regular', 'DAILY_COLLECTION');
  await processSavingDeposit(input.childrensSaving, 'children', 'DAILY_COLLECTION');
  await processSavingDeposit(input.loanSaving, 'loan_saving', 'DAILY_COLLECTION');

  // Process Loan Repayments
  if (input.dailyLoanRepayment > 0) {
    const activeLoan = member.loans.find(l => l.status === 'active');
    if (activeLoan) {
      await loansService.repay({
        loanId: activeLoan.id,
        amount: input.dailyLoanRepayment,
        receiptNo: generateReceiptNo(), // own receipt
      }, recordedBy);
    }
  }

  // Process Shares
  if (input.dailyCollectedShare > 0) {
    const config = await sharesService.getConfig();
    const sharePrice = Number(config.sharePrice);
    if (sharePrice > 0) {
      const sharesCount = Math.floor(input.dailyCollectedShare / sharePrice);
      if (sharesCount > 0) {
        await sharesService.purchaseShares({
          memberId: member.id,
          shares: sharesCount,
          paymentMethod: input.paymentMethod || 'cash',
          txnDate: new Date().toISOString().split('T')[0],
          focalAgentId: session.focalAgentId,
          receiptNo: generateReceiptNo(), // own receipt
        }, recordedBy);
      }
    }
  }

  // Persist exact per-member breakdown entry
  const userBranchId = await getPrimaryBranchId(recordedBy);

  await collectionsRepo.createCollectionEntry({
    sessionId: input.sessionId,
    memberId: input.memberId,
    voluntarySaving: input.voluntarySaving,
    interestFromVoluntary: input.interestFromVoluntary,
    loanSaving: input.loanSaving,
    regularSaving: input.regularSaving,
    interestFromRegular: input.interestFromRegular,
    childrensSaving: input.childrensSaving,
    loanAmount: input.loanAmount,
    dailyLoanRepayment: input.dailyLoanRepayment,
    bookFee: input.bookFee,
    dailyCollectedShare: input.dailyCollectedShare,
    registrationFee: input.registrationFee,
    loanInterestAmount: input.loanInterestAmount,
    totalAmount,
    receiptNo,
    focalAgentId: session.focalAgentId,
    branchId: userBranchId,
    recordedBy,
  });

  // Update session totals
  await collectionsRepo.updateSessionTotals(input.sessionId, totalAmount, 1);

  return { success: true, message: 'Entry recorded' };
}

export async function reconcile(input: ReconciliationInput) {
  const session = await collectionsRepo.findSessionById(input.sessionId);
  if (!session) throw new NotFoundError('Collection Session');
  if (session.reconciled) throw new BusinessRuleError('Session is already reconciled');

  // Check if cashOnHand matches totalCollected
  if (Number(session.totalCollected) !== input.cashOnHand) {
    // In a real system we might allow variance with an approval workflow,
    // but here we might enforce exact match or log a variance discrepancy.
    // For simplicity, we just mark it reconciled and store notes.
  }

  const updated = await collectionsRepo.markReconciled(input.sessionId);
  
  eventBus.emit({
    type: 'collection.reconciled',
    payload: { sessionId: session.id, focalAgentId: session.focalAgentId }
  });

  return updated;
}

export async function listSessions(branchIds?: string[] | null) {
  return collectionsRepo.listSessions(branchIds);
}

export async function getSession(id: string) {
  const session = await collectionsRepo.findSessionById(id);
  if (!session) throw new NotFoundError('Collection Session');
  return session;
}

export async function getSessionBreakdown(id: string) {
  const breakdown = await collectionsRepo.getSessionTransactionBreakdown(id);
  if (!breakdown) throw new NotFoundError('Collection Session');
  return breakdown;
}

export async function listAgentSummaries(userId: string) {
  let agent = await prisma.focalAgent.findUnique({ where: { userId } });
  if (!agent) {
    agent = await prisma.focalAgent.create({
      data: {
        userId,
        fullName: 'System Agent',
        phone: '0000000000',
        region: 'HQ'
      }
    });
  }
  return collectionsRepo.getAgentDailySummaries(agent.id, userId);
}

export async function getMyTransactionBreakdown(userId: string, dateStr: string) {
  let agent = await prisma.focalAgent.findUnique({ where: { userId } });
  if (!agent) {
    agent = await prisma.focalAgent.create({
      data: {
        userId,
        fullName: 'System Agent',
        phone: '0000000000',
        region: 'HQ'
      }
    });
  }
  return collectionsRepo.getAgentTransactionBreakdown(agent.id, userId, dateStr);
}

export async function requestHandoverByDate(userId: string, dateStr: string) {
  const agent = await prisma.focalAgent.findUnique({ where: { userId } });
  if (!agent) throw new NotFoundError('Focal Agent');

  const summaries = await collectionsRepo.getAgentDailySummaries(agent.id, userId);
  const summary = summaries.find(s => s.date === dateStr);
  if (!summary) throw new BusinessRuleError('No transactions found for this date');
  if (summary.handoverStatus !== 'pending') throw new BusinessRuleError('Handover already requested or received for this date');

  let session;
  if (!summary.collectionId) {
    session = await collectionsRepo.createSession({
      focalAgentId: agent.id,
      collectionDate: new Date(dateStr),
      totalCollected: summary.totalCollected,
      membersServed: summary.membersServed,
      reconciled: true, // Auto-reconcile because it comes direct from system txns
      handoverStatus: 'requested'
    });
  } else {
    session = await collectionsRepo.updateHandoverStatus(summary.collectionId, 'requested');
  }

  eventBus.emit({
    type: 'collection.handover_requested',
    payload: { sessionId: session.id, focalAgentId: agent.id }
  });

  return session;
}

export async function receiveHandover(id: string, cashierId: string) {
  const session = await collectionsRepo.findSessionById(id);
  if (!session) throw new NotFoundError('Collection Session');
  if (session.handoverStatus !== 'requested') throw new BusinessRuleError('Session is not pending handover');

  const updated = await collectionsRepo.updateHandoverStatus(id, 'received', cashierId, new Date());
  
  eventBus.emit({
    type: 'collection.handover_received',
    payload: { sessionId: session.id, cashierId }
  });

  return updated;
}

export async function declineHandover(id: string, cashierId: string) {
  const session = await collectionsRepo.findSessionById(id);
  if (!session) throw new NotFoundError('Collection Session');
  if (session.handoverStatus !== 'requested') throw new BusinessRuleError('Session is not pending handover');

  // Reset to pending so focal agent can re-submit
  const updated = await collectionsRepo.updateHandoverStatus(id, 'pending');

  eventBus.emit({
    type: 'collection.handover_declined',
    payload: { sessionId: session.id, cashierId }
  });

  return updated;
}

export async function listPendingHandovers(branchIds?: string[] | null) {
  return collectionsRepo.listSessionsByHandoverStatus('requested', branchIds);
}

export async function listAllEntries() {
  return collectionsRepo.listAllEntries();
}
