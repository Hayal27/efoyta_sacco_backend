import { prisma } from '../../config/prisma';
import { NotFoundError, BadRequestError, BusinessRuleError } from '../../shared/errors/app-error';
import { eventBus } from '../../shared/events/event-bus';
import { getPrimaryBranchId } from '../../shared/utils/branch.utils';
import { generateReceiptNo } from '../../shared/utils/receipt.utils';
import * as savingsRepo from './savings.repository';
import { sendEmail } from '../notifications/channels/email.channel';
import { sendSms } from '../notifications/channels/sms.channel';
import { sendTelegramOtp } from '../notifications/channels/telegram.channel';

// In-memory secure OTP store for transaction authorization (with 15-minute TTL)
interface TxnOtpSession {
  code: string;
  expiresAt: number;
  action: 'deposit' | 'withdrawal';
  amount: number;
  failedAttempts: number;
}
const txnOtpStore = new Map<string, TxnOtpSession>();

function maskTarget(value: string): string {
  if (value.includes('@')) {
    const [name, domain] = value.split('@');
    const masked = name.length > 2 ? `${name.substring(0, 2)}***${name.slice(-1)}` : `${name}***`;
    return `${masked}@${domain}`;
  }
  if (value.length > 6) {
    return `${value.substring(0, 4)}***${value.slice(-3)}`;
  }
  return value;
}

