import { SharePurchaseDto, ShareTransferDto, ShareConfigUpdateDto } from '@coop/types';
import * as repo from './shares.repository';
import { prisma } from '../../config/prisma';
import { getPrimaryBranchId } from '../../shared/utils/branch.utils';
import { generateReceiptNo } from '../../shared/utils/receipt.utils';
import { BadRequestError } from '../../shared/errors/app-error';

export async function getConfig() {
  return repo.getConfig();
}

export async function updateConfig(data: ShareConfigUpdateDto) {
  return repo.updateConfig(data);
}

export async function listAccounts(params: { page?: number; limit?: number; query?: string }) {
  const page = Number(params.page) || 1;
  const limit = Number(params.limit) || 20;
  const skip = (page - 1) * limit;

  const { data, total } = await repo.listAccounts({ skip, take: limit, query: params.query });
  return {
    data,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
  };
}

export async function purchaseShares(data: SharePurchaseDto, recordedBy: string) {
  const config = await repo.getConfig();
  const totalSold = await repo.getTotalSharesSold();

  if (config.totalAvailable > 0 && totalSold + data.shares > config.totalAvailable) {
    throw new BadRequestError('Not enough authorized shares available for purchase.');
  }

  let account = await prisma.shareAccount.findUnique({
    where: { memberId: data.memberId },
    include: { member: true }
  });
  if (!account) {
    await repo.createAccount(data.memberId);
    account = await prisma.shareAccount.findUnique({
      where: { memberId: data.memberId },
      include: { member: true }
    });
  }

  const newBalance = account.balance + data.shares;
  if (config.maxPerMember > 0 && newBalance > config.maxPerMember) {
    throw new BadRequestError(`Purchase exceeds maximum allowed shares per member (${config.maxPerMember}).`);
  }

  if (data.shares < config.minPerMember && account.balance === 0) {
    throw new BadRequestError(`Minimum initial purchase is ${config.minPerMember} shares.`);
  }

  const totalAmount = data.shares * Number(config.sharePrice);

  const userBranchId = await getPrimaryBranchId(recordedBy);
  const focalAgentId = data.focalAgentId || account!.member.focalAgentId;
  const receiptNo = data.receiptNo || generateReceiptNo();

  return repo.processPurchase({
    accountId: account!.id,
    shares: data.shares,
    pricePerShare: Number(config.sharePrice),
    totalAmount,
    paymentMethod: data.paymentMethod,
    txnDate: new Date(data.txnDate),
    receiptNo,
    focalAgentId,
    branchId: userBranchId,
    recordedBy
  });
}

export async function transferShares(data: ShareTransferDto, recordedBy: string) {
  if (data.fromMemberId === data.toMemberId) {
    throw new BadRequestError('Cannot transfer shares to the same member.');
  }

  const config = await repo.getConfig();

  const fromAccount = await repo.findAccountByMember(data.fromMemberId);
  if (!fromAccount || fromAccount.balance < data.shares) {
    throw new BadRequestError('Insufficient share balance for transfer.');
  }

  let toAccount = await repo.findAccountByMember(data.toMemberId);
  if (!toAccount) {
    toAccount = await repo.createAccount(data.toMemberId);
  }

  const newToBalance = toAccount.balance + data.shares;
  if (config.maxPerMember > 0 && newToBalance > config.maxPerMember) {
    throw new BadRequestError(`Transfer exceeds receiver's maximum allowed shares (${config.maxPerMember}).`);
  }

  return repo.processTransfer({
    fromAccountId: fromAccount.id,
    toAccountId: toAccount.id,
    shares: data.shares,
    pricePerShare: Number(config.sharePrice),
    txnDate: new Date(data.txnDate),
    focalAgentId: data.focalAgentId,
    recordedBy
  });
}

export async function checkShareThresholdCompliance(memberId: string) {
  const config = await repo.getConfig();
  const account = await repo.findAccountByMember(memberId);

  const balance = account ? account.balance : 0;
  const sharePrice = Number(config.sharePrice);
  const totalEquityValue = balance * sharePrice;
  const minThreshold = config.minPerMember;
  const isCompliant = balance >= minThreshold;
  const sharesDeficit = isCompliant ? 0 : minThreshold - balance;

  return {
    memberId,
    balance,
    sharePrice,
    totalEquityValue,
    minThreshold,
    isCompliant,
    sharesDeficit,
    amountDeficit: sharesDeficit * sharePrice
  };
}

export async function listAllTxns() {
  return repo.listAllTxns();
}
