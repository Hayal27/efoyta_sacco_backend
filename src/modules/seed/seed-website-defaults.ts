import crypto from 'crypto';
import { prisma } from '../../config/prisma';

export async function ensureWebsiteTablesExist() {
  const ddlStatements = [
    `CREATE TABLE IF NOT EXISTS website_articles (
      id CHAR(36) NOT NULL,
      slug VARCHAR(200) NOT NULL,
      title VARCHAR(255) NOT NULL,
      summary TEXT NOT NULL,
      content LONGTEXT NOT NULL,
      category VARCHAR(100) NOT NULL DEFAULT 'news',
      coverImageUrl VARCHAR(500) NULL,
      author VARCHAR(100) NOT NULL DEFAULT 'Efoyta SACCO',
      publishedAt DATETIME(3) NULL,
      isPublished BOOLEAN NOT NULL DEFAULT TRUE,
      isFeatured BOOLEAN NOT NULL DEFAULT FALSE,
      viewCount INT NOT NULL DEFAULT 0,
      tags VARCHAR(255) NULL,
      createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      UNIQUE INDEX website_articles_slug_key (slug)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS website_banners (
      id CHAR(36) NOT NULL,
      title VARCHAR(255) NOT NULL,
      subtitle TEXT NULL,
      badge VARCHAR(100) NULL,
      imageUrl VARCHAR(500) NULL,
      videoUrl VARCHAR(500) NULL,
      mediaType VARCHAR(20) NOT NULL DEFAULT 'image',
      ctaText VARCHAR(100) NULL,
      ctaLink VARCHAR(255) NULL,
      secondaryCtaText VARCHAR(100) NULL,
      secondaryCtaLink VARCHAR(255) NULL,
      orderIndex INT NOT NULL DEFAULT 0,
      isActive BOOLEAN NOT NULL DEFAULT TRUE,
      createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS website_inquiries (
      id CHAR(36) NOT NULL,
      fullName VARCHAR(200) NOT NULL,
      email VARCHAR(200) NOT NULL,
      phone VARCHAR(50) NOT NULL,
      subject VARCHAR(200) NOT NULL,
      message TEXT NOT NULL,
      inquiryType VARCHAR(50) NOT NULL DEFAULT 'general',
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      notes TEXT NULL,
      ipAddress VARCHAR(100) NULL,
      createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      resolvedAt DATETIME(3) NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS website_membership_applications (
      id CHAR(36) NOT NULL,
      applicationNumber VARCHAR(50) NOT NULL,
      fullName VARCHAR(200) NOT NULL,
      phone VARCHAR(50) NOT NULL,
      email VARCHAR(200) NULL,
      nationalIdNumber VARCHAR(100) NULL,
      city VARCHAR(100) NOT NULL,
      preferredBranch VARCHAR(150) NULL,
      occupation VARCHAR(150) NULL,
      monthlyIncome DECIMAL(15, 2) NULL,
      productInterest VARCHAR(100) NULL,
      initialDepositEstimate DECIMAL(15, 2) NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'received',
      rejectionReason TEXT NULL,
      notes TEXT NULL,
      reviewedById CHAR(36) NULL,
      createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      UNIQUE INDEX website_membership_applications_appNum_key (applicationNumber)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS website_faqs (
      id CHAR(36) NOT NULL,
      question VARCHAR(500) NOT NULL,
      answer TEXT NOT NULL,
      category VARCHAR(100) NOT NULL DEFAULT 'general',
      orderIndex INT NOT NULL DEFAULT 0,
      isActive BOOLEAN NOT NULL DEFAULT TRUE,
      createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS website_branches (
      id CHAR(36) NOT NULL,
      name VARCHAR(200) NOT NULL,
      city VARCHAR(100) NOT NULL,
      address VARCHAR(300) NOT NULL,
      phone VARCHAR(100) NOT NULL,
      email VARCHAR(150) NULL,
      managerName VARCHAR(150) NULL,
      operatingHours VARCHAR(255) NOT NULL DEFAULT 'Mon - Fri: 8:00 AM - 5:00 PM, Sat: 8:00 AM - 12:30 PM',
      isHeadOffice BOOLEAN NOT NULL DEFAULT FALSE,
      latitude DOUBLE NULL,
      longitude DOUBLE NULL,
      orderIndex INT NOT NULL DEFAULT 0,
      isActive BOOLEAN NOT NULL DEFAULT TRUE,
      createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS website_publications (
      id CHAR(36) NOT NULL,
      title VARCHAR(255) NOT NULL,
      category VARCHAR(100) NOT NULL DEFAULT 'annual_report',
      description TEXT NULL,
      fileUrl VARCHAR(500) NOT NULL,
      fileSize VARCHAR(50) NULL,
      year INT NULL,
      downloads INT NOT NULL DEFAULT 0,
      isActive BOOLEAN NOT NULL DEFAULT TRUE,
      createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS website_settings (
      id CHAR(36) NOT NULL,
      \`key\` VARCHAR(100) NOT NULL,
      value TEXT NOT NULL,
      \`group\` VARCHAR(50) NOT NULL DEFAULT 'general',
      updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      UNIQUE INDEX website_settings_key_key (\`key\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ];

  for (const sql of ddlStatements) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch {
      // Ignore if table already exists or minor error
    }
  }

  // Ensure new columns on website_banners exist if table pre-existed (checks information_schema first to prevent error noise)
  try {
    const existingCols: any[] = await prisma.$queryRawUnsafe(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'website_banners'`
    );
    const colNames = new Set((existingCols || []).map((c: any) => c.COLUMN_NAME));
    if (!colNames.has('videoUrl')) {
      await prisma.$executeRawUnsafe(`ALTER TABLE website_banners ADD COLUMN videoUrl VARCHAR(500) NULL`);
    }
    if (!colNames.has('mediaType')) {
      await prisma.$executeRawUnsafe(`ALTER TABLE website_banners ADD COLUMN mediaType VARCHAR(20) NOT NULL DEFAULT 'image'`);
    }
  } catch {}

  // Ensure unique constraints on members table if they don't already exist
  try {
    const existingIndexes: any[] = await prisma.$queryRawUnsafe(
      `SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'members'`
    );
    const idxNames = new Set((existingIndexes || []).map((i: any) => i.INDEX_NAME));

    const candidateIndexes = [
      { name: 'members_phone_key', sql: `ALTER TABLE members ADD UNIQUE INDEX members_phone_key (phone)` },
      { name: 'members_email_key', sql: `ALTER TABLE members ADD UNIQUE INDEX members_email_key (email)` },
      { name: 'members_nationalId_key', sql: `ALTER TABLE members ADD UNIQUE INDEX members_nationalId_key (nationalId)` },
      { name: 'members_nationalIdFin_key', sql: `ALTER TABLE members ADD UNIQUE INDEX members_nationalIdFin_key (nationalIdFin)` },
    ];

    for (const item of candidateIndexes) {
      if (!idxNames.has(item.name)) {
        try {
          await prisma.$executeRawUnsafe(item.sql);
        } catch {
          // If legacy DB contains duplicate rows, unique validation is strictly enforced in members.service.ts
        }
      }
    }
  } catch {}
}

