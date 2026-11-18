-- Public Website and CMS Content Management Schema Migration
-- Cooperative Management System: Efoyta SACCO

-- 1. Website Articles (News, Events, Financial Education, Press Releases)
CREATE TABLE IF NOT EXISTS `website_articles` (
  `id` CHAR(36) NOT NULL,
  `slug` VARCHAR(200) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `summary` TEXT NOT NULL,
  `content` LONGTEXT NOT NULL,
  `category` VARCHAR(100) NOT NULL DEFAULT 'news',
  `coverImageUrl` VARCHAR(500) NULL,
  `author` VARCHAR(100) NOT NULL DEFAULT 'Efoyta SACCO',
  `publishedAt` DATETIME(3) NULL,
  `isPublished` BOOLEAN NOT NULL DEFAULT TRUE,
  `isFeatured` BOOLEAN NOT NULL DEFAULT FALSE,
  `viewCount` INT NOT NULL DEFAULT 0,
  `tags` VARCHAR(255) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `website_articles_slug_key` (`slug`),
  INDEX `website_articles_isPublished_category_idx` (`isPublished`, `category`),
  INDEX `website_articles_isFeatured_idx` (`isFeatured`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Website Banners (Hero slides, high-impact alerts, rates banners)
CREATE TABLE IF NOT EXISTS `website_banners` (
  `id` CHAR(36) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `subtitle` TEXT NULL,
  `badge` VARCHAR(100) NULL,
  `imageUrl` VARCHAR(500) NULL,
  `videoUrl` VARCHAR(500) NULL,
  `mediaType` VARCHAR(20) NOT NULL DEFAULT 'image',
  `ctaText` VARCHAR(100) NULL,
  `ctaLink` VARCHAR(255) NULL,
  `secondaryCtaText` VARCHAR(100) NULL,
  `secondaryCtaLink` VARCHAR(255) NULL,
  `orderIndex` INT NOT NULL DEFAULT 0,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `website_banners_isActive_orderIndex_idx` (`isActive`, `orderIndex`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Website Inquiries (Customer contact messages, feedbacks, questions)
CREATE TABLE IF NOT EXISTS `website_inquiries` (
  `id` CHAR(36) NOT NULL,
  `fullName` VARCHAR(200) NOT NULL,
  `email` VARCHAR(200) NOT NULL,
  `phone` VARCHAR(50) NOT NULL,
  `subject` VARCHAR(200) NOT NULL,
  `message` TEXT NOT NULL,
  `inquiryType` VARCHAR(50) NOT NULL DEFAULT 'general',
  `status` VARCHAR(30) NOT NULL DEFAULT 'pending',
  `notes` TEXT NULL,
  `ipAddress` VARCHAR(100) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `resolvedAt` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  INDEX `website_inquiries_status_inquiryType_idx` (`status`, `inquiryType`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Website Membership Applications (Online pre-registration leads)
CREATE TABLE IF NOT EXISTS `website_membership_applications` (
  `id` CHAR(36) NOT NULL,
  `applicationNumber` VARCHAR(50) NOT NULL,
  `fullName` VARCHAR(200) NOT NULL,
  `phone` VARCHAR(50) NOT NULL,
  `email` VARCHAR(200) NULL,
  `nationalIdNumber` VARCHAR(100) NULL,
  `city` VARCHAR(100) NOT NULL,
  `preferredBranch` VARCHAR(150) NULL,
  `occupation` VARCHAR(150) NULL,
  `monthlyIncome` DECIMAL(15, 2) NULL,
  `productInterest` VARCHAR(100) NULL,
  `initialDepositEstimate` DECIMAL(15, 2) NULL,
  `status` VARCHAR(50) NOT NULL DEFAULT 'received',
  `rejectionReason` TEXT NULL,
  `notes` TEXT NULL,
  `reviewedById` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `website_membership_applications_appNum_key` (`applicationNumber`),
  INDEX `website_membership_applications_status_phone_idx` (`status`, `phone`),
  INDEX `website_membership_applications_appNum_idx` (`applicationNumber`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Website FAQs
CREATE TABLE IF NOT EXISTS `website_faqs` (
  `id` CHAR(36) NOT NULL,
  `question` VARCHAR(500) NOT NULL,
  `answer` TEXT NOT NULL,
  `category` VARCHAR(100) NOT NULL DEFAULT 'general',
  `orderIndex` INT NOT NULL DEFAULT 0,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `website_faqs_isActive_category_idx` (`isActive`, `category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Website Branch Network Directory
CREATE TABLE IF NOT EXISTS `website_branches` (
  `id` CHAR(36) NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `city` VARCHAR(100) NOT NULL,
  `address` VARCHAR(300) NOT NULL,
  `phone` VARCHAR(100) NOT NULL,
  `email` VARCHAR(150) NULL,
  `managerName` VARCHAR(150) NULL,
  `operatingHours` VARCHAR(255) NOT NULL DEFAULT 'Mon - Fri: 8:00 AM - 5:00 PM, Sat: 8:00 AM - 12:30 PM',
  `isHeadOffice` BOOLEAN NOT NULL DEFAULT FALSE,
  `latitude` DOUBLE NULL,
  `longitude` DOUBLE NULL,
  `orderIndex` INT NOT NULL DEFAULT 0,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `website_branches_isActive_city_idx` (`isActive`, `city`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Website Publications (Annual Reports, Audit, Bylaws, Forms)
CREATE TABLE IF NOT EXISTS `website_publications` (
  `id` CHAR(36) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `category` VARCHAR(100) NOT NULL DEFAULT 'annual_report',
  `description` TEXT NULL,
  `fileUrl` VARCHAR(500) NOT NULL,
  `fileSize` VARCHAR(50) NULL,
  `year` INT NULL,
  `downloads` INT NOT NULL DEFAULT 0,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `website_publications_isActive_category_idx` (`isActive`, `category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Website Global Settings & Contents
CREATE TABLE IF NOT EXISTS `website_settings` (
  `id` CHAR(36) NOT NULL,
  `key` VARCHAR(100) NOT NULL,
  `value` TEXT NOT NULL,
  `group` VARCHAR(50) NOT NULL DEFAULT 'general',
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `website_settings_key_key` (`key`),
  INDEX `website_settings_group_idx` (`group`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

