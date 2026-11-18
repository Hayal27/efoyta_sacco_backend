import { NotFoundError, BusinessRuleError } from '../../shared/errors/app-error';
import { eventBus } from '../../shared/events/event-bus';
import * as savingsRepo from './savings.repository';
import { prisma } from '../../config/prisma';
import { getPrimaryBranchId } from '../../shared/utils/branch.utils';
import { generateReceiptNo } from '../../shared/utils/receipt.utils';
import { recordTillTransaction } from '../cash-management/cash-management.service';

export async function openAccount(input: { memberId: string; productId: string; targetAmount?: number; receiptNo?: string }, recordedBy: string) {
  const existing = await savingsRepo.findAccountByMemberAndProduct(input.memberId, input.productId);
  if (existing) throw new BusinessRuleError('Member already has an account for this product');

  const product = await prisma.savingsProduct.findUnique({ where: { id: input.productId } });
  if (!product) throw new NotFoundError('Savings Product');

  // Compute maturity date if term deposit
  let maturityDate: Date | null = null;
  if (product.isTermDeposit && product.lockPeriodMonths && product.lockPeriodMonths > 0) {
    const d = new Date();
    d.setMonth(d.getMonth() + product.lockPeriodMonths);
    maturityDate = d;
  }

  const account = await savingsRepo.createAccount(
    input.memberId, 
    input.productId, 
    input.targetAmount || Number(product.targetAmount) || undefined, 
    maturityDate
  );

  // Auto-deposit the minBalance as the account opening fee if it's > 0
  const minBalance = Number(product.minBalance);
  let initialDeposit = null;
  if (minBalance > 0) {
    const userBranchId = await getPrimaryBranchId(recordedBy);
    const focalAgentId = account.member?.focalAgentId || null;
    initialDeposit = await savingsRepo.createTxn({
      accountId: account.id,
      type: 'deposit',
      amount: minBalance,
      paymentMethod: 'cash',
      txnDate: new Date(),
      receiptNo: input.receiptNo || generateReceiptNo(),
      reasonCode: 'account_opening_fee',
      focalAgentId,
      branchId: userBranchId,
      recordedBy,
    });
  }

  return { ...account, initialDeposit };
}

export async function deposit(input: any, recordedBy: string) {
  const account = await prisma.savingsAccount.findUnique({
    where: { id: input.accountId },
    include: { member: true, product: true }
  });
  if (!account) throw new NotFoundError('Savings Account');

  if (input.receiptNo) {
    const existing = await savingsRepo.findTxnByReceipt(input.receiptNo);
    if (existing) throw new BusinessRuleError(`Receipt ${input.receiptNo} already recorded`);
  }

  const userBranchId = await getPrimaryBranchId(recordedBy);
  const focalAgentId = input.focalAgentId || account.member.focalAgentId;
  const receiptNo = input.receiptNo || generateReceiptNo();

  const txn = await savingsRepo.createTxn({
    accountId: input.accountId,
    type: 'deposit',
    amount: input.amount,
    paymentMethod: input.paymentMethod || 'cash',
    txnDate: input.txnDate ? new Date(input.txnDate) : new Date(),
    receiptNo,
    focalAgentId,
    branchId: userBranchId,
    reasonCode: input.reasonCode,
    recordedBy,
  });

  if ((input.paymentMethod || 'cash') === 'cash' && userBranchId) {
    recordTillTransaction(recordedBy, userBranchId, Number(input.amount), 'in').catch((e) =>
      console.warn('Till record inflow error:', e.message),
    );
  }

  const newBalance = await savingsRepo.getAccountBalance(input.accountId);

  eventBus.emit({
    type: 'savings.deposited',
    payload: {
      accountId: input.accountId,
      memberId: account.memberId,
      amount: input.amount,
      receiptNo,
      balance: newBalance,
      accountNumber: account.accountNumber,
      productName: account.product?.name,
      txnId: txn.id,
    }
  });
  return txn;
}

