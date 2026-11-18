import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { prisma } from '../../config/prisma';
import { resolveUploadDir } from '../../shared/utils/upload.utils';

export interface CmsPaginationQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  category?: string;
  city?: string;
  isPublished?: boolean;
  isActive?: boolean;
}

export class CmsService {
  // ─── Dashboard Overview Stats ──────────────────────────────────────────────
  async getOverviewStats() {
    const [
      totalArticles,
      publishedArticles,
      totalInquiries,
      pendingInquiries,
      totalApplications,
      pendingApplications,
      activeBanners,
      activeBranches,
      recentApplications,
      recentInquiries,
    ] = await Promise.all([
      prisma.websiteArticle.count(),
      prisma.websiteArticle.count({ where: { isPublished: true } }),
      prisma.websiteInquiry.count(),
      prisma.websiteInquiry.count({ where: { status: 'pending' } }),
      prisma.websiteMembershipApplication.count(),
      prisma.websiteMembershipApplication.count({ where: { status: 'received' } }),
      prisma.websiteBanner.count({ where: { isActive: true } }),
      prisma.websiteBranch.count({ where: { isActive: true } }),
      prisma.websiteMembershipApplication.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      prisma.websiteInquiry.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    return {
      articles: { total: totalArticles, published: publishedArticles },
      inquiries: { total: totalInquiries, pending: pendingInquiries },
      applications: { total: totalApplications, pending: pendingApplications },
      banners: { active: activeBanners },
      branches: { active: activeBranches },
      recentApplications,
      recentInquiries,
    };
  }

  // ─── Articles CMS ─────────────────────────────────────────────────────────
  async listArticles(query: CmsPaginationQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.category && query.category !== 'all') {
      where.category = query.category;
    }
    if (query.isPublished !== undefined) {
      where.isPublished = query.isPublished;
    }
    if (query.search && query.search.trim()) {
      const search = query.search.trim();
      where.OR = [
        { title: { contains: search } },
        { summary: { contains: search } },
        { tags: { contains: search } },
        { author: { contains: search } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.websiteArticle.count({ where }),
      prisma.websiteArticle.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data: items,
      meta: { total, page, limit, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
    };
  }

  async createArticle(data: {
    title: string;
    summary: string;
    content: string;
    category?: string;
    coverImageUrl?: string;
    author?: string;
    isPublished?: boolean;
    isFeatured?: boolean;
    tags?: string;
  }) {
    if (!data.title || !data.summary || !data.content) {
      throw new Error('Title, summary, and content are required.');
    }

    const baseSlug = data.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const slug = `${baseSlug || 'article'}-${randomSuffix}`;

    return prisma.websiteArticle.create({
      data: {
        slug,
        title: data.title.trim(),
        summary: data.summary.trim(),
        content: data.content.trim(),
        category: data.category || 'news',
        coverImageUrl: data.coverImageUrl?.trim() || null,
        author: data.author?.trim() || 'Efoyta SACCO',
        isPublished: data.isPublished !== undefined ? data.isPublished : true,
        isFeatured: data.isFeatured || false,
        publishedAt: data.isPublished ? new Date() : null,
        tags: data.tags?.trim() || null,
      },
    });
  }

  async updateArticle(id: string, data: Partial<{
    title: string;
    summary: string;
    content: string;
    category: string;
    coverImageUrl: string;
    author: string;
    isPublished: boolean;
    isFeatured: boolean;
    tags: string;
  }>) {
    const existing = await prisma.websiteArticle.findUnique({ where: { id } });
    if (!existing) throw new Error('Article not found.');

    const updateData: any = { ...data };
    if (data.isPublished !== undefined && data.isPublished && !existing.publishedAt) {
      updateData.publishedAt = new Date();
    }

    return prisma.websiteArticle.update({
      where: { id },
      data: updateData,
    });
  }

  async deleteArticle(id: string) {
    return prisma.websiteArticle.delete({ where: { id } });
  }

  // ─── Membership Applications (Leads) CMS ──────────────────────────────────
  async listApplications(query: CmsPaginationQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.status && query.status !== 'all') {
      where.status = query.status;
    }
    if (query.city && query.city !== 'all') {
      where.city = { contains: query.city };
    }
    if (query.search && query.search.trim()) {
      const search = query.search.trim();
      where.OR = [
        { fullName: { contains: search } },
        { phone: { contains: search } },
        { applicationNumber: { contains: search } },
        { email: { contains: search } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.websiteMembershipApplication.count({ where }),
      prisma.websiteMembershipApplication.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data: items,
      meta: { total, page, limit, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
    };
  }

  async updateApplicationStatus(
    id: string,
    data: { status: string; notes?: string; rejectionReason?: string; reviewedById?: string }
  ) {
    return prisma.websiteMembershipApplication.update({
      where: { id },
      data: {
        status: data.status,
        notes: data.notes,
        rejectionReason: data.rejectionReason,
        reviewedById: data.reviewedById,
      },
    });
  }

  async deleteApplication(id: string) {
    return prisma.websiteMembershipApplication.delete({ where: { id } });
  }

  // ─── Contact Inquiries CMS ────────────────────────────────────────────────
  async listInquiries(query: CmsPaginationQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.status && query.status !== 'all') {
      where.status = query.status;
    }
    if (query.search && query.search.trim()) {
      const search = query.search.trim();
      where.OR = [
        { fullName: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
        { subject: { contains: search } },
        { message: { contains: search } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.websiteInquiry.count({ where }),
      prisma.websiteInquiry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data: items,
      meta: { total, page, limit, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
    };
  }

  async updateInquiryStatus(id: string, data: { status: string; notes?: string }) {
    return prisma.websiteInquiry.update({
      where: { id },
      data: {
        status: data.status,
        notes: data.notes,
        resolvedAt: data.status === 'resolved' ? new Date() : null,
      },
    });
  }

  async deleteInquiry(id: string) {
    return prisma.websiteInquiry.delete({ where: { id } });
  }

  // ─── Hero Banners CMS ─────────────────────────────────────────────────────
  async listBanners() {
    return prisma.websiteBanner.findMany({
      orderBy: { orderIndex: 'asc' },
    });
  }

  async createBanner(data: {
    title: string;
    subtitle?: string;
    badge?: string;
    imageUrl?: string;
    videoUrl?: string;
    mediaType?: string;
    ctaText?: string;
    ctaLink?: string;
    secondaryCtaText?: string;
    secondaryCtaLink?: string;
    orderIndex?: number;
    isActive?: boolean;
  }) {
    if (!data.title) throw new Error('Banner title is required.');
    return prisma.websiteBanner.create({
      data: {
        title: data.title.trim(),
        subtitle: data.subtitle?.trim(),
        badge: data.badge?.trim(),
        imageUrl: data.imageUrl?.trim(),
        videoUrl: data.videoUrl?.trim(),
        mediaType: data.mediaType || 'image',
        ctaText: data.ctaText?.trim(),
        ctaLink: data.ctaLink?.trim(),
        secondaryCtaText: data.secondaryCtaText?.trim(),
        secondaryCtaLink: data.secondaryCtaLink?.trim(),
        orderIndex: Number(data.orderIndex) || 0,
        isActive: data.isActive !== undefined ? data.isActive : true,
      } as any,
    });
  }

  async updateBanner(id: string, data: any) {
    return prisma.websiteBanner.update({
      where: { id },
      data,
    });
  }

  async deleteBanner(id: string) {
    return prisma.websiteBanner.delete({ where: { id } });
  }

  // ─── File & Media Storage Upload ──────────────────────────────────────────
  async saveUploadedMedia(data: {
    fileName: string;
    fileData: string;
    folder?: string;
  }) {
    if (!data.fileData) throw new Error('File data is required.');

    const matches = data.fileData.match(/^data:([A-Za-z-+\/0-9.]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new Error('Invalid file format. Must be a base64 encoded data URI.');
    }

    const mimeType = matches[1].toLowerCase();
    const base64Buffer = Buffer.from(matches[2], 'base64');

    const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif'];
    const allowedVideoTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
    const isImage = allowedImageTypes.includes(mimeType);
    const isVideo = allowedVideoTypes.includes(mimeType);

    if (!isImage && !isVideo) {
      throw new Error(`Unsupported file type: ${mimeType}. Allowed formats are JPEG, PNG, WebP, SVG, MP4, WebM, MOV.`);
    }

    const maxSize = isVideo ? 60 * 1024 * 1024 : 15 * 1024 * 1024;
    if (base64Buffer.length > maxSize) {
      throw new Error(`File exceeds maximum allowed size of ${isVideo ? '60MB' : '15MB'}.`);
    }

    let ext = 'bin';
    if (mimeType === 'image/jpeg') ext = 'jpg';
    else if (mimeType === 'image/png') ext = 'png';
    else if (mimeType === 'image/webp') ext = 'webp';
    else if (mimeType === 'image/svg+xml') ext = 'svg';
    else if (mimeType === 'image/gif') ext = 'gif';
    else if (mimeType === 'video/mp4') ext = 'mp4';
    else if (mimeType === 'video/webm') ext = 'webm';
    else if (mimeType === 'video/quicktime') ext = 'mov';
    else if (mimeType === 'video/ogg') ext = 'ogv';

    const folder = (data.folder || 'banners').replace(/[^a-zA-Z0-9_-]/g, '');
    const targetDir = resolveUploadDir(folder);

    const safeBaseName = (data.fileName || 'upload')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 40);
    const uniqueName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeBaseName}.${ext}`;
    const filePath = path.join(targetDir, uniqueName);

    await fs.promises.writeFile(filePath, base64Buffer);

    const relativeUrl = `/uploads/${folder}/${uniqueName}`;
    const baseUrl = (
      process.env.PUBLIC_API_URL ||
      process.env.BASE_URL ||
      (process.env.NODE_ENV === 'production' ? 'https://api.corebanking.efoytasacco.com' : 'http://localhost:8015')
    ).replace(/\/+$/, '');
    const fullUrl = `${baseUrl}${relativeUrl}`;

    return {
      url: relativeUrl,
      fullUrl,
      fileName: uniqueName,
      originalName: data.fileName,
      mimeType,
      mediaType: isVideo ? 'video' : 'image',
      size: base64Buffer.length,
    };
  }

  // ─── Branches CMS ─────────────────────────────────────────────────────────
  async listBranches(query: CmsPaginationQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.city && query.city !== 'all') {
      where.city = { contains: query.city };
    }
    if (query.search && query.search.trim()) {
      const search = query.search.trim();
      where.OR = [
        { name: { contains: search } },
        { address: { contains: search } },
        { city: { contains: search } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.websiteBranch.count({ where }),
      prisma.websiteBranch.findMany({
        where,
        orderBy: [{ isHeadOffice: 'desc' }, { orderIndex: 'asc' }],
        skip,
        take: limit,
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data: items,
      meta: { total, page, limit, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
    };
  }

  async createBranch(data: any) {
    if (!data.name || !data.city || !data.address || !data.phone) {
      throw new Error('Name, city, address, and phone are required.');
    }
    return prisma.websiteBranch.create({
      data: {
        name: data.name.trim(),
        city: data.city.trim(),
        address: data.address.trim(),
        phone: data.phone.trim(),
        email: data.email?.trim() || null,
        managerName: data.managerName?.trim() || null,
        operatingHours: data.operatingHours?.trim() || 'Mon - Fri: 8:00 AM - 5:00 PM, Sat: 8:00 AM - 12:30 PM',
        isHeadOffice: data.isHeadOffice || false,
        latitude: data.latitude ? Number(data.latitude) : null,
        longitude: data.longitude ? Number(data.longitude) : null,
        orderIndex: Number(data.orderIndex) || 0,
        isActive: data.isActive !== undefined ? data.isActive : true,
      },
    });
  }

  async updateBranch(id: string, data: any) {
    return prisma.websiteBranch.update({
      where: { id },
      data,
    });
  }

  async deleteBranch(id: string) {
    return prisma.websiteBranch.delete({ where: { id } });
  }

  // ─── FAQs CMS ─────────────────────────────────────────────────────────────
  async listFaqs(query: CmsPaginationQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.category && query.category !== 'all') {
      where.category = query.category;
    }
    if (query.search && query.search.trim()) {
      const search = query.search.trim();
      where.OR = [
        { question: { contains: search } },
        { answer: { contains: search } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.websiteFaq.count({ where }),
      prisma.websiteFaq.findMany({
        where,
        orderBy: { orderIndex: 'asc' },
        skip,
        take: limit,
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data: items,
      meta: { total, page, limit, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
    };
  }

  async createFaq(data: { question: string; answer: string; category?: string; orderIndex?: number }) {
    if (!data.question || !data.answer) throw new Error('Question and answer are required.');
    return prisma.websiteFaq.create({
      data: {
        question: data.question.trim(),
        answer: data.answer.trim(),
        category: data.category || 'general',
        orderIndex: Number(data.orderIndex) || 0,
        isActive: true,
      },
    });
  }

  async updateFaq(id: string, data: any) {
    return prisma.websiteFaq.update({
      where: { id },
      data,
    });
  }

  async deleteFaq(id: string) {
    return prisma.websiteFaq.delete({ where: { id } });
  }

  // ─── Publications CMS ─────────────────────────────────────────────────────
  async listPublications(query: CmsPaginationQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.category && query.category !== 'all') {
      where.category = query.category;
    }
    if (query.search && query.search.trim()) {
      const search = query.search.trim();
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.websitePublication.count({ where }),
      prisma.websitePublication.findMany({
        where,
        orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data: items,
      meta: { total, page, limit, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
    };
  }

  async createPublication(data: any) {
    if (!data.title || !data.fileUrl) throw new Error('Title and file URL are required.');
    return prisma.websitePublication.create({
      data: {
        title: data.title.trim(),
        category: data.category || 'annual_report',
        description: data.description?.trim(),
        fileUrl: data.fileUrl.trim(),
        fileSize: data.fileSize?.trim(),
        year: data.year ? Number(data.year) : new Date().getFullYear(),
        isActive: true,
      },
    });
  }

  async updatePublication(id: string, data: any) {
    return prisma.websitePublication.update({
      where: { id },
      data,
    });
  }

  async deletePublication(id: string) {
    return prisma.websitePublication.delete({ where: { id } });
  }

  // ─── Settings CMS ─────────────────────────────────────────────────────────
  async listSettings() {
    return prisma.websiteSetting.findMany({
      orderBy: [{ group: 'asc' }, { key: 'asc' }],
    });
  }

  async saveSettingsBulk(settings: Record<string, string>, group: string = 'general') {
    const upserts = Object.entries(settings).map(([key, value]) =>
      prisma.websiteSetting.upsert({
        where: { key },
        create: { key, value: String(value), group },
        update: { value: String(value), group },
      })
    );
    return prisma.$transaction(upserts);
  }
}

export const cmsService = new CmsService();

