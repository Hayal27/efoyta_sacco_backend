-- OpenID Connect (OIDC) & Enterprise SSO Federation Migration (Keycloak / Temenos)
-- Adds federated subject identifier, identity provider tracking, and external flag.
-- Table: `users` (Prisma model `User`)

ALTER TABLE `users`
  ADD COLUMN `oidcSub` VARCHAR(255) NULL,
  ADD COLUMN `idpProvider` VARCHAR(50) NOT NULL DEFAULT 'local',
  ADD COLUMN `isExternal` BOOLEAN NOT NULL DEFAULT false;

-- Add unique index for OIDC Subject Identifier
ALTER TABLE `users` ADD UNIQUE INDEX `users_oidcSub_key` (`oidcSub`);

