import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { NotFoundError, BusinessRuleError, UnauthorizedError } from '../../shared/errors/app-error';
import { generateRepaymentSchedule } from '../loans/repayment-schedule.service';
import { getMemberEligibilitySummary } from '../loans/loans.service';
import { eventBus } from '../../shared/events/event-bus';
import { generateReceiptNo } from '../../shared/utils/receipt.utils';

/**
 * Direct Member Authentication for Member Portal Channel
 */
export async function authenticateMemberLogin(identifier: string, password?: string, twoFactorCode?: string) {
  const cleanId = (identifier || '').trim();
  if (!cleanId || !password) {
    throw new UnauthorizedError('Identifier (email, phone, or Fayda ID) and password are required');
  }

  // Generate phone number formats for Ethiopian mobile numbers (09..., 07..., +251..., 251...)
  const idVariants = [cleanId, cleanId.toLowerCase()];
  const digitsOnly = cleanId.replace(/\D/g, '');
  if (digitsOnly.length >= 9) {
    const last9 = digitsOnly.slice(-9); // e.g. 983713511
    idVariants.push(last9);
    idVariants.push(`0${last9}`);       // e.g. 0983713511
    idVariants.push(`+251${last9}`);    // e.g. +251983713511
    idVariants.push(`251${last9}`);     // e.g. 251983713511
  }
  const uniqueVariants = Array.from(new Set(idVariants));

  // 1. Search user by email, phone, or nationalId/FAN
  let user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: { in: uniqueVariants } },
        { phone: { in: uniqueVariants } },
      ],
      isActive: true,
    },
    include: { role: true, memberProfile: true },
  });

  if (!user) {
    // Check if identifier is phone, email, nationalId / Fayda ID / memberCode on Member model
    const memberRecord = await prisma.member.findFirst({
      where: {
        OR: [
          { phone: { in: uniqueVariants } },
          { email: { in: uniqueVariants } },
          { nationalId: { in: uniqueVariants } },
          { nationalIdFin: { in: uniqueVariants } },
          { memberCode: { in: uniqueVariants } },
        ],
      },
      include: { user: { include: { role: true, memberProfile: true } } },
    });
    if (memberRecord?.user) {
      user = memberRecord.user as any;
    } else if (memberRecord?.userId) {
      user = await prisma.user.findUnique({
        where: { id: memberRecord.userId },
        include: { role: true, memberProfile: true },
      }) as any;
    }
  }

  if (!user) {
    throw new UnauthorizedError('Member account not found or inactive');
  }

  // 2. Verify password (handling potential case variations e.g. Efoyta@123 vs efoyta@123)
  let isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid && password.length > 0) {
    const trimmed = password.trim();
    if (trimmed !== password) {
      isValid = await bcrypt.compare(trimmed, user.passwordHash);
    }
  }
  if (!isValid && password.length > 0) {
    // Check first-character case toggle (e.g. Efoyta@123 <-> efoyta@123)
    const firstChar = password.charAt(0);
    const toggledFirst = (firstChar === firstChar.toUpperCase()
      ? firstChar.toLowerCase()
      : firstChar.toUpperCase()) + password.slice(1);
    isValid = await bcrypt.compare(toggledFirst, user.passwordHash);
  }
  if (!isValid && password.length > 0) {
    // Check lowercase
    if (password.toLowerCase() !== password) {
      isValid = await bcrypt.compare(password.toLowerCase(), user.passwordHash);
    }
  }

  if (!isValid) {
    throw new UnauthorizedError('Invalid credentials');
  }

  // 3. Resolve member profile
  let member = user.memberProfile;
  if (!member) {
    const phoneVariants = user.phone ? [
      user.phone,
      user.phone.replace(/\D/g, '').slice(-9),
      `0${user.phone.replace(/\D/g, '').slice(-9)}`,
      `+251${user.phone.replace(/\D/g, '').slice(-9)}`,
      `251${user.phone.replace(/\D/g, '').slice(-9)}`,
    ] : [];

    member = await prisma.member.findFirst({
      where: {
        OR: [
          { userId: user.id },
          ...(user.email ? [{ email: user.email }] : []),
          ...(phoneVariants.length > 0 ? [{ phone: { in: phoneVariants } }] : []),
          ...(uniqueVariants.length > 0 ? [
            { phone: { in: uniqueVariants } },
            { nationalId: { in: uniqueVariants } },
            { nationalIdFin: { in: uniqueVariants } },
            { memberCode: { in: uniqueVariants } },
          ] : []),
        ],
      },
    });
    if (member && (!member.userId || member.userId !== user.id)) {
      await prisma.member.update({ where: { id: member.id }, data: { userId: user.id } });
    }
  }

  // 4. Generate JWT tokens
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role?.slug || 'member',
    memberId: member?.id,
  };

  const accessToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: (env.JWT_ACCESS_EXPIRES_IN || '24h') as any,
  });
  const refreshToken = jwt.sign({ sub: user.id }, env.JWT_REFRESH_SECRET, {
    expiresIn: (env.JWT_REFRESH_EXPIRES_IN || '7d') as any,
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role?.slug || 'member',
    },
    member: member ? {
      id: member.id,
      memberCode: member.memberCode,
      fullName: member.fullName,
      fullNameAmharic: member.fullNameAmharic,
      nationalId: member.nationalId,
      nationalIdFin: member.nationalIdFin,
      kycLevel: member.kycLevel,
      kycStatus: member.kycStatus,
      branchId: member.branchId,
    } : null,
  };
}

