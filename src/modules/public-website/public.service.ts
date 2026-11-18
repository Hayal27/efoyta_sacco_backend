import { prisma } from '../../config/prisma';

export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  city?: string;
  featured?: boolean;
}

export class PublicService {
  async getHomePayload() {
    const [banners, featuredArticles, branchesCount, faqs, settingsList] = await Promise.all([
      prisma.websiteBanner.findMany({
        where: { isActive: true },
        orderBy: { orderIndex: 'asc' },
      }),
      prisma.websiteArticle.findMany({
        where: { isPublished: true },
        orderBy: [{ isFeatured: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
        take: 6,
        select: {
          id: true,
          slug: true,
          title: true,
          summary: true,
          category: true,
          coverImageUrl: true,
          author: true,
          publishedAt: true,
          isFeatured: true,
          viewCount: true,
          tags: true,
          createdAt: true,
        },
      }),
      prisma.websiteBranch.count({ where: { isActive: true } }),
      prisma.websiteFaq.findMany({
        where: { isActive: true },
        orderBy: { orderIndex: 'asc' },
        take: 6,
      }),
      prisma.websiteSetting.findMany(),
    ]);

    const settingsMap: Record<string, string> = {};
    settingsList.forEach((s) => {
      settingsMap[s.key] = s.value;
    });

    return {
      banners,
      featuredArticles,
      branchesCount: branchesCount || 12,
      faqs,
      settings: settingsMap,
      stats: {
        activeMembers: settingsMap['stats_members'] || '45,800+',
        totalAssets: settingsMap['stats_assets'] || '1.45+ Billion ETB',
        loanDisbursed: settingsMap['stats_loans'] || '980+ Million ETB',
        annualDividendYield: settingsMap['stats_dividend'] || '18.5%',
        repaymentRate: settingsMap['stats_repayment'] || '99.4%',
        yearsOfService: settingsMap['stats_years'] || '15+ Years',
      },
    };
  }

  async getArticles(params: PaginationParams) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(params.limit) || 9));
    const skip = (page - 1) * limit;

    const where: any = {
      isPublished: true,
    };

    if (params.category && params.category !== 'all') {
      where.category = params.category;
    }

    if (params.featured !== undefined) {
      where.isFeatured = params.featured;
    }