export async function withdraw(input: any, recordedBy: string) {
  const account = await prisma.savingsAccount.findUnique({
    where: { id: input.accountId },
    include: { member: true, product: true }
  });
  if (!account) throw new NotFoundError('Savings Account');

  const balance = await savingsRepo.getAccountBalance(input.accountId);
  if (balance < input.amount) throw new BusinessRuleError('Insufficient balance');

  if (input.receiptNo) {
    const existing = await savingsRepo.findTxnByReceipt(input.receiptNo);
    if (existing) throw new BusinessRuleError(`Receipt ${input.receiptNo} already recorded`);
  }

  const userBranchId = await getPrimaryBranchId(recordedBy);
  const focalAgentId = account.member.focalAgentId;
  const receiptNo = input.receiptNo || generateReceiptNo();

  const txn = await savingsRepo.createTxn({
    accountId: input.accountId,
    type: 'withdrawal',
    amount: input.amount,
    paymentMethod: input.paymentMethod || 'cash',
    txnDate: input.txnDate ? new Date(input.txnDate) : new Date(),
    receiptNo,
    focalAgentId,
    branchId: userBranchId,
    reasonCode: input.reasonCode,
    recordedBy,
  });

  if ((input.paymentMethod || 'cash') === 'cash' && userBranchId) {
    recordTillTransaction(recordedBy, userBranchId, Number(input.amount), 'out').catch((e) =>
      console.warn('Till record outflow error:', e.message),
    );
  }

  const newBalance = await savingsRepo.getAccountBalance(input.accountId);

  eventBus.emit({
    type: 'savings.withdrawn',
    payload: {
      accountId: input.accountId,
      memberId: account.memberId,
      amount: input.amount,
      receiptNo,
      balance: newBalance,
      accountNumber: account.accountNumber,
      productName: account.product?.name,
      txnId: txn.id,
    }
  });
  return txn;
}

export async function transfer(input: any, recordedBy: string) {
  if (input.fromAccountId === input.toAccountId) throw new BusinessRuleError('Cannot transfer to the same account');

  const fromAccount = await prisma.savingsAccount.findUnique({
    where: { id: input.fromAccountId },
    include: { member: true, product: true }
  });
  if (!fromAccount) throw new NotFoundError('Source Savings Account');

  const toAccount = await prisma.savingsAccount.findUnique({
    where: { id: input.toAccountId },
    include: { member: true, product: true }
  });
  if (!toAccount) throw new NotFoundError('Destination Savings Account');

  const balance = await savingsRepo.getAccountBalance(input.fromAccountId);
  if (balance < input.amount) throw new BusinessRuleError('Insufficient balance in source account');

  const userBranchId = await getPrimaryBranchId(recordedBy);
  const baseRef = input.receiptNo || generateReceiptNo();
  const withdrawalReceiptNo = `${baseRef}-OUT`;
  const depositReceiptNo = `${baseRef}-IN`;
  const txnDate = input.txnDate ? new Date(input.txnDate) : new Date();

  const txns = await prisma.$transaction(async (tx) => {
    const withdrawal = await tx.savingsTxn.create({
      data: {
        accountId: input.fromAccountId,
        type: 'withdrawal',
        amount: input.amount,
        paymentMethod: 'transfer',
        txnDate,
        receiptNo: withdrawalReceiptNo,
        focalAgentId: fromAccount.member.focalAgentId,
        branchId: userBranchId,
        reasonCode: 'transfer_out',
        recordedBy,
      }
    });

    const deposit = await tx.savingsTxn.create({
      data: {
        accountId: input.toAccountId,
        type: 'deposit',
        amount: input.amount,
        paymentMethod: 'transfer',
        txnDate,
        receiptNo: depositReceiptNo,
        focalAgentId: toAccount.member.focalAgentId,
        branchId: userBranchId,
        reasonCode: 'transfer_in',
        recordedBy,
      }
    });
    return { withdrawal, deposit };
  });

  const fromBalance = await savingsRepo.getAccountBalance(input.fromAccountId);
  const toBalance = await savingsRepo.getAccountBalance(input.toAccountId);

  eventBus.emit({
    type: 'savings.transferred',
    payload: {
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      amount: input.amount,
      fromMemberId: fromAccount.memberId,
      toMemberId: toAccount.memberId,
      fromBalance,
      toBalance,
      fromAccountNumber: fromAccount.accountNumber,
      toAccountNumber: toAccount.accountNumber,
      withdrawalReceiptNo,
      depositReceiptNo,
    }
  });
  return txns;
}

