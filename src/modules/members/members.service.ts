import bcrypt from 'bcryptjs';
import { NotFoundError, BusinessRuleError, ValidationError } from '../../shared/errors/app-error';
import { eventBus } from '../../shared/events/event-bus';
import * as membersRepo from './members.repository';
import type { AuthTokenPayload } from '@coop/types';
import { getPrimaryBranchId } from '../../shared/utils/branch.utils';
import { generateReceiptNo } from '../../shared/utils/receipt.utils';
import { prisma } from '../../config/prisma';
import {
  generateOtp,
  generateSecurityKeyphrase,
  formatEthiopianPhone,
  dispatchActivationCredentials,
} from '../../shared/utils/security.utils';

/**
 * Checks if Phone Number, Email, Fayda FAN (nationalId), or Fayda FIN (nationalIdFin)
 * is already in use by another member. Returns detailed conflicts if found.
 */
export async function checkFieldUniqueness(data: {
  phone?: string | null;
  email?: string | null;
  nationalId?: string | null;
  nationalIdFin?: string | null;
  excludeMemberId?: string;
}) {
  const conflicts: Array<{ field: string; message: string; existingMember: string }> = [];

  const cleanPhone = (data.phone || '').trim();
  const cleanEmail = (data.email || '').trim().toLowerCase();
  const cleanNationalId = (data.nationalId || '').trim();
  const cleanFin = (data.nationalIdFin || '').trim();

  // 1. Phone number uniqueness check
  if (cleanPhone) {
    const formatted = formatEthiopianPhone(cleanPhone) || cleanPhone;
    const digitsOnly = cleanPhone.replace(/\D/g, '');
    const phoneVariants = Array.from(
      new Set(
        [
          cleanPhone,
          formatted,
          digitsOnly,
          digitsOnly.startsWith('251') ? `0${digitsOnly.slice(3)}` : null,
          digitsOnly.startsWith('0') ? `+251${digitsOnly.slice(1)}` : null,
          digitsOnly.startsWith('0') ? `251${digitsOnly.slice(1)}` : null,
        ].filter(Boolean)
      )
    ) as string[];

    const existingPhone = await prisma.member.findFirst({
      where: {
        phone: { in: phoneVariants },
        ...(data.excludeMemberId ? { id: { not: data.excludeMemberId } } : {}),
      },
      select: { id: true, memberCode: true, fullName: true, phone: true },
    });

    if (existingPhone) {
      conflicts.push({
        field: 'phone',
        message: `Phone number "${cleanPhone}" is already registered to ${existingPhone.fullName} (${existingPhone.memberCode}). Each member must have a unique phone number.`,
        existingMember: `${existingPhone.fullName} (${existingPhone.memberCode})`,
      });
    }
  }

  // 2. Email uniqueness check
  if (cleanEmail) {
    const existingEmail = await prisma.member.findFirst({
      where: {
        email: cleanEmail,
        ...(data.excludeMemberId ? { id: { not: data.excludeMemberId } } : {}),
      },
      select: { id: true, memberCode: true, fullName: true, email: true },
    });

    if (existingEmail) {
      conflicts.push({
        field: 'email',
        message: `Email "${cleanEmail}" is already registered to ${existingEmail.fullName} (${existingEmail.memberCode}). Each member must have a unique email address.`,
        existingMember: `${existingEmail.fullName} (${existingEmail.memberCode})`,
      });
    }
  }

  // 3. Fayda FAN (National ID) uniqueness check
  if (cleanNationalId) {
    const existingNationalId = await prisma.member.findFirst({
      where: {
        nationalId: cleanNationalId,
        ...(data.excludeMemberId ? { id: { not: data.excludeMemberId } } : {}),
      },
      select: { id: true, memberCode: true, fullName: true, nationalId: true },
    });

    if (existingNationalId) {
      conflicts.push({
        field: 'nationalId',
        message: `Fayda FAN / National ID "${cleanNationalId}" is already registered to ${existingNationalId.fullName} (${existingNationalId.memberCode}). Each member must have a unique National ID.`,
        existingMember: `${existingNationalId.fullName} (${existingNationalId.memberCode})`,
      });
    }
  }

  // 4. Fayda FIN uniqueness check
  if (cleanFin) {
    const existingFin = await prisma.member.findFirst({
      where: {
        nationalIdFin: cleanFin,
        ...(data.excludeMemberId ? { id: { not: data.excludeMemberId } } : {}),
      },
      select: { id: true, memberCode: true, fullName: true, nationalIdFin: true },
    });

    if (existingFin) {
      conflicts.push({
        field: 'nationalIdFin',
        message: `Fayda FIN "${cleanFin}" is already registered to ${existingFin.fullName} (${existingFin.memberCode}). Each member must have a unique FIN number.`,
        existingMember: `${existingFin.fullName} (${existingFin.memberCode})`,
      });
    }
  }

  return {
    isUnique: conflicts.length === 0,
    conflicts,
  };
}