export async function requestTransactionOtp(memberId: string, action: 'deposit' | 'withdrawal', amount: number) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: { user: true },
  });
  if (!member) throw new NotFoundError('Member not found');

  const targetEmail = member.email || member.user?.email;
  const targetPhone = member.phone || member.user?.phone;

  if (!targetEmail && !targetPhone) {
    throw new BadRequestError('No verified email or phone number found for this member account');
  }

  // 6-digit cryptographic OTP
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 mins

  txnOtpStore.set(memberId, {
    code,
    expiresAt,
    action,
    amount,
    failedAttempts: 0,
  });

  const formattedAmount = `${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} ETB`;
  const actionTextAmharic = action === 'deposit' ? 'ተቀማጭ' : 'ወጪ';
  const actionTextEnglish = action.toUpperCase();

  // 1. Dispatch Gmail SMTP Email
  if (targetEmail) {
    const emailSubject = `[EFOYTA SACCO] Security Code for ${actionTextEnglish} Request`;
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #047857; margin: 0; font-size: 22px;">EFOYTA SACCO MEMBER PORTAL</h2>
          <p style="color: #64748b; font-size: 13px; margin-top: 4px;">Verified Self-Service Transaction Authorization</p>
        </div>
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
          <span style="font-size: 12px; color: #166534; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Your One-Time Passcode (OTP)</span>
          <div style="font-size: 36px; font-weight: 800; color: #15803d; letter-spacing: 8px; margin: 12px 0; font-family: monospace;">${code}</div>
          <p style="margin: 0; font-size: 12px; color: #475569;">Valid for 15 minutes. Never share this code with anyone.</p>
        </div>
        <div style="border-top: 1px solid #f1f5f9; padding-top: 16px; font-size: 13px; color: #334155; line-height: 1.6;">
          <p>Dear <strong>${member.fullName}</strong>,</p>
          <p>You have initiated a <strong>${actionTextEnglish} (${actionTextAmharic})</strong> request of <strong>${formattedAmount}</strong> on the Efoyta SACCO Member Portal.</p>
          <p>Enter the code above to securely confirm and submit your request to the central teller queue for processing.</p>
        </div>
        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #94a3b8;">
          If you did not initiate this request, please lock your account immediately and contact our SACCO branch helpline.
        </div>
      </div>
    `;
    sendEmail(targetEmail, emailSubject, emailHtml).catch((err) =>
      console.warn('Failed to dispatch transaction OTP email:', err.message)
    );
  }

  // 2. Dispatch SMS
  if (targetPhone) {
    const smsText = `[EFOYTA SACCO] Your OTP for ${actionTextEnglish} request of ${formattedAmount} is ${code}. Valid for 15 min.`;
    sendSms(targetPhone, smsText).catch((err) =>
      console.warn('Failed to dispatch transaction OTP SMS:', err.message)
    );
  }

  // 3. Dispatch Telegram if linked
  if (member.user?.telegram) {
    sendTelegramOtp(member.user.telegram, code, `${actionTextEnglish} Request authorization (${formattedAmount})`);
  }

  return {
    success: true,
    message: `Verification code sent to ${maskTarget(targetEmail || targetPhone!)}`,
    maskedTarget: maskTarget(targetEmail || targetPhone!),
    expiresInMinutes: 15,
  };
}

export function verifyTransactionOtp(memberId: string, inputCode: string) {
  const session = txnOtpStore.get(memberId);
  if (!session) {
    throw new BadRequestError('No active verification session. Please request a new verification code.');
  }

  if (Date.now() > session.expiresAt) {
    txnOtpStore.delete(memberId);
    throw new BadRequestError('Verification code has expired. Please request a new code.');
  }

  if (session.failedAttempts >= 5) {
    txnOtpStore.delete(memberId);
    throw new BadRequestError('Too many incorrect attempts. Please request a new code.');
  }

  if (session.code.trim() !== inputCode.trim()) {
    session.failedAttempts += 1;
    throw new BadRequestError(`Invalid verification code. ${5 - session.failedAttempts} attempts remaining.`);
  }

  // Code verified! Remove session
  txnOtpStore.delete(memberId);
  return true;
}

// ── Member Portal: Submit Deposit Request ────────────────────────────────────

export async function createDepositRequest(
  memberId: string,
  input: {
    savingsAccountId: string;
    amount: number;
    bankName: string;
    bankAccountNumber?: string;
    bankAccountHolder?: string;
    bankTxnId?: string;
    depositSlipUrl?: string;
    memberRemarks?: string;
    otpCode: string;
  }
) {
  if (!input.amount || Number(input.amount) <= 0) {
    throw new BadRequestError('Deposit amount must be greater than zero');
  }
  if (!input.bankName) {
    throw new BadRequestError('Bank name is required');
  }
  if (!input.otpCode) {
    throw new BadRequestError('Security verification OTP code is required');
  }

  // Verify OTP
  verifyTransactionOtp(memberId, input.otpCode);

  const account = await prisma.savingsAccount.findFirst({
    where: { id: input.savingsAccountId, memberId },
    include: { product: true, member: true },
  });
  if (!account) throw new NotFoundError('Savings account not found for this member');

  const timestamp = Date.now().toString().slice(-6);
  const requestNumber = `DEP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${timestamp}`;

  const request = await prisma.memberTransactionRequest.create({
    data: {
      requestNumber,
      memberId,
      savingsAccountId: input.savingsAccountId,
      type: 'deposit',
      amount: Number(input.amount),
      status: 'PENDING',
      bankName: input.bankName.trim(),
      bankAccountNumber: input.bankAccountNumber?.trim() || null,
      bankAccountHolder: input.bankAccountHolder?.trim() || account.member.fullName,
      bankTxnId: input.bankTxnId?.trim() || null,
      depositSlipUrl: input.depositSlipUrl || null,
      memberRemarks: input.memberRemarks?.trim() || null,
      otpVerified: true,
      otpVerifiedAt: new Date(),
    },
    include: {
      savingsAccount: { include: { product: true } },
      member: true,
    },
  });

  return request;
}

// ── Member Portal: Submit Withdrawal Request ─────────────────────────────────

export async function createWithdrawalRequest(
  memberId: string,
  input: {
    savingsAccountId: string;
    amount: number;
    bankName: string;
    bankAccountNumber: string;
    bankAccountHolder?: string;
    memberBankAccountId?: string;
    memberRemarks?: string;
    otpCode: string;
  }
) {
  const reqAmount = Number(input.amount);
  if (!reqAmount || reqAmount <= 0) {
    throw new BadRequestError('Withdrawal amount must be greater than zero');
  }
  if (!input.bankName || !input.bankAccountNumber) {
    throw new BadRequestError('Destination bank name and account number are required');
  }
  if (!input.otpCode) {
    throw new BadRequestError('Security verification OTP code is required');
  }

  // Verify OTP
  verifyTransactionOtp(memberId, input.otpCode);

  const account = await prisma.savingsAccount.findFirst({
    where: { id: input.savingsAccountId, memberId },
    include: { product: true, member: true },
  });
  if (!account) throw new NotFoundError('Savings account not found for this member');

  // Verify account balance & limits
  const currentBalance = await savingsRepo.getAccountBalance(account.id);
  const minBalance = Number(account.product.minBalance || 0);
  const lienBalance = Number(account.lienBalance || 0);
  const availableBalance = currentBalance - minBalance - lienBalance;

  if (reqAmount > availableBalance) {
    throw new BusinessRuleError(
      `Insufficient available balance. Current balance is ${currentBalance.toLocaleString()} ETB, available to withdraw is ${availableBalance.toLocaleString()} ETB.`
    );
  }

  const timestamp = Date.now().toString().slice(-6);
  const requestNumber = `WTH-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${timestamp}`;

  const request = await prisma.memberTransactionRequest.create({
    data: {
      requestNumber,
      memberId,
      savingsAccountId: input.savingsAccountId,
      type: 'withdrawal',
      amount: reqAmount,
      status: 'PENDING',
      bankName: input.bankName.trim(),
      bankAccountNumber: input.bankAccountNumber.trim(),
      bankAccountHolder: input.bankAccountHolder?.trim() || account.member.fullName,
      memberBankAccountId: input.memberBankAccountId || null,
      memberRemarks: input.memberRemarks?.trim() || null,
      otpVerified: true,
      otpVerifiedAt: new Date(),
    },
    include: {
      savingsAccount: { include: { product: true } },
      member: true,
    },
  });

  return request;
}

// ── Teller Queue: List Requests with Pagination, Searching & Filtering ──────

export async function listTransactionRequests(params: {
  status?: string;
  type?: string;
  search?: string;
  memberId?: string;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(params.limit) || 10));
  const skip = (page - 1) * limit;

  const where: any = {};

  if (params.status && params.status !== 'ALL') {
    where.status = params.status;
  }
  if (params.type && params.type !== 'ALL') {
    where.type = params.type;
  }
  if (params.memberId) {
    where.memberId = params.memberId;
  }

  if (params.search && params.search.trim()) {
    const q = params.search.trim();
    where.OR = [
      { requestNumber: { contains: q } },
      { bankTxnId: { contains: q } },
      { tellerBankTxnId: { contains: q } },
      { manualReceiptNo: { contains: q } },
      { member: { fullName: { contains: q } } },
      { member: { memberCode: { contains: q } } },
      { member: { phone: { contains: q } } },
      { bankName: { contains: q } },
      { bankAccountNumber: { contains: q } },
    ];
  }

  const [totalCount, items, statsRaw] = await Promise.all([
    prisma.memberTransactionRequest.count({ where }),
    prisma.memberTransactionRequest.findMany({
      where,
      include: {
        member: {
          select: {
            id: true,
            memberCode: true,
            fullName: true,
            fullNameAmharic: true,
            phone: true,
            email: true,
            passportPhotoUrl: true,
            voiceRecordingUrl: true,
            fingerprintUrl: true,
          },
        },
        savingsAccount: {
          include: { product: true },
        },
        memberBankAccount: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.memberTransactionRequest.groupBy({
      by: ['status', 'type'],
      _count: { id: true },
      _sum: { amount: true },
    }),
  ]);

  // Attach live account balance to each request for teller convenience
  const enrichedItems = await Promise.all(
    items.map(async (item) => {
      const balance = await savingsRepo.getAccountBalance(item.savingsAccountId);
      return {
        ...item,
        currentAccountBalance: balance,
      };
    })
  );

  // Compute summary stats
  let pendingDepositsCount = 0;
  let pendingWithdrawalsCount = 0;
  let pendingAmount = 0;
  let approvedCount = 0;

  for (const s of statsRaw) {
    const count = s._count.id || 0;
    const sum = Number(s._sum.amount || 0);
    if (s.status === 'PENDING') {
      pendingAmount += sum;
      if (s.type === 'deposit') pendingDepositsCount += count;
      if (s.type === 'withdrawal') pendingWithdrawalsCount += count;
    }
    if (s.status === 'APPROVED') {
      approvedCount += count;
    }
  }

  return {
    items: enrichedItems,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit) || 1,
    },
    stats: {
      pendingDepositsCount,
      pendingWithdrawalsCount,
      pendingAmount,
      approvedCount,
      totalRequests: totalCount,
    },
  };
}

export async function getTransactionRequestById(id: string) {
  const request = await prisma.memberTransactionRequest.findUnique({
    where: { id },
    include: {
      member: {
        include: {
          bankAccounts: true,
        },
      },
      savingsAccount: {
        include: { product: true },
      },
      memberBankAccount: true,
    },
  });

  if (!request) throw new NotFoundError('Transaction request not found');

  const currentBalance = await savingsRepo.getAccountBalance(request.savingsAccountId);
  return {
    ...request,
    currentAccountBalance: currentBalance,
  };
}

// ── Teller Action: Approve and Credit/Debit Account with Manual Receipt & Bank Txn ID ──

export async function approveTransactionRequest(
  id: string,
  tellerUserId: string,
  input: {
    manualReceiptNo?: string;
    tellerBankTxnId?: string;
    tellerReceiptUrl?: string;
    tellerRemarks?: string;
  }
) {
  const request = await prisma.memberTransactionRequest.findUnique({
    where: { id },
    include: {
      member: true,
      savingsAccount: { include: { product: true } },
    },
  });

  if (!request) throw new NotFoundError('Transaction request not found');
  if (request.status !== 'PENDING') {
    throw new BusinessRuleError(`This request has already been ${request.status.toLowerCase()}`);
  }

  const userBranchId = await getPrimaryBranchId(tellerUserId);
  const receiptNo = input.manualReceiptNo?.trim() || generateReceiptNo();
  const amountNum = Number(request.amount);

  // If withdrawal, verify balance again before debiting
  if (request.type === 'withdrawal') {
    const currentBalance = await savingsRepo.getAccountBalance(request.savingsAccountId);
    const minBalance = Number(request.savingsAccount.product.minBalance || 0);
    const lienBalance = Number(request.savingsAccount.lienBalance || 0);
    const available = currentBalance - minBalance - lienBalance;
    if (amountNum > available) {
      throw new BusinessRuleError(
        `Cannot approve withdrawal. Member available balance is only ${available.toLocaleString()} ETB.`
      );
    }
  }

  // 1. Create official SavingsTxn in Core Banking
  const txn = await savingsRepo.createTxn({
    accountId: request.savingsAccountId,
    type: request.type as 'deposit' | 'withdrawal',
    amount: amountNum,
    paymentMethod: 'bank',
    txnDate: new Date(),
    receiptNo,
    focalAgentId: request.member.focalAgentId || null,
    branchId: userBranchId || null,
    reasonCode: `member_request_${request.type}`,
    bankTxnId: input.tellerBankTxnId || request.bankTxnId || null,
    manualReceiptNo: input.manualReceiptNo || null,
    receiptAttachmentUrl: input.tellerReceiptUrl || request.depositSlipUrl || null,
    notes: input.tellerRemarks || `Online member ${request.type} request approved`,
    recordedBy: tellerUserId,
  });

  // 2. Mark request as APPROVED
  const updatedRequest = await prisma.memberTransactionRequest.update({
    where: { id },
    data: {
      status: 'APPROVED',
      processedBy: tellerUserId,
      processedAt: new Date(),
      manualReceiptNo: input.manualReceiptNo?.trim() || receiptNo,
      tellerBankTxnId: input.tellerBankTxnId?.trim() || request.bankTxnId || null,
      tellerReceiptUrl: input.tellerReceiptUrl || null,
      tellerRemarks: input.tellerRemarks?.trim() || null,
      savingsTxnId: txn.id,
    },
  });

  // 3. Emit real-time event
  const newBalance = await savingsRepo.getAccountBalance(request.savingsAccountId);
  eventBus.emit({
    type: request.type === 'deposit' ? 'savings.deposited' : 'savings.withdrawn',
    payload: {
      accountId: request.savingsAccountId,
      memberId: request.memberId,
      amount: amountNum,
      receiptNo,
      balance: newBalance,
      accountNumber: request.savingsAccount.accountNumber,
      productName: request.savingsAccount.product?.name,
      txnId: txn.id,
    },
  });

  // 4. Send Notification to Member (Email, SMS, In-App)
  const isCredit = request.type === 'deposit';
  const actionTitle = isCredit ? 'Deposit Approved & Credited' : 'Withdrawal Approved & Disbursed';
  const formattedAmt = `${amountNum.toLocaleString(undefined, { minimumFractionDigits: 2 })} ETB`;
  const formattedBal = `${newBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} ETB`;

  if (request.member.email) {
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background: #ffffff;">
        <h2 style="color: #047857; margin: 0 0 12px;">${actionTitle}</h2>
        <p>Dear <strong>${request.member.fullName}</strong>,</p>
        <p>Your online ${request.type} request (Ref: <code>${request.requestNumber}</code>) has been <strong>approved</strong> by our teller.</p>
        <div style="background: #f8fafc; padding: 16px; border-radius: 12px; margin: 16px 0;">
          <p style="margin: 4px 0;"><strong>Amount:</strong> ${isCredit ? '+' : '−'}${formattedAmt}</p>
          <p style="margin: 4px 0;"><strong>New Balance:</strong> ${formattedBal}</p>
          <p style="margin: 4px 0;"><strong>Receipt No:</strong> ${receiptNo}</p>
          ${input.tellerBankTxnId ? `<p style="margin: 4px 0;"><strong>Bank Reference:</strong> ${input.tellerBankTxnId}</p>` : ''}
        </div>
        <p style="color: #64748b; font-size: 12px;">Thank you for saving with Efoyta SACCO.</p>
      </div>
    `;
    sendEmail(request.member.email, `[EFOYTA SACCO] ${actionTitle} - ${formattedAmt}`, emailHtml).catch(() => {});
  }

  if (request.member.phone) {
    const sms = `[EFOYTA SACCO] Your ${request.type} of ${formattedAmt} is approved! New balance: ${formattedBal}. Receipt: ${receiptNo}`;
    sendSms(request.member.phone, sms).catch(() => {});
  }

  return {
    success: true,
    message: `Request successfully approved and ${isCredit ? 'credited to' : 'debited from'} member account.`,
    request: updatedRequest,
    txn,
    newBalance,
  };
}