export async function getMemberAccounts(memberId: string) {
  const accounts = await savingsRepo.findAccountsByMember(memberId);
  return Promise.all(accounts.map(async (acc) => ({
    ...acc,
    balance: await savingsRepo.getAccountBalance(acc.id),
  })));
}

export async function getAccountTransactions(accountId: string, page: number, limit: number) {
  return savingsRepo.listAccountTxns(accountId, (page - 1) * limit, limit);
}

export async function listAllAccounts(page: number, limit: number, query?: string) {
  return savingsRepo.listAllAccounts(page, limit, query);
}

export async function listProducts() {
  return savingsRepo.listProducts();
}

export async function createProduct(data: any) {
  if (!data.name || !data.type) throw new BusinessRuleError('Name and type are required');
  return prisma.savingsProduct.create({
    data: {
      name: data.name,
      type: data.type,
      interestRate: parseFloat(data.interestRate ?? '0'),
      minBalance: parseFloat(data.minBalance ?? '0'),
      noticePeriodDays: parseInt(data.noticePeriodDays ?? '0', 10),
      lockPeriodMonths: data.lockPeriodMonths ? parseInt(data.lockPeriodMonths, 10) : 0,
      earlyWithdrawalPenalty: data.earlyWithdrawalPenalty ? parseFloat(data.earlyWithdrawalPenalty) : 0,
      targetAmount: data.targetAmount ? parseFloat(data.targetAmount) : 0,
      capitalizationFrequency: data.capitalizationFrequency || 'monthly',
      isTargetSavings: Boolean(data.isTargetSavings),
      isTermDeposit: Boolean(data.isTermDeposit),
    }
  });
}

export async function updateProduct(id: string, data: any) {
  const existing = await savingsRepo.findProductById(id);
  if (!existing) throw new NotFoundError('Savings Product');
  return prisma.savingsProduct.update({
    where: { id },
    data: {
      name: data.name,
      type: data.type,
      interestRate: data.interestRate !== undefined ? parseFloat(data.interestRate) : undefined,
      minBalance: data.minBalance !== undefined ? parseFloat(data.minBalance) : undefined,
      noticePeriodDays: data.noticePeriodDays !== undefined ? parseInt(data.noticePeriodDays, 10) : undefined,
      lockPeriodMonths: data.lockPeriodMonths !== undefined ? parseInt(data.lockPeriodMonths, 10) : undefined,
      earlyWithdrawalPenalty: data.earlyWithdrawalPenalty !== undefined ? parseFloat(data.earlyWithdrawalPenalty) : undefined,
      targetAmount: data.targetAmount !== undefined ? parseFloat(data.targetAmount) : undefined,
      capitalizationFrequency: data.capitalizationFrequency || undefined,
      isTargetSavings: data.isTargetSavings !== undefined ? Boolean(data.isTargetSavings) : undefined,
      isTermDeposit: data.isTermDeposit !== undefined ? Boolean(data.isTermDeposit) : undefined,
    }
  });
}

export async function deleteProduct(id: string) {
  const existing = await savingsRepo.findProductById(id);
  if (!existing) throw new NotFoundError('Savings Product');
  return savingsRepo.deleteProduct(id);
}

export async function listAllTxns() {
  return savingsRepo.listAllTxns();
}