/**
 * Resolve member record for the calling authenticated user.
 * If user is role 'member', find by member.userId.
 * If user is admin/staff and specifies ?memberId=..., use that member.
 * Otherwise, fall back to first active member for dev/preview.
 */
export async function resolveMemberForUser(userId: string, requestedMemberId?: string) {
  if (requestedMemberId) {
    const member = await prisma.member.findUnique({
      where: { id: requestedMemberId },
      include: { branch: true, user: true, documents: true },
    });
    if (member) return member;
  }

  // 1. Check if user has an explicitly linked member profile
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { memberProfile: { include: { branch: true, user: true, documents: true } } },
  });

  if (user?.memberProfile) return user.memberProfile;

  // 2. Find by member.userId
  let member = await prisma.member.findFirst({
    where: { userId },
    include: { branch: true, user: true, documents: true },
  });

  // 3. Match by phone variants or email from user record
  if (!member && user) {
    const phoneDigits = user.phone ? user.phone.replace(/\D/g, '').slice(-9) : '';
    const userPhoneVariants = phoneDigits ? [
      user.phone!,
      phoneDigits,
      `0${phoneDigits}`,
      `+251${phoneDigits}`,
      `251${phoneDigits}`,
    ] : [];

    member = await prisma.member.findFirst({
      where: {
        OR: [
          ...(user.email ? [{ email: user.email }] : []),
          ...(userPhoneVariants.length > 0 ? [{ phone: { in: userPhoneVariants } }] : []),
        ],
      },
      include: { branch: true, user: true, documents: true },
    });

    if (member && (!member.userId || member.userId !== user.id)) {
      await prisma.member.update({
        where: { id: member.id },
        data: { userId: user.id },
      });
    }
  }

  // 4. Fallback for staff or exploration accounts if still not matched
  if (!member) {
    member = await prisma.member.findFirst({
      where: { status: 'active' },
      include: { branch: true, user: true, documents: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  if (!member) {
    throw new NotFoundError('No member profile found for this account.');
  }

  return member;
}

/**
 * Get comprehensive 360 overview for Member Portal dashboard:
 * - Bio, Fayda National ID details, KYC tier & status
 * - Savings, Loan liabilities, and Share equity summary
 */
export async function getMemberPortalOverview(userId: string, queryMemberId?: string) {
  const member = await resolveMemberForUser(userId, queryMemberId);

  const [savingsAccounts, activeLoans, shareAccount, dividendPayouts, shareConfig] = await Promise.all([
    prisma.savingsAccount.findMany({
      where: { memberId: member.id },
      include: {
        product: true,
        txns: {
          orderBy: { txnDate: 'desc' },
          take: 50,
        },
      },
    }),
    prisma.loan.findMany({
      where: { memberId: member.id },
      include: {
        loanProduct: true,
        repayments: { orderBy: { paidDate: 'desc' }, take: 10 },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.shareAccount.findUnique({
      where: { memberId: member.id },
      include: {
        txns: { orderBy: { txnDate: 'desc' }, take: 10 },
      },
    }),
    prisma.dividendPayout.findMany({
      where: { memberId: member.id },
      orderBy: { postedAt: 'desc' },
    }),
    prisma.shareConfig.findFirst() || { sharePrice: 10, minPerMember: 1 },
  ]);

  // Compute aggregate savings balances accurately for all accounts
  let totalSavings = 0;
  const savingsSummary = await Promise.all(
    savingsAccounts.map(async (acc) => {
      const deposits = await prisma.savingsTxn.aggregate({
        where: { accountId: acc.id, type: { in: ['deposit', 'interest'] } },
        _sum: { amount: true },
      });
      const withdrawals = await prisma.savingsTxn.aggregate({
        where: { accountId: acc.id, type: 'withdrawal' },
        _sum: { amount: true },
      });
      const balance = parseFloat(
        (Number(deposits._sum.amount || 0) - Number(withdrawals._sum.amount || 0)).toFixed(2)
      );
      totalSavings += balance;
      return {
        id: acc.id,
        accountNumber: acc.accountNumber,
        productName: acc.product.name,
        type: acc.product.type,
        interestRate: Number(acc.product.interestRate),
        balance,
        recentTxns: acc.txns,
      };
    })
  );

  // Compute active loans total
  let totalLoanOutstanding = 0;
  let totalLoanPrincipal = 0;
  const loansSummary = activeLoans.map((l) => {
    const outstanding = Number(l.outstanding);
    const principal = Number(l.principal);
    if (['active', 'pending', 'pending_approval', 'disbursed'].includes(l.status)) {
      totalLoanOutstanding += outstanding;
      totalLoanPrincipal += principal;
    }
    return {
      id: l.id,
      productName: l.loanProduct.name,
      principal,
      outstanding,
      interestRate: Number(l.interestRate),
      termMonths: l.termMonths,
      status: l.status,
      disbursedDate: l.disbursedDate,
      dueDate: l.dueDate,
      nextPaymentDate: l.nextPaymentDate,
      repayments: l.repayments,
    };
  });

  // Compute share capital
  const sharesOwned = shareAccount?.balance || 0;
  const sharePrice = Number((shareConfig as any).sharePrice || 10);
  const totalSharesValue = sharesOwned * sharePrice;
  const sharesSummary = {
    totalShares: sharesOwned,
    totalCapital: totalSharesValue,
    sharePrice,
  };

  const netWorth = parseFloat((totalSavings + totalSharesValue - totalLoanOutstanding).toFixed(2));

  // Collect all recent transactions across all member savings accounts for activity feed
  const allRecentTxns = savingsAccounts
    .flatMap((acc) => acc.txns || [])
    .sort((a, b) => new Date(b.txnDate || b.createdAt).getTime() - new Date(a.txnDate || a.createdAt).getTime())
    .slice(0, 15);

  // KYC Level and Status Badges
  const kycLevel = member.kycLevel || 'LEVEL_1';
  const kycStatus = member.kycStatus || 'VERIFIED';

  return {
    member: {
      id: member.id,
      memberCode: member.memberCode,
      fullName: member.fullName,
      fullNameAmharic: member.fullNameAmharic,
      phone: member.phone,
      email: member.email,
      gender: member.gender,
      dateOfBirth: member.dateOfBirth,
      nationalId: member.nationalId,
      nationalIdFin: member.nationalIdFin,
      nationalIdFrontUrl: member.nationalIdFrontUrl,
      nationalIdBackUrl: member.nationalIdBackUrl,
      nationalIdExpiry: member.nationalIdExpiry,
      nationalIdIssueDate: member.nationalIdIssueDate,
      region: member.region,
      zone: member.zone,
      woreda: member.woreda,
      kebele: member.kebele,
      houseNumber: member.houseNumber,
      address: member.address,
      occupation: member.occupation,
      employer: member.employer,
      monthlyIncome: member.monthlyIncome ? Number(member.monthlyIncome) : null,
      emergencyContactName: member.emergencyContactName,
      emergencyContactPhone: member.emergencyContactPhone,
      emergencyContactRelation: member.emergencyContactRelation,
      status: member.status,
      kycLevel,
      kycStatus,
      joinDate: member.joinDate,
      branch: (member as any).branch?.name || 'Main Branch',
      passportPhotoUrl: member.passportPhotoUrl,
      voiceRecordingUrl: member.voiceRecordingUrl,
      fingerprintUrl: member.fingerprintUrl,
      documents: (member as any).documents,
    },
    metrics: {
      totalSavings,
      totalLoanOutstanding,
      totalLoanPrincipal: totalLoanOutstanding > 0 ? totalLoanOutstanding : totalLoanPrincipal,
      sharesOwned,
      sharePrice,
      totalSharesValue,
      netWorth,
    },
    // Top-level aliases for direct access in mobile app & web portal
    totalSavings,
    netWorth,
    totalLoanPrincipal: totalLoanOutstanding > 0 ? totalLoanOutstanding : totalLoanPrincipal,
    totalLoanOutstanding,
    sharesSummary,
    savingsAccounts: savingsSummary,
    loans: loansSummary,
    dividendPayouts,
    recentTransactions: allRecentTxns,
  };
}

/**
 * Get detailed savings accounts & paginated transaction history
 */
export async function getMemberSavingsPassbook(
  userId: string,
  params: {
    queryMemberId?: string;
    accountId?: string;
    type?: string;
    search?: string;
    page?: number;
    limit?: number;
  }
) {
  const member = await resolveMemberForUser(userId, params.queryMemberId);
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(params.limit) || 15));
  const skip = (page - 1) * limit;

  // Accounts
  const accounts = await prisma.savingsAccount.findMany({
    where: { memberId: member.id },
    include: { product: true },
  });

  const accountIds = accounts.map((a) => a.id);
  const targetAccountId = params.accountId && accountIds.includes(params.accountId) ? params.accountId : undefined;

  // Filter conditions for transactions
  const where: any = {
    accountId: targetAccountId ? targetAccountId : { in: accountIds },
  };

  if (params.type && ['deposit', 'withdrawal', 'interest'].includes(params.type)) {
    where.type = params.type;
  }

  if (params.search) {
    where.OR = [
      { receiptNo: { contains: params.search } },
      { paymentMethod: { contains: params.search } },
    ];
  }

  const [txns, totalTxns] = await Promise.all([
    prisma.savingsTxn.findMany({
      where,
      orderBy: { txnDate: 'desc' },
      skip,
      take: limit,
      include: {
        account: {
          include: { product: true },
        },
      },
    }),
    prisma.savingsTxn.count({ where }),
  ]);

  // Compute account balances
  const accountsWithBalances = await Promise.all(
    accounts.map(async (acc) => {
      const deposits = await prisma.savingsTxn.aggregate({
        where: { accountId: acc.id, type: 'deposit' },
        _sum: { amount: true },
      });
      const withdrawals = await prisma.savingsTxn.aggregate({
        where: { accountId: acc.id, type: 'withdrawal' },
        _sum: { amount: true },
      });
      const balance =
        Number(deposits._sum.amount || 0) - Number(withdrawals._sum.amount || 0);

      return {
        id: acc.id,
        accountNumber: acc.accountNumber,
        productName: acc.product.name,
        type: acc.product.type,
        interestRate: Number(acc.product.interestRate),
        balance: parseFloat(balance.toFixed(2)),
      };
    })
  );

  return {
    accounts: accountsWithBalances,
    transactions: txns,
    meta: {
      page,
      limit,
      total: totalTxns,
      totalPages: Math.ceil(totalTxns / limit),
      hasNextPage: page * limit < totalTxns,
      hasPrevPage: page > 1,
    },
  };
}

/**
 * Get member loans with amortization schedules, payment calendars & eligibility
 */
export async function getMemberLoanDetails(userId: string, queryMemberId?: string) {
  const member = await resolveMemberForUser(userId, queryMemberId);

  // Active and historical loans
  const loans = await prisma.loan.findMany({
    where: { memberId: member.id },
    include: {
      loanProduct: true,
      repayments: {
        orderBy: { paidDate: 'desc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Calculate schedule for active loans
  const loansWithSchedule = loans.map((l) => {
    let schedule: any[] = [];
    if (l.disbursedDate && Number(l.principal) > 0) {
      schedule = generateRepaymentSchedule(
        Number(l.principal),
        Number(l.interestRate),
        l.termMonths,
        new Date(l.disbursedDate),
        'declining_balance'
      );

      // Annotate schedule with actual payments
      const totalRepaid = l.repayments.reduce((s, r) => s + Number(r.amount), 0);
      let cumulative = 0;
      schedule = schedule.map((item) => {
        cumulative += item.totalDue;
        const isPaid = totalRepaid >= cumulative;
        const isPartial = !isPaid && totalRepaid > cumulative - item.totalDue;
        return {
          ...item,
          status: isPaid ? 'PAID' : isPartial ? 'PARTIAL' : 'PENDING',
        };
      });
    }

    return {
      ...l,
      principal: Number(l.principal),
      outstanding: Number(l.outstanding),
      interestRate: Number(l.interestRate),
      totalRepaid: l.repayments.reduce((s, r) => s + Number(r.amount), 0),
      schedule,
    };
  });

  // Loan Eligibility Check
  const eligibility = await getMemberEligibilitySummary(member.id);

  // Available active products for applying
  const availableProducts = await prisma.loanProduct.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });

  return {
    loans: loansWithSchedule,
    eligibility,
    availableProducts,
  };
}

/**
 * Apply for a new loan online from the Member Self-Service Portal
 */
export async function applyMemberLoan(
  userId: string,
  input: {
    loanProductId: string;
    principal: number;
    termMonths: number;
    purpose?: string;
    queryMemberId?: string;
    guarantorId?: string;
    collateralDescription?: string;
    documentUrls?: string[];
  }
) {
  const member = await resolveMemberForUser(userId, input.queryMemberId);

  const product = await prisma.loanProduct.findUnique({
    where: { id: input.loanProductId },
  });
  if (!product || !product.isActive) {
    throw new NotFoundError('Selected loan product is inactive or not found.');
  }

  // Check existing active loans
  const existingActiveLoan = await prisma.loan.findFirst({
    where: {
      memberId: member.id,
      status: { in: ['pending', 'pending_approval', 'approved', 'active'] },
    },
  });

  if (existingActiveLoan) {
    throw new BusinessRuleError(
      'Member already has an ongoing or pending loan application. Policy permits only 1 active loan at a time.'
    );
  }

  // Verify principal amount range
  if (input.principal < Number(product.minAmount)) {
    throw new BusinessRuleError(`Minimum loan amount for ${product.name} is ${product.minAmount} ETB.`);
  }
  if (input.principal > Number(product.maxAmount)) {
    throw new BusinessRuleError(`Maximum loan amount for ${product.name} is ${product.maxAmount} ETB.`);
  }

  // Determine branch
  const branchId = member.branchId;

  // Create loan in pending status
  const loan = await prisma.loan.create({
    data: {
      memberId: member.id,
      loanProductId: product.id,
      principal: input.principal,
      interestRate: product.interestRate,
      termMonths: input.termMonths || product.termMonths,
      status: 'pending',
      branchId,
      outstanding: input.principal,
    },
    include: { loanProduct: true },
  });

  // Save documents / collateral proofs as member documents if provided
  if (Array.isArray(input.documentUrls) && input.documentUrls.length > 0) {
    for (let i = 0; i < input.documentUrls.length; i++) {
      const url = input.documentUrls[i];
      await prisma.memberDocument.create({
        data: {
          memberId: member.id,
          docType: 'proof_of_address',
          fileName: `Loan_Application_Collateral_${loan.id.slice(-6)}_${i + 1}.png`,
          fileKey: url,
          mimeType: 'image/png',
          fileSize: 2048,
          verificationStatus: 'pending',
        },
      });
    }
  }

  // Record guarantor if provided
  if (input.guarantorId && input.guarantorId !== member.id) {
    try {
      await prisma.guarantor.create({
        data: {
          loanId: loan.id,
          memberId: input.guarantorId,
          guaranteedAmount: input.principal,
          status: 'pending',
        },
      });
    } catch (gErr) {
      console.warn('Could not attach guarantor:', gErr);
    }
  }

  // Create system notification for staff
  try {
    await prisma.systemAlert.create({
      data: {
        alertType: 'NEW_LOAN_APPLICATION',
        severity: 'info',
        message: `Member ${member.fullName} (${member.memberCode}) submitted a new loan application for ${input.principal.toLocaleString()} ETB (${product.name}).`,
        details: { loanId: loan.id, memberId: member.id, amount: input.principal },
      },
    });
  } catch (aErr) {
    console.warn('Alert error:', aErr);
  }

  return loan;
}

/**
 * Get member shares, equity value, dividend history, and share buy tracking
 */
export async function getMemberSharesData(userId: string, queryMemberId?: string) {
  const member = await resolveMemberForUser(userId, queryMemberId);

  const [shareAccount, shareConfig, dividendPayouts] = await Promise.all([
    prisma.shareAccount.findUnique({
      where: { memberId: member.id },
      include: {
        txns: { orderBy: { txnDate: 'desc' }, take: 50 },
      },
    }),
    prisma.shareConfig.findFirst() || { sharePrice: 10, minPerMember: 1 },
    prisma.dividendPayout.findMany({
      where: { memberId: member.id },
      orderBy: { postedAt: 'desc' },
    }),
  ]);

  const sharesOwned = shareAccount?.balance || 0;
  const sharePrice = Number((shareConfig as any).sharePrice || 10);
  const totalEquity = sharesOwned * sharePrice;

  return {
    shareAccount: {
      id: shareAccount?.id,
      sharesOwned,
      sharePrice,
      totalEquity,
      transactions: shareAccount?.txns || [],
    },
    shareConfig: {
      sharePrice,
      minPerMember: (shareConfig as any).minPerMember || 1,
      dividendPolicy: 'Annual Dividend based on cooperative net surplus distribution.',
    },
    dividendPayouts,
  };
}

/**
 * Submit Share Purchase Application
 */
export async function submitSharePurchaseApplication(
  userId: string,
  input: {
    quantity: number;
    paymentMethod: string;
    referenceNo?: string;
    receiptImage?: string;
    queryMemberId?: string;
  }
) {
  const member = await resolveMemberForUser(userId, input.queryMemberId);
  const quantity = Math.max(1, parseInt(String(input.quantity), 10));

  const shareConfig = (await prisma.shareConfig.findFirst()) || { sharePrice: 10 };
  const sharePrice = Number((shareConfig as any).sharePrice || 10);
  const totalCost = quantity * sharePrice;

  // Find or create share account
  let shareAccount = await prisma.shareAccount.findUnique({
    where: { memberId: member.id },
  });
  if (!shareAccount) {
    shareAccount = await prisma.shareAccount.create({
      data: {
        memberId: member.id,
        balance: 0,
        branchId: member.branchId,
      },
    });
  }

  // Create pending share purchase txn
  const receiptNo = input.referenceNo || generateReceiptNo();
  const txn = await prisma.shareTxn.create({
    data: {
      shareAccountId: shareAccount.id,
      quantity,
      pricePerShare: sharePrice,
      totalAmount: totalCost,
      txnType: 'issue',
      recordedBy: userId,
      branchId: member.branchId,
      notes: `Online share purchase application via Member Portal (${quantity} shares @ ${sharePrice} ETB). Ref: ${receiptNo}`,
    },
  });

  // Increment share account balance
  await prisma.shareAccount.update({
    where: { id: shareAccount.id },
    data: { balance: { increment: quantity } },
  });

  // Notify
  try {
    await prisma.systemAlert.create({
      data: {
        alertType: 'SHARE_PURCHASE',
        severity: 'info',
        message: `Member ${member.fullName} purchased ${quantity} shares for ${totalCost.toLocaleString()} ETB.`,
        details: { memberId: member.id, quantity, totalCost, receiptNo },
      },
    });
  } catch (err) {
    console.warn('Alert error:', err);
  }

  return {
    txn,
    sharesAdded: quantity,
    totalCost,
    newBalance: (shareAccount.balance || 0) + quantity,
  };
}

/**
/**
 * Real-time notifications and alerts for member (Credit, Debit, Loans, Shares, and System Alerts)
 */
export interface NotificationFeedQuery {
  search?: string;
  type?: string;
  page?: number;
  limit?: number;
}

export async function getMemberNotificationsFeed(
  userId: string,
  queryMemberId?: string,
  query?: NotificationFeedQuery
) {
  const member = await resolveMemberForUser(userId, queryMemberId);

  // Fetch recent savings txns, dividend postings, loan updates, notifications, and system alerts
  const [recentSavings, recentDividends, recentLoans, rawNotifications, rawSystemAlerts] = await Promise.all([
    prisma.savingsTxn.findMany({
      where: { account: { memberId: member.id } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { account: { include: { product: true } } },
    }),
    prisma.dividendPayout.findMany({
      where: { memberId: member.id },
      orderBy: { postedAt: 'desc' },
      take: 20,
    }),
    prisma.loan.findMany({
      where: { memberId: member.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { loanProduct: true },
    }),
    prisma.notification.findMany({
      where: { memberId: member.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.systemAlert.findMany({
      where: {
        OR: [
          { memberId: member.id },
          ...(member.userId ? [{ userId: member.userId }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);

  const feed: any[] = [];
  const seenTxnIds = new Set<string>();

  // 1. Transaction Credit/Debit Alerts (Always reliable from real-time core banking transactions)
  for (const s of recentSavings) {
    seenTxnIds.add(s.id);
    const isDeposit = s.type === 'deposit';
    feed.push({
      id: s.id,
      type: isDeposit ? 'SAVINGS_DEPOSIT' : 'SAVINGS_WITHDRAWAL',
      direction: isDeposit ? 'credit' : 'debit',
      title: isDeposit ? 'Deposit Credited (ገቢ ሂሳብ)' : 'Withdrawal Debited (ወጪ ሂሳብ)',
      message: `${Number(s.amount).toLocaleString('en-ET', { minimumFractionDigits: 2 })} ETB ${isDeposit ? 'credited to' : 'debited from'} ${s.account?.product?.name || 'Savings'} (${s.account?.accountNumber || 'Account'}). Receipt: ${s.receiptNo || 'System Recorded'}.`,
      amount: Number(s.amount),
      receiptNo: s.receiptNo || '—',
      accountNumber: s.account?.accountNumber,
      productName: s.account?.product?.name,
      date: s.txnDate || s.createdAt,
      createdAt: s.createdAt || s.txnDate,
      channel: 'SMS & EMAIL & IN-APP',
      status: 'DELIVERED',
      severity: isDeposit ? 'success' : 'info',
      isRead: true,
    });
  }

  // 2. Outbound Dispatched Notifications (SMS/Email channel records)
  for (const n of rawNotifications) {
    let payload: any = {};
    try {
      payload = n.payload ? JSON.parse(n.payload) : {};
    } catch {
      payload = {};
    }

    // Skip if we already added this savings txn from real ledger
    if (payload.txnId && seenTxnIds.has(payload.txnId)) continue;

    const isCredit = n.triggerEvent?.includes('deposited') || n.triggerEvent?.includes('credit');
    const isDebit = n.triggerEvent?.includes('withdrawn') || n.triggerEvent?.includes('debit');

    feed.push({
      id: n.id,
      type: isCredit ? 'SAVINGS_DEPOSIT' : isDebit ? 'SAVINGS_WITHDRAWAL' : n.triggerEvent,
      direction: isCredit ? 'credit' : isDebit ? 'debit' : 'neutral',
      title: isCredit
        ? 'Deposit Alert (ገቢ ማሳወቂያ)'
        : isDebit
          ? 'Debit Alert (ወጪ ማሳወቂያ)'
          : `Alert: ${n.triggerEvent.replace('.', ' ').toUpperCase()}`,
      message: payload.amount
        ? `${Number(payload.amount).toLocaleString('en-ET', { minimumFractionDigits: 2 })} ETB transaction alert dispatched via ${n.channel.toUpperCase()}.`
        : `Notification event: ${n.triggerEvent}`,
      amount: payload.amount ? Number(payload.amount) : undefined,
      receiptNo: payload.receiptNo,
      accountNumber: payload.accountNumber,
      productName: payload.productName,
      balance: payload.balance != null ? Number(payload.balance) : undefined,
      date: n.createdAt,
      createdAt: n.createdAt,
      channel: n.channel.toUpperCase(),
      status: n.status === 'sent' ? 'DELIVERED' : n.status.toUpperCase(),
      severity: isCredit ? 'success' : 'info',
      isRead: true,
    });
  }

  // 3. System Alerts
  for (const a of rawSystemAlerts) {
    feed.push({
      id: a.id,
      type: 'SYSTEM_ALERT',
      direction: 'neutral',
      title: a.title,
      message: a.message,
      date: a.createdAt,
      createdAt: a.createdAt,
      channel: 'IN-APP',
      status: a.isRead ? 'READ' : 'UNREAD',
      severity: 'info',
      isRead: a.isRead,
    });
  }

  // 4. Dividends
  for (const d of recentDividends) {
    feed.push({
      id: d.id,
      type: 'DIVIDEND_PAYOUT',
      direction: 'credit',
      title: 'Dividend Declared & Paid (የትርፍ ክፍፍል)',
      message: `Dividend of ${Number(d.payoutAmount).toLocaleString('en-ET', { minimumFractionDigits: 2 })} ETB credited for ${d.shareBalance} shares.`,
      amount: Number(d.payoutAmount),
      date: d.postedAt || new Date(),
      createdAt: d.postedAt || new Date(),
      channel: 'IN-APP & CORE',
      status: 'DELIVERED',
      severity: 'success',
      isRead: true,
    });
  }

  // 5. Loans Status Updates
  for (const l of recentLoans) {
    feed.push({
      id: l.id,
      type: 'LOAN_STATUS_UPDATE',
      direction: 'neutral',
      title: `Loan ${l.status.toUpperCase()}`,
      message: `Your ${l.loanProduct?.name || 'Loan'} application for ${Number(l.principal).toLocaleString('en-ET', { minimumFractionDigits: 2 })} ETB is currently ${l.status.replace('_', ' ')}.`,
      amount: Number(l.principal),
      date: l.createdAt,
      createdAt: l.createdAt,
      channel: 'IN-APP',
      status: 'ACTIVE',
      severity: l.status === 'active' || l.status === 'approved' ? 'success' : 'info',
      isRead: true,
    });
  }

  // Deduplicate by ID
  const uniqueFeed = Array.from(new Map(feed.map((item) => [item.id, item])).values());

  // Sort descending by creation date
  uniqueFeed.sort((a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime());

  // Aggregate stats
  let totalCredits = 0;
  let totalDebits = 0;
  let unreadCount = 0;

  for (const item of uniqueFeed) {
    if (item.direction === 'credit' && item.amount) {
      totalCredits += item.amount;
    } else if (item.direction === 'debit' && item.amount) {
      totalDebits += item.amount;
    }
    if (item.isRead === false || item.status === 'UNREAD') {
      unreadCount++;
    }
  }

  // Apply filtering
  let filtered = uniqueFeed;
  const filterType = query?.type?.toLowerCase();
  if (filterType && filterType !== 'all') {
    if (filterType === 'credit') {
      filtered = filtered.filter((i) => i.direction === 'credit');
    } else if (filterType === 'debit') {
      filtered = filtered.filter((i) => i.direction === 'debit');
    } else if (filterType === 'system') {
      filtered = filtered.filter((i) => i.type === 'SYSTEM_ALERT');
    } else if (filterType === 'loan') {
      filtered = filtered.filter((i) => i.type?.includes('LOAN'));
    } else if (filterType === 'dividend') {
      filtered = filtered.filter((i) => i.type?.includes('DIVIDEND'));
    }
  }

  // Apply search
  if (query?.search && query.search.trim()) {
    const q = query.search.trim().toLowerCase();
    filtered = filtered.filter((i) => {
      const matchTitle = i.title?.toLowerCase().includes(q);
      const matchMsg = i.message?.toLowerCase().includes(q);
      const matchReceipt = i.receiptNo?.toLowerCase().includes(q);
      const matchAcc = i.accountNumber?.toLowerCase().includes(q);
      const matchProd = i.productName?.toLowerCase().includes(q);
      const matchAmt = i.amount?.toString().includes(q);
      return matchTitle || matchMsg || matchReceipt || matchAcc || matchProd || matchAmt;
    });
  }

  // Pagination
  const page = Math.max(1, query?.page || 1);
  const limit = Math.max(1, Math.min(100, query?.limit || 15));
  const total = filtered.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const startIndex = (page - 1) * limit;
  const paginatedItems = filtered.slice(startIndex, startIndex + limit);

  return {
    items: paginatedItems,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
    stats: {
      totalCredits,
      totalDebits,
      unreadCount,
      totalAlerts: uniqueFeed.length,
    },
  };
}