// ── Teller Action: Reject Request ────────────────────────────────────────────

export async function rejectTransactionRequest(
  id: string,
  tellerUserId: string,
  reason: string
) {
  if (!reason || !reason.trim()) {
    throw new BadRequestError('A reason for rejection is required');
  }

  const request = await prisma.memberTransactionRequest.findUnique({
    where: { id },
    include: { member: true, savingsAccount: true },
  });

  if (!request) throw new NotFoundError('Transaction request not found');
  if (request.status !== 'PENDING') {
    throw new BusinessRuleError(`This request has already been ${request.status.toLowerCase()}`);
  }

  const updated = await prisma.memberTransactionRequest.update({
    where: { id },
    data: {
      status: 'REJECTED',
      processedBy: tellerUserId,
      processedAt: new Date(),
      rejectionReason: reason.trim(),
    },
  });

  // Notify member of rejection
  const formattedAmt = `${Number(request.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} ETB`;
  if (request.member.email) {
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #fee2e2; border-radius: 16px; background: #ffffff;">
        <h2 style="color: #dc2626; margin: 0 0 12px;">Transaction Request Update</h2>
        <p>Dear <strong>${request.member.fullName}</strong>,</p>
        <p>Your online ${request.type} request (Ref: <code>${request.requestNumber}</code>) for <strong>${formattedAmt}</strong> could not be approved at this time.</p>
        <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 16px; border-radius: 12px; margin: 16px 0;">
          <strong style="color: #991b1b;">Reason for Rejection:</strong>
          <p style="margin: 8px 0 0; color: #7f1d1d;">${reason.trim()}</p>
        </div>
        <p style="color: #64748b; font-size: 12px;">For further assistance, please contact your Efoyta SACCO branch or submit a corrected request.</p>
      </div>
    `;
    sendEmail(request.member.email, `[EFOYTA SACCO] Transaction Request Notice - ${request.requestNumber}`, emailHtml).catch(() => {});
  }

  return {
    success: true,
    message: 'Request rejected',
    request: updated,
  };
}
