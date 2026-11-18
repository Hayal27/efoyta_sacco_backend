import { prisma } from '../../config/prisma';

// ── List / Search Guarantor Profiles ─────────────────────────────────────────

export async function listGuarantorProfiles(params: {
  query?: string;
  page?: number;
  limit?: number;
  status?: string;
}) {
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const skip = (page - 1) * limit;

  const where: any = {};
  if (params.status) where.status = params.status;
  if (params.query) {
    where.OR = [
      { fullName: { contains: params.query } },
      { phone: { contains: params.query } },
      { nationalId: { contains: params.query } },
      { email: { contains: params.query } },
      { employer: { contains: params.query } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.guarantorProfile.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        member: { select: { id: true, fullName: true, memberCode: true, phone: true, status: true } },
        _count: { select: { guarantors: true } },
      },
    }),
    prisma.guarantorProfile.count({ where }),
  ]);

  return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

// ── Get Single Guarantor Profile ──────────────────────────────────────────────

export async function getGuarantorProfile(id: string) {
  return prisma.guarantorProfile.findUnique({
    where: { id },
    include: {
      member: { select: { id: true, fullName: true, memberCode: true, phone: true, email: true, status: true } },
      guarantors: {
        include: {
          loan: {
            select: {
              id: true,
              principal: true,
              status: true,
              outstanding: true,
              createdAt: true,
              loanProduct: { select: { name: true } },
              member: { select: { fullName: true, memberCode: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
}

// ── Create Guarantor Profile ──────────────────────────────────────────────────

export async function createGuarantorProfile(data: {
  fullName: string;
  phone?: string;
  email?: string;
  nationalId?: string;
  address?: string;
  employer?: string;
  jobTitle?: string;
  gender?: string;
  dateOfBirth?: string;
  relation?: string;
  notes?: string;
  attachments?: any[];
  memberId?: string;
}) {
  return prisma.guarantorProfile.create({
    data: {
      fullName: data.fullName,
      phone: data.phone || null,
      email: data.email || null,
      nationalId: data.nationalId || null,
      address: data.address || null,
      employer: data.employer || null,
      jobTitle: data.jobTitle || null,
      gender: data.gender || null,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
      relation: data.relation || null,
      notes: data.notes || null,
      attachments: data.attachments || null,
      memberId: data.memberId || null,
    },
    include: {
      member: { select: { id: true, fullName: true, memberCode: true } },
    },
  });
}

// ── Update Guarantor Profile ──────────────────────────────────────────────────

export async function updateGuarantorProfile(id: string, data: any) {
  return prisma.guarantorProfile.update({
    where: { id },
    data: {
      fullName: data.fullName,
      phone: data.phone || null,
      email: data.email || null,
      nationalId: data.nationalId || null,
      address: data.address || null,
      employer: data.employer || null,
      jobTitle: data.jobTitle || null,
      gender: data.gender || null,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
      relation: data.relation || null,
      notes: data.notes || null,
      attachments: data.attachments ?? undefined,
      memberId: data.memberId || null,
      status: data.status || undefined,
    },
    include: {
      member: { select: { id: true, fullName: true, memberCode: true } },
    },
  });
}

// ── Delete Guarantor Profile ──────────────────────────────────────────────────

export async function deleteGuarantorProfile(id: string) {
  // Only allow if no active loan guarantors linked
  const activeCount = await prisma.guarantor.count({
    where: { guarantorProfileId: id, status: 'active' },
  });
  if (activeCount > 0) {
    throw new Error('Cannot delete a guarantor profile that is actively linked to loans.');
  }
  return prisma.guarantorProfile.delete({ where: { id } });
}