    if (params.search && params.search.trim()) {
      const search = params.search.trim();
      where.OR = [
        { title: { contains: search } },
        { summary: { contains: search } },
        { tags: { contains: search } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.websiteArticle.count({ where }),
      prisma.websiteArticle.findMany({
        where,
        orderBy: [{ isFeatured: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
        select: {
          id: true,
          slug: true,
          title: true,
          summary: true,
          category: true,
          coverImageUrl: true,
          author: true,
          publishedAt: true,
          isFeatured: true,
          viewCount: true,
          tags: true,
          createdAt: true,
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data: items,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  async getArticleBySlug(slug: string) {
    const article = await prisma.websiteArticle.findUnique({
      where: { slug },
    });

    if (!article || !article.isPublished) {
      return null;
    }

    // Increment view count asynchronously
    prisma.websiteArticle
      .update({
        where: { id: article.id },
        data: { viewCount: { increment: 1 } },
      })
      .catch(() => {});

    // Fetch related articles
    const related = await prisma.websiteArticle.findMany({
      where: {
        isPublished: true,
        category: article.category,
        id: { not: article.id },
      },
      take: 3,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        slug: true,
        title: true,
        summary: true,
        category: true,
        coverImageUrl: true,
        publishedAt: true,
      },
    });

    return {
      ...article,
      related,
    };
  }

  async getBranches(params: { city?: string; search?: string }) {
    const where: any = { isActive: true };

    if (params.city && params.city !== 'all') {
      where.city = { contains: params.city };
    }

    if (params.search && params.search.trim()) {
      const search = params.search.trim();
      where.OR = [
        { name: { contains: search } },
        { address: { contains: search } },
        { city: { contains: search } },
      ];
    }

    return prisma.websiteBranch.findMany({
      where,
      orderBy: [{ isHeadOffice: 'desc' }, { orderIndex: 'asc' }, { name: 'asc' }],
    });
  }

  async getFaqs(params: { category?: string; search?: string }) {
    const where: any = { isActive: true };

    if (params.category && params.category !== 'all') {
      where.category = params.category;
    }

    if (params.search && params.search.trim()) {
      const search = params.search.trim();
      where.OR = [
        { question: { contains: search } },
        { answer: { contains: search } },
      ];
    }

    return prisma.websiteFaq.findMany({
      where,
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async getPublications(params: { category?: string; year?: number; search?: string }) {
    const where: any = { isActive: true };

    if (params.category && params.category !== 'all') {
      where.category = params.category;
    }

    if (params.year) {
      where.year = Number(params.year);
    }

    if (params.search && params.search.trim()) {
      const search = params.search.trim();
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
      ];
    }

    return prisma.websitePublication.findMany({
      where,
      orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async submitInquiry(data: {
    fullName: string;
    email: string;
    phone: string;
    subject: string;
    message: string;
    inquiryType?: string;
    ipAddress?: string;
  }) {
    if (!data.fullName || !data.email || !data.phone || !data.message) {
      throw new Error('All required contact fields (name, email, phone, message) must be provided.');
    }

    return prisma.websiteInquiry.create({
      data: {
        fullName: data.fullName.trim(),
        email: data.email.trim().toLowerCase(),
        phone: data.phone.trim(),
        subject: data.subject?.trim() || 'General Website Inquiry',
        message: data.message.trim(),
        inquiryType: data.inquiryType || 'general',
        ipAddress: data.ipAddress,
        status: 'pending',
      },
    });
  }

  async submitMembershipApplication(data: {
    fullName: string;
    phone: string;
    email?: string;
    nationalIdNumber?: string;
    city: string;
    preferredBranch?: string;
    occupation?: string;
    monthlyIncome?: number;
    productInterest?: string;
    initialDepositEstimate?: number;
  }) {
    if (!data.fullName || !data.phone || !data.city) {
      throw new Error('Full name, phone number, and city are mandatory for membership application.');
    }

    const cleanPhone = data.phone.trim();
    const cleanEmail = data.email?.trim().toLowerCase() || null;
    const cleanNationalId = data.nationalIdNumber?.trim() || null;

    // Check if an existing member account already exists with this phone, email, or National ID
    const existingMember = await prisma.member.findFirst({
      where: {
        OR: [
          { phone: cleanPhone },
          ...(cleanEmail ? [{ email: cleanEmail }] : []),
          ...(cleanNationalId ? [{ nationalId: cleanNationalId }] : []),
        ],
      },
      select: { fullName: true, memberCode: true, phone: true, email: true, nationalId: true },
    });

    if (existingMember) {
      if (existingMember.phone === cleanPhone) {
        throw new Error(
          `A member account with phone number "${cleanPhone}" already exists. Please log in to your existing account or contact support.`
        );
      }
      if (cleanEmail && existingMember.email === cleanEmail) {
        throw new Error(
          `A member account with email "${cleanEmail}" already exists. Please log in to your existing account.`
        );
      }
      if (cleanNationalId && existingMember.nationalId === cleanNationalId) {
        throw new Error(
          `A member account with National ID "${cleanNationalId}" already exists.`
        );
      }
    }

    // Generate unique tracking code: EFO-YYYY-XXXXX
    const year = new Date().getFullYear();
    const randomHex = Math.floor(10000 + Math.random() * 90000);
    const applicationNumber = `EFO-${year}-${randomHex}`;

    return prisma.websiteMembershipApplication.create({
      data: {
        applicationNumber,
        fullName: data.fullName.trim(),
        phone: data.phone.trim(),
        email: data.email?.trim().toLowerCase() || null,
        nationalIdNumber: data.nationalIdNumber?.trim() || null,
        city: data.city.trim(),
        preferredBranch: data.preferredBranch?.trim() || null,
        occupation: data.occupation?.trim() || null,
        monthlyIncome: data.monthlyIncome ? Number(data.monthlyIncome) : null,
        productInterest: data.productInterest || 'regular_savings',
        initialDepositEstimate: data.initialDepositEstimate ? Number(data.initialDepositEstimate) : null,
        status: 'received',
      },
    });
  }

  async trackApplication(applicationNumber: string) {
    if (!applicationNumber || !applicationNumber.trim()) {
      throw new Error('Application tracking number is required.');
    }

    const app = await prisma.websiteMembershipApplication.findUnique({
      where: { applicationNumber: applicationNumber.trim().toUpperCase() },
      select: {
        applicationNumber: true,
        fullName: true,
        city: true,
        preferredBranch: true,
        productInterest: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return app;
  }

  simulateLoan(params: {
    amount: number;
    termMonths: number;
    annualInterestRate: number;
    repaymentType?: 'amortized' | 'flat';
  }) {
    const principal = Number(params.amount) || 100000;
    const termMonths = Math.max(1, Math.min(120, Number(params.termMonths) || 12));
    const annualRate = Math.max(1, Math.min(40, Number(params.annualInterestRate) || 13.5));
    const type = params.repaymentType || 'amortized';

    const monthlyRate = annualRate / 100 / 12;
    let monthlyPayment = 0;
    let totalInterest = 0;
    const schedule: Array<{
      month: number;
      payment: number;
      principal: number;
      interest: number;
      balance: number;
    }> = [];

    if (type === 'amortized') {
      // EMI = P * r * (1 + r)^n / ((1 + r)^n - 1)
      const factor = Math.pow(1 + monthlyRate, termMonths);
      monthlyPayment = (principal * monthlyRate * factor) / (factor - 1);

      let balance = principal;
      for (let m = 1; m <= termMonths; m++) {
        const interestM = balance * monthlyRate;
        const principalM = monthlyPayment - interestM;
        balance = Math.max(0, balance - principalM);
        totalInterest += interestM;

        schedule.push({
          month: m,
          payment: Math.round(monthlyPayment * 100) / 100,
          principal: Math.round(principalM * 100) / 100,
          interest: Math.round(interestM * 100) / 100,
          balance: Math.round(balance * 100) / 100,
        });
      }
    } else {
      // Flat rate calculation
      totalInterest = principal * (annualRate / 100) * (termMonths / 12);
      const totalAmount = principal + totalInterest;
      monthlyPayment = totalAmount / termMonths;
      const principalPerMonth = principal / termMonths;
      const interestPerMonth = totalInterest / termMonths;

      let balance = principal;
      for (let m = 1; m <= termMonths; m++) {
        balance = Math.max(0, balance - principalPerMonth);
        schedule.push({
          month: m,
          payment: Math.round(monthlyPayment * 100) / 100,
          principal: Math.round(principalPerMonth * 100) / 100,
          interest: Math.round(interestPerMonth * 100) / 100,
          balance: Math.round(balance * 100) / 100,
        });
      }
    }

    const totalPayable = principal + totalInterest;

    return {
      principal: Math.round(principal * 100) / 100,
      termMonths,
      annualInterestRate: annualRate,
      monthlyPayment: Math.round(monthlyPayment * 100) / 100,
      totalInterest: Math.round(totalInterest * 100) / 100,
      totalPayable: Math.round(totalPayable * 100) / 100,
      schedule,
    };
  }

  async getSettings() {
    const settings = await prisma.websiteSetting.findMany();
    const map: Record<string, string> = {};
    settings.forEach((s) => {
      map[s.key] = s.value;
    });
    return map;
  }
}

export const publicService = new PublicService();

