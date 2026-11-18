-- Uniqueness Migration: Member Identifiers
-- Ensures every member account has a unique Phone Number, Email, Fayda FAN (National ID), and Fayda FIN.
-- Table: `members` (Prisma model `Member`)

-- 1. Unique index on `phone`
ALTER TABLE `members` ADD UNIQUE INDEX `members_phone_key` (`phone`);

-- 2. Unique index on `email` (Permits multiple NULL values in MySQL InnoDB)
ALTER TABLE `members` ADD UNIQUE INDEX `members_email_key` (`email`);

-- 3. Unique index on `nationalId` (Fayda FAN / Ethiopian National ID)
ALTER TABLE `members` ADD UNIQUE INDEX `members_nationalId_key` (`nationalId`);

-- 4. Unique index on `nationalIdFin` (Fayda Identification Number)
ALTER TABLE `members` ADD UNIQUE INDEX `members_nationalIdFin_key` (`nationalIdFin`);