export async function validateMemberUniqueness(data: {
  phone?: string | null;
  email?: string | null;
  nationalId?: string | null;
  nationalIdFin?: string | null;
  excludeMemberId?: string;
}) {
  const check = await checkFieldUniqueness(data);
  if (!check.isUnique && check.conflicts.length > 0) {
    const first = check.conflicts[0];
    throw new ValidationError(first.message);
  }
}

export async function createMember(input: any, creatorId?: string) {
  let focalAgentId = input.focalAgentId;
  if (!focalAgentId && creatorId) {
    const focalAgent = await prisma.focalAgent.findUnique({ where: { userId: creatorId } });
    if (focalAgent) focalAgentId = focalAgent.id;
  }

  const branchId =
    input.branchId ||
    (creatorId ? await getPrimaryBranchId(creatorId) : null) ||
    (await prisma.branch.findFirst())?.id;

  // Extract non-member-table attributes
  const {
    createAccount,
    createUserAccount,
    createPortalAccount,
    userEmail,
    userPassword,
    documents,
    ...pureMemberData
  } = input;

  // Enforce strict uniqueness for member phone, email, Fayda FAN (nationalId), and Fayda FIN (nationalIdFin)
  await validateMemberUniqueness({
    phone: input.phone || pureMemberData.phone,
    email: input.email || pureMemberData.email,
    nationalId: input.nationalId || pureMemberData.nationalId,
    nationalIdFin: input.nationalIdFin || pureMemberData.nationalIdFin,
  });

  // 1. Optional Member Self-Service Portal User Account Creation
  let createdUserId: string | null = null;
  let provisionedAccountDetails: any = null;
  let activationCode: string | null = null;
  let activationExpiresAt: Date | null = null;
  let securityKeyphrase: string | null = null;

  // Portal login identifier can be phone number, email, or custom username
  const rawIdentifier = (userEmail || input.email || input.phone || '').trim();
  const rawPhone = input.phone || (rawIdentifier.match(/^\+?[0-9]{9,15}$/) ? rawIdentifier : null);
  const formattedPhone = formatEthiopianPhone(rawPhone);

  // Determine target email for DB User record
  let targetEmail = '';
  if (rawIdentifier.includes('@')) {
    targetEmail = rawIdentifier.toLowerCase();
  } else if (input.email && input.email.includes('@')) {
    targetEmail = input.email.trim().toLowerCase();
  } else if (formattedPhone) {
    const cleanDigits = formattedPhone.replace(/\D/g, '');
    targetEmail = `${cleanDigits}@member.coop.et`;
  } else {
    const cleanUsername = rawIdentifier.replace(/[^a-zA-Z0-9._-]/g, '') || `member_${Date.now()}`;
    targetEmail = `${cleanUsername}@member.coop.et`;
  }

  const shouldCreateUser = Boolean(
    (createAccount || createUserAccount || createPortalAccount || userPassword) &&
      userPassword
  );

  if (shouldCreateUser) {
    try {
      activationCode = generateOtp(6);
      activationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      securityKeyphrase = generateSecurityKeyphrase();

      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { email: targetEmail },
            ...(formattedPhone ? [{ phone: formattedPhone }] : []),
          ],
        },
      });

      if (!existingUser) {
        let memberRole = await prisma.role.findUnique({ where: { slug: 'member' } });
        if (!memberRole) {
          memberRole = await prisma.role.create({
            data: {
              name: 'Member',
              slug: 'member',
              description: 'Cooperative Member Self-Service Portal Access',
              isSystem: true,
            },
          });
        }
        const passwordHash = await bcrypt.hash(userPassword, 10);
        const resolvedFullName =
          input.fullName ||
          `${input.firstName || ''} ${input.lastName || ''}`.trim() ||
          rawIdentifier;

        const is2FA = input.require2FA !== false; // default enabled for high security

        const newUser = await prisma.user.create({
          data: {
            email: targetEmail,
            passwordHash,
            fullName: resolvedFullName,
            phone: formattedPhone || input.phone || null,
            roleId: memberRole.id,
            isActive: true,
            mustChangePassword: false,
            isPhoneVerified: false,
            isEmailVerified: false,
            verificationStatus: 'pending_activation',
            activationCode,
            activationExpiresAt,
            isTwoFactorEnabled: is2FA,
            twoFactorType: 'otp',
            securityKeyphrase,
          },
        });
        createdUserId = newUser.id;

        // Dispatch activation SMS & Email
        if (input.sendVerificationCode !== false) {
          dispatchActivationCredentials({
            phone: formattedPhone || input.phone,
            email: targetEmail.endsWith('@member.coop.et') ? (input.email || null) : targetEmail,
            fullName: resolvedFullName,
            code: activationCode,
            keyphrase: securityKeyphrase,
            portalUsername: rawIdentifier || formattedPhone || targetEmail,
          }).catch((e) => console.warn('Failed async dispatch of activation credentials:', e));
        }

        provisionedAccountDetails = {
          userId: newUser.id,
          username: rawIdentifier || formattedPhone || targetEmail,
          email: targetEmail,
          phone: formattedPhone || input.phone,
          activationCode,
          securityKeyphrase,
          isTwoFactorEnabled: is2FA,
          verificationStatus: 'pending_activation',
        };
      } else {
        createdUserId = existingUser.id;
      }
    } catch (err) {
      console.warn('Failed to auto-provision member user account:', err);
    }
  }

  // Resolve valid createdBy user ID
  let validCreatedBy = creatorId;
  if (!validCreatedBy) {
    validCreatedBy = createdUserId || (await prisma.user.findFirst())?.id || '00000000-0000-0000-0000-000000000000';
  }

  const memberCode =
    input.memberCode ||
    input.memberNumber ||
    `MEM-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;

  const resolvedFullName =
    pureMemberData.fullName ||
    `${pureMemberData.firstName || ''} ${pureMemberData.lastName || ''}`.trim() ||
    'Member';

  let resolvedGender: 'm' | 'f' | null = null;
  if (input.gender) {
    const g = String(input.gender).toLowerCase().trim();
    if (g === 'male' || g === 'm') resolvedGender = 'm';
    else if (g === 'female' || g === 'f') resolvedGender = 'f';
  }

  let resolvedMarital: any = null;
  if (input.maritalStatus) {
    const m = String(input.maritalStatus).toLowerCase().trim();
    if (['single', 'married', 'divorced', 'widowed'].includes(m)) {
      resolvedMarital = m;
    }
  }

  let resolvedStatus: any = 'active';
  if (input.status) {
    const s = String(input.status).toLowerCase().trim();
    if (['active', 'suspended', 'exited'].includes(s)) {
      resolvedStatus = s;
    }
  }

  const memberData = {
    memberCode,
    fullName: resolvedFullName,
    fullNameAmharic: input.fullNameAmharic || null,
    phone: input.phone || '+251900000000',
    email: input.email || null,
    nationalId: input.nationalId || null,
    nationalIdFin: input.nationalIdFin || null,
    nationalIdFrontUrl: input.nationalIdFrontUrl || null,
    nationalIdBackUrl: input.nationalIdBackUrl || null,
    nationalIdIssueDate: input.nationalIdIssueDate ? new Date(input.nationalIdIssueDate) : null,
    nationalIdExpiry: input.nationalIdExpiry ? new Date(input.nationalIdExpiry) : null,
    address: input.address || null,
    region: input.region || null,
    zone: input.zone || null,
    woreda: input.woreda || null,
    kebele: input.kebele || null,
    houseNumber: input.houseNumber || null,
    gender: resolvedGender,
    dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
    qualification: input.qualification || input.education || null,
    maritalStatus: resolvedMarital,
    familyMembers: input.familyMembers != null ? Number(input.familyMembers) : 0,
    birthPlace: input.birthPlace || null,
    occupation: input.occupation || null,
    employer: input.employer || null,
    monthlyIncome: input.monthlyIncome != null ? Number(input.monthlyIncome) : null,
    emergencyContactName: input.emergencyContactName || null,
    emergencyContactPhone: input.emergencyContactPhone || null,
    emergencyContactRelation: input.emergencyContactRelation || null,
    kycLevel: input.kycLevel || 'LEVEL_1',
    kycStatus: input.kycStatus || 'VERIFIED',
    isPhoneVerified: false,
    isEmailVerified: false,
    activationCode,
    activationExpiresAt,
    securityKeyphrase,
    registrationFee: input.registrationFee != null ? Number(input.registrationFee) : 0,
    joinDate: input.joinDate ? new Date(input.joinDate) : new Date(),
    status: resolvedStatus,
    branchId: branchId || null,
    focalAgentId: focalAgentId || null,
    userId: createdUserId || null,
    createdBy: validCreatedBy,
  };

  const member = await membersRepo.create(memberData as any);

  // 2. Attach any uploaded documents
  if (Array.isArray(documents) && documents.length > 0) {
    for (const doc of documents) {
      const fileName = doc.fileName || doc.title || 'document.png';
      const fileKey = doc.fileKey || doc.fileUrl || 'uploads/doc.png';
      if (fileName && fileKey) {
        try {
          await prisma.memberDocument.create({
            data: {
              memberId: member.id,
              docType: doc.docType || doc.type || 'national_id',
              fileName,
              fileKey,
              mimeType: doc.mimeType || 'image/png',
              fileSize: doc.fileSize || 1024,
              verificationStatus: doc.verificationStatus || 'verified',
            }
          });
        } catch (docErr) {
          console.warn('Error attaching member document:', docErr);
        }
      }
    }
  }

  eventBus.emit({ type: 'member.registered', payload: { memberId: member.id } });

  // Auto-record registration fee as a daily collection entry if > 0
  if (input.registrationFee > 0 && focalAgentId) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Find or create today's session
      let session = await prisma.dailyCollection.findFirst({
        where: { focalAgentId, collectionDate: today }
      });

      if (!session) {
        session = await prisma.dailyCollection.create({
          data: {
            focalAgentId,
            collectionDate: today,
            reconciled: false,
            totalCollected: 0,
            membersServed: 0,
          }
        });
      }

      // Record entry with receipt number
      const receiptNo = generateReceiptNo();
      await prisma.dailyCollectionEntry.create({
        data: {
          sessionId: session.id,
          memberId: member.id,
          registrationFee: input.registrationFee,
          totalAmount: input.registrationFee,
          receiptNo,
          recordedBy: creatorId,
          focalAgentId,
          branchId,
        }
      });

      // Update session totals
      await prisma.dailyCollection.update({
        where: { id: session.id },
        data: {
          totalCollected: { increment: input.registrationFee },
          membersServed: { increment: 1 }
        }
      });
    } catch (err) {
      console.error("Failed to auto-record registration fee", err);
    }
  }

  return {
    ...member,
    provisionedAccount: provisionedAccountDetails,
  };
}

export async function getMember(id: string) {
  const member = await membersRepo.findById(id);
  if (!member) throw new NotFoundError('Member');
  return member;
}

export async function updateMember(id: string, input: any) {
  const member = await membersRepo.findById(id);
  if (!member) throw new NotFoundError('Member');

  const {
    createAccount,
    userEmail,
    userPassword,
    documents,
    sendVerificationCode,
    generateKeyphrase,
    require2FA,
    id: _id,
    memberCode: _mc,
    focalAgent: _focalAgent,
    savingsAccounts: _sa,
    loans: _loans,
    shareAccount: _sha,
    user: _user,
    createdAt: _ca,
    updatedAt: _ua,
    createdBy: _cb,
    ...pureMemberData
  } = input;

  // Enforce strict uniqueness for member phone, email, Fayda FAN, and Fayda FIN on update
  await validateMemberUniqueness({
    phone: pureMemberData.phone,
    email: pureMemberData.email,
    nationalId: pureMemberData.nationalId,
    nationalIdFin: pureMemberData.nationalIdFin,
    excludeMemberId: id,
  });

  // Sanitize empty string dates and relations for Prisma
  if (pureMemberData.joinDate) {
    pureMemberData.joinDate = new Date(pureMemberData.joinDate);
  }
  if (pureMemberData.dateOfBirth) {
    pureMemberData.dateOfBirth = new Date(pureMemberData.dateOfBirth);
  } else if (pureMemberData.dateOfBirth === '') {
    pureMemberData.dateOfBirth = null;
  }
  if (pureMemberData.nationalIdExpiry) {
    pureMemberData.nationalIdExpiry = new Date(pureMemberData.nationalIdExpiry);
  } else if (pureMemberData.nationalIdExpiry === '') {
    pureMemberData.nationalIdExpiry = null;
  }
  if (pureMemberData.nationalIdIssueDate) {
    pureMemberData.nationalIdIssueDate = new Date(pureMemberData.nationalIdIssueDate);
  } else if (pureMemberData.nationalIdIssueDate === '') {
    pureMemberData.nationalIdIssueDate = null;
  }
  if (pureMemberData.branchId === '') {
    pureMemberData.branchId = null;
  }
  if (pureMemberData.focalAgentId === '') {
    pureMemberData.focalAgentId = null;
  }
  if (pureMemberData.familyMembers !== undefined && pureMemberData.familyMembers !== null) {
    pureMemberData.familyMembers = Number(pureMemberData.familyMembers);
  }
  if (pureMemberData.monthlyIncome !== undefined && pureMemberData.monthlyIncome !== null) {
    pureMemberData.monthlyIncome = Number(pureMemberData.monthlyIncome);
  }
  if (pureMemberData.registrationFee !== undefined && pureMemberData.registrationFee !== null) {
    pureMemberData.registrationFee = Number(pureMemberData.registrationFee);
  }

  if (userPassword && (userEmail || member.email)) {
    try {
      const email = (userEmail || member.email)!.trim().toLowerCase();
      let user = member.userId ? await prisma.user.findUnique({ where: { id: member.userId } }) : null;
      if (!user) {
        user = await prisma.user.findUnique({ where: { email } });
      }
      if (!user && (pureMemberData.phone || member.phone)) {
        const phoneToMatch = pureMemberData.phone || member.phone;
        user = await prisma.user.findFirst({
          where: {
            OR: [
              { phone: phoneToMatch },
              { email: phoneToMatch },
            ]
          }
        });
      }
      const passwordHash = await bcrypt.hash(userPassword, 10);
      if (user) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            passwordHash,
            isActive: true,
            phone: pureMemberData.phone || member.phone || user.phone,
          }
        });
        pureMemberData.userId = user.id;
      } else {
        let memberRole = await prisma.role.findUnique({ where: { slug: 'member' } });
        if (!memberRole) {
          memberRole = await prisma.role.create({
            data: { name: 'Member', slug: 'member', description: 'Member Portal Access', isSystem: true }
          });
        }
        const newUser = await prisma.user.create({
          data: {
            email,
            passwordHash,
            fullName: pureMemberData.fullName || member.fullName,
            phone: pureMemberData.phone || member.phone,
            roleId: memberRole.id,
            isActive: true,
          }
        });
        pureMemberData.userId = newUser.id;
      }
    } catch (uErr) {
      console.warn('Could not update user account for member:', uErr);
    }
  }

  return membersRepo.update(id, pureMemberData);
}

export async function updateStatus(id: string, status: 'active' | 'suspended' | 'exited') {
  const member = await membersRepo.findById(id);
  if (!member) throw new NotFoundError('Member');
  if (member.status === 'exited') throw new BusinessRuleError('Exited members cannot be reactivated');
  return membersRepo.update(id, { status });
}

export async function getMemberSummary(id: string) {
  const member = await membersRepo.findByIdWithDetails(id);
  if (!member) throw new NotFoundError('Member');

  // Compute savings balance per account
  const savingsWithBalance = await Promise.all(
    member.savingsAccounts.map(async (acc: any) => {
      const deposits = acc.txns.filter((t: any) => t.type === 'deposit').reduce((s: number, t: any) => s + Number(t.amount), 0);
      const withdrawals = acc.txns.filter((t: any) => t.type === 'withdrawal').reduce((s: number, t: any) => s + Number(t.amount), 0);
      return { ...acc, balance: parseFloat((deposits - withdrawals).toFixed(2)) };
    })
  );

  return { ...member, savingsAccounts: savingsWithBalance };
}

export async function listMembers(input: {
  query?: string;
  focalAgentId?: string;
  status?: string;
  page: number;
  limit: number;
  branchIds?: string[] | null;
}, user?: AuthTokenPayload) {
  const { data, total } = await membersRepo.search({
    query: input.query,
    focalAgentId: input.focalAgentId,
    status: input.status,
    skip: (input.page - 1) * input.limit,
    take: input.limit,
    branchIds: input.branchIds,
  });

  return {
    data,
    meta: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.ceil(total / input.limit),
      hasNextPage: input.page * input.limit < total,
      hasPrevPage: input.page > 1,
    },
  };
}

export async function getMember360Portfolio(memberId: string) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: {
      focalAgent: true,
      documents: true,
      savingsAccounts: {
        include: { product: true, txns: true }
      },
      loans: {
        include: { loanProduct: true }
      },
      shareAccount: true,
      guaranteedLoans: {
        where: { status: 'active' },
        include: { loan: { include: { member: true } } }
      }
    }
  });

  if (!member) throw new NotFoundError('Member');

  // Compute savings account balances
  let totalSavingsBalance = 0;
  const savingsAccounts = member.savingsAccounts.map((acc: any) => {
    const deposits = acc.txns.filter((t: any) => t.type === 'deposit').reduce((sum: number, t: any) => sum + Number(t.amount), 0);
    const withdrawals = acc.txns.filter((t: any) => t.type === 'withdrawal').reduce((sum: number, t: any) => sum + Number(t.amount), 0);
    const balance = parseFloat((deposits - withdrawals).toFixed(2));
    totalSavingsBalance += balance;
    return {
      id: acc.id,
      productName: acc.product.name,
      accountNumber: acc.accountNumber,
      type: acc.product.type,
      balance
    };
  });

  // Compute loan liabilities
  let totalLoanOutstanding = 0;
  const activeLoans = member.loans
    .filter((l: any) => ['active', 'pending', 'pending_approval'].includes(l.status))
    .map((l: any) => {
      const outstanding = Number(l.outstanding);
      totalLoanOutstanding += outstanding;
      return {
        id: l.id,
        productName: l.loanProduct.name,
        principal: Number(l.principal),
        outstanding,
        status: l.status,
        dueDate: l.dueDate
      };
    });

  // Get share config to evaluate minimum thresholds
  const shareConfig = await prisma.shareConfig.findFirst() || { sharePrice: 10, minPerMember: 1 };
  const shareBalance = member.shareAccount?.balance || 0;
  const sharePrice = Number(shareConfig.sharePrice);
  const totalEquityValue = shareBalance * sharePrice;
  const minThreshold = shareConfig.minPerMember;
  const isCompliant = shareBalance >= minThreshold;

  // Guarantor Exposure Locks
  let totalGuaranteedAmount = 0;
  const activeCommitments = member.guaranteedLoans.map((g: any) => {
    const amount = Number(g.guaranteedAmount);
    totalGuaranteedAmount += amount;
    return {
      id: g.id,
      loanId: g.loanId,
      borrowerName: g.loan.member.fullName,
      guaranteedAmount: amount,
      lockedSavingsAccount: g.lockedSavingsAccountId,
      status: g.status,
      createdAt: g.createdAt
    };
  });

  return {
    member: {
      id: member.id,
      memberCode: member.memberCode,
      fullName: member.fullName,
      phone: member.phone,
      email: member.email,
      nationalId: member.nationalId,
      address: member.address,
      status: member.status,
      joinDate: member.joinDate,
      registrationFee: Number(member.registrationFee),
      createdBy: member.createdBy,
      createdAt: member.createdAt,
      focalAgent: member.focalAgent
    },
    documents: member.documents,
    savings: {
      totalBalance: parseFloat(totalSavingsBalance.toFixed(2)),
      accounts: savingsAccounts
    },
    loans: {
      totalOutstanding: parseFloat(totalLoanOutstanding.toFixed(2)),
      activeLoans
    },
    shares: {
      balance: shareBalance,
      sharePrice,
      totalEquityValue: parseFloat(totalEquityValue.toFixed(2)),
      minThreshold,
      isCompliant
    },
    guarantorLocks: {
      totalGuaranteedAmount: parseFloat(totalGuaranteedAmount.toFixed(2)),
      activeCommitments
    }
  };
}