export async function seedWebsiteDefaults() {
  try {
    // 1. Ensure all tables exist in the database
    await ensureWebsiteTablesExist();

    const bannersCount = await prisma.websiteBanner.count();
    if (bannersCount === 0) {
      console.info('[Public Website Service] Seeding default website banners with video & image promotions...');
      await prisma.websiteBanner.createMany({
        data: [
          {
            id: crypto.randomUUID(),
            title: 'Empowering Communities, Fueling Financial Growth',
            subtitle: 'Join over 45,000+ members building generational wealth with competitive savings dividends and accessible loan solutions across Ethiopia.',
            badge: '🌟 2026 Annual Dividend: 18.5% Distributed',
            mediaType: 'image',
            imageUrl: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=2000&q=85',
            ctaText: 'Open Member Account',
            ctaLink: '/membership',
            secondaryCtaText: 'Simulate Loan',
            secondaryCtaLink: '/calculators',
            orderIndex: 1,
            isActive: true,
          },
          {
            id: crypto.randomUUID(),
            title: 'Flexible Business & Agricultural Financing Solutions',
            subtitle: 'Watch how Efoyta SACCO fast-tracked credit facilities empower cooperatives, entrepreneurs, and farming enterprises with transparent terms and lowest fee structures.',
            badge: '⚡ Instant Loan Decisions within 48 Hours',
            mediaType: 'video',
            videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            imageUrl: 'https://images.unsplash.com/photo-1595974482597-4b8da8879bc5?auto=format&fit=crop&w=2000&q=85',
            ctaText: 'Explore Loan Products',
            ctaLink: '/products',
            secondaryCtaText: 'Watch Video Story',
            secondaryCtaLink: '#watch-video',
            orderIndex: 2,
            isActive: true,
          },
          {
            id: crypto.randomUUID(),
            title: 'Next-Generation Digital Cooperative Banking',
            subtitle: 'Track your deposits, request loans, and inspect your share equity directly from your mobile device anytime, anywhere.',
            badge: '📱 24/7 Self-Service Banking Portal',
            mediaType: 'image',
            imageUrl: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=2000&q=85',
            ctaText: 'Open Online Portal',
            ctaLink: 'http://localhost:5174',
            secondaryCtaText: 'Learn More',
            secondaryCtaLink: '/about',
            orderIndex: 3,
            isActive: true,
          },
        ] as any,
      });
    } else {
      // Refresh any legacy dark stock photo with vibrant, bright, high-clarity cooperative photography
      try {
        await prisma.websiteBanner.updateMany({
          where: {
            imageUrl: {
              contains: 'photo-1579621970563-ebec7560ff3e',
            },
          },
          data: {
            imageUrl: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=2000&q=85',
          },
        });
      } catch {}
    }

    const branchesCount = await prisma.websiteBranch.count();
    if (branchesCount === 0) {
      console.info('[Public Website Service] Seeding default branch directory...');
      await prisma.websiteBranch.createMany({
        data: [
          {
            id: crypto.randomUUID(),
            name: 'Headquarters & Bole Main Branch',
            city: 'Addis Ababa',
            address: 'Bole Medhanialem, Efoyta Tower, 4th Floor',
            phone: '+251 11 667 8901 / +251 911 234 567',
            email: 'bole@efoytasacco.com',
            managerName: 'Alemayehu Tadesse',
            operatingHours: 'Mon - Fri: 8:00 AM - 5:00 PM, Sat: 8:00 AM - 12:30 PM',
            isHeadOffice: true,
            orderIndex: 1,
            isActive: true,
          },
          {
            id: crypto.randomUUID(),
            name: 'Merkato Commercial Branch',
            city: 'Addis Ababa',
            address: 'Merkato, Military Tera, Commercial Center 2nd Floor',
            phone: '+251 11 278 4410',
            email: 'merkato@efoytasacco.com',
            managerName: 'Bethlehem Haile',
            operatingHours: 'Mon - Fri: 8:00 AM - 5:00 PM, Sat: 8:00 AM - 1:00 PM',
            isHeadOffice: false,
            orderIndex: 2,
            isActive: true,
          },
          {
            id: crypto.randomUUID(),
            name: 'Megenagna Hub',
            city: 'Addis Ababa',
            address: 'Megenagna Square, Zefmesh Grand Mall Suite 310',
            phone: '+251 11 661 1290',
            email: 'megenagna@efoytasacco.com',
            managerName: 'Dawit Getachew',
            operatingHours: 'Mon - Fri: 8:00 AM - 5:00 PM, Sat: 8:00 AM - 12:30 PM',
            isHeadOffice: false,
            orderIndex: 3,
            isActive: true,
          },
          {
            id: crypto.randomUUID(),
            name: 'Hawassa Regional Branch',
            city: 'Hawassa',
            address: 'Piazza Commercial Zone, Lake View Avenue',
            phone: '+251 46 220 8890',
            email: 'hawassa@efoytasacco.com',
            managerName: 'Selamawit Bekele',
            operatingHours: 'Mon - Fri: 8:00 AM - 5:00 PM, Sat: 8:00 AM - 12:30 PM',
            isHeadOffice: false,
            orderIndex: 4,
            isActive: true,
          },
          {
            id: crypto.randomUUID(),
            name: 'Adama Industrial Branch',
            city: 'Adama',
            address: 'Posta Bet Road, Near Central Bus Station',
            phone: '+251 22 111 4509',
            email: 'adama@efoytasacco.com',
            managerName: 'Kenenisa Tolosa',
            operatingHours: 'Mon - Fri: 8:00 AM - 5:00 PM, Sat: 8:00 AM - 12:30 PM',
            isHeadOffice: false,
            orderIndex: 5,
            isActive: true,
          },
        ] as any,
      });
    }

    const articlesCount = await prisma.websiteArticle.count();
    if (articlesCount === 0) {
      console.info('[Public Website Service] Seeding default public articles...');
      await prisma.websiteArticle.createMany({
        data: [
          {
            id: crypto.randomUUID(),
            slug: 'annual-general-meeting-declares-record-dividend',
            title: '15th Annual General Meeting Declares Record 18.5% Dividend for Members',
            summary: 'Efoyta SACCO concluded its landmark AGM celebrating unprecedented financial milestone with over 1.45 Billion ETB in total assets and dividend distribution.',
            content: 'The 15th Annual General Assembly of Efoyta Savings and Credit Cooperative Society was convened in Addis Ababa with over 1,200 delegates and member representatives in attendance. The Board Chairperson presented the annual audited financial statements, noting sustained growth in member savings, robust liquidity ratios, and a historic dividend return of 18.5% on share capital.\n\nMembers praised the leadership for modernizing core banking operations with the deployment of real-time member portal systems, robust risk governance, and green cooperative financing packages.',
            category: 'news',
            coverImageUrl: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=1200&q=80',
            author: 'Corporate Communications',
            isPublished: true,
            isFeatured: true,
            publishedAt: new Date(),
            tags: 'AGM, Dividends, Growth, Financial Results',
          },
          {
            id: crypto.randomUUID(),
            slug: 'launching-women-entrepreneurs-micro-fund',
            title: 'Efoyta SACCO Unveils Special Women Entrepreneurs Empowerment Fund',
            summary: 'A tailored financial package featuring discounted loan interest, financial literacy mentorship, and collateral-flexible financing for female-led businesses.',
            content: 'In alignment with the national financial inclusion strategy, Efoyta SACCO has officially launched a 50 Million ETB dedicated lending envelope for women micro and small entrepreneurs.\n\nThe product eliminates traditional high collateral hurdles through peer guarantor mechanisms and cooperative business evaluation, paired with customized bookkeeping and cash-flow training.',
            category: 'press_release',
            coverImageUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=1200&q=80',
            author: 'Credit & Social Impact Dept',
            isPublished: true,
            isFeatured: true,
            publishedAt: new Date(Date.now() - 3 * 86400000),
            tags: 'Women, Microfinance, Empowerment, Business Loans',
          },
          {
            id: crypto.randomUUID(),
            slug: 'smart-savings-habits-building-financial-freedom',
            title: 'Smart Savings Strategies: How Compound Interest Transforms Modest Incomes',
            summary: 'Practical financial education tips on disciplined monthly contributions, emergency buffer funds, and maximizing cooperative share yields.',
            content: 'Financial resilience begins not with high earnings, but with consistent habits. In this educational brief, Efoyta SACCO wealth advisors explain how automated standing orders, regular monthly savings, and reinvested dividends compound into significant wealth over 5 to 10 years.',
            category: 'financial_tips',
            coverImageUrl: 'https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?auto=format&fit=crop&w=1200&q=80',
            author: 'Financial Advisory Desk',
            isPublished: true,
            isFeatured: false,
            publishedAt: new Date(Date.now() - 7 * 86400000),
            tags: 'Education, Savings, Compound Interest, Tips',
          },
        ] as any,
      });
    }

    const faqsCount = await prisma.websiteFaq.count();
    if (faqsCount === 0) {
      console.info('[Public Website Service] Seeding default FAQs...');
      await prisma.websiteFaq.createMany({
        data: [
          {
            id: crypto.randomUUID(),
            question: 'Who can join Efoyta SACCO and what are the eligibility requirements?',
            answer: 'Any Ethiopian citizen or legally registered association aged 18 and above with verifiable income or business activity can become a member. Applicants submit a copy of their national Kebele ID or passport, 2 passport-sized photographs, pay a nominal registration fee of 500 ETB, and purchase the required minimum qualifying shares.',
            category: 'membership',
            orderIndex: 1,
            isActive: true,
          },
          {
            id: crypto.randomUUID(),
            question: 'How are annual dividends calculated and paid to members?',
            answer: 'Dividends are distributed annually following the General Assembly approval of audited financial reports. Earnings are proportional to the number of fully paid shares and member savings turnover throughout the fiscal year. Historically, Efoyta SACCO has distributed between 14% and 19% dividend yield.',
            category: 'dividends',
            orderIndex: 2,
            isActive: true,
          },
          {
            id: crypto.randomUUID(),
            question: 'What loan products are available and how long does loan appraisal take?',
            answer: 'We provide business expansion loans, agricultural equipment finance, emergency personal loans, asset purchase loans, and construction loans. Regular loan requests from active members in good standing are processed and appraised within 3 to 5 business days upon submission of complete guarantor and documentation files.',
            category: 'loans',
            orderIndex: 3,
            isActive: true,
          },
          {
            id: crypto.randomUUID(),
            question: 'Can I monitor my savings and apply for loans digitally?',
            answer: 'Yes! Efoyta SACCO members enjoy access to our 24/7 Member Self-Service Portal where you can view statement histories, track deposit standing instructions, calculate loan schedules, and receive SMS/email transaction alerts in real time.',
            category: 'digital',
            orderIndex: 4,
            isActive: true,
          },
        ] as any,
      });
    }

    const settingsCount = await prisma.websiteSetting.count();
    if (settingsCount === 0) {
      console.info('[Public Website Service] Seeding default settings...');
      const defaultSettings = [
        { id: crypto.randomUUID(), key: 'site_name', value: 'Efoyta Savings and Credit Cooperative Society (SACCO)', group: 'general' },
        { id: crypto.randomUUID(), key: 'site_tagline', value: 'Your Trusted Partner in Cooperative Prosperity & Sustainable Wealth', group: 'general' },
        { id: crypto.randomUUID(), key: 'contact_phone', value: '+251 11 667 8900', group: 'contact' },
        { id: crypto.randomUUID(), key: 'contact_hotline', value: '8844 (Toll-Free Call Center)', group: 'contact' },
        { id: crypto.randomUUID(), key: 'contact_email', value: 'info@efoytasacco.com', group: 'contact' },
        { id: crypto.randomUUID(), key: 'contact_address', value: 'Bole Medhanialem, Efoyta Headquarters Tower, Addis Ababa, Ethiopia', group: 'contact' },
        { id: crypto.randomUUID(), key: 'working_hours', value: 'Mon - Fri: 8:00 AM - 5:00 PM | Sat: 8:00 AM - 12:30 PM', group: 'contact' },
        { id: crypto.randomUUID(), key: 'stats_members', value: '45,800+', group: 'statistics' },
        { id: crypto.randomUUID(), key: 'stats_assets', value: '1.45+ Billion ETB', group: 'statistics' },
        { id: crypto.randomUUID(), key: 'stats_loans', value: '980+ Million ETB', group: 'statistics' },
        { id: crypto.randomUUID(), key: 'stats_dividend', value: '18.5%', group: 'statistics' },
        { id: crypto.randomUUID(), key: 'stats_repayment', value: '99.4%', group: 'statistics' },
        { id: crypto.randomUUID(), key: 'stats_branches', value: '12 Regional Hubs', group: 'statistics' },
        { id: crypto.randomUUID(), key: 'rate_regular_savings', value: '9.5% p.a.', group: 'rates' },
        { id: crypto.randomUUID(), key: 'rate_fixed_deposit', value: '14.0% p.a.', group: 'rates' },
        { id: crypto.randomUUID(), key: 'rate_business_loan', value: '12.5% p.a.', group: 'rates' },
        { id: crypto.randomUUID(), key: 'rate_agri_loan', value: '10.5% p.a.', group: 'rates' },
      ];
      for (const s of defaultSettings) {
        await prisma.websiteSetting.upsert({
          where: { key: s.key },
          create: s,
          update: s,
        });
      }
    }
  } catch (err: any) {
    console.warn('[Public Website Service] Note on seed:', err.message);
  }
}
