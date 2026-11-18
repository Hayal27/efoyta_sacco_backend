import './runtime-tune';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';

// Candidate paths for .env (current directory, parent directory when in dist/, app root)
const candidateEnvPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '.env'),
  path.resolve(process.cwd(), '../.env'),
];

for (const envPath of candidateEnvPaths) {
  try {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
    }
  } catch {}
}
dotenv.config();

/**
 * Normalizes DATABASE_URL to ensure safe connection limits and timeouts for cPanel / CloudLinux LVE.
 * Prevents Tokio runtime exhaustion (PANIC: timer has gone away) when host has many CPU cores.
 */
export function normalizeDatabaseUrl(url: string): string {
  if (!url) return url;
  if (!url.includes('connection_limit=') && !url.includes('connection_limit')) {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}connection_limit=5&pool_timeout=15&connect_timeout=15`;
  }
  return url;
}

if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = normalizeDatabaseUrl(process.env.DATABASE_URL);
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  API_PREFIX: z.string().default('/api/v1'),

  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .transform((val) => normalizeDatabaseUrl(val)),

  REDIS_URL: z.string().default('redis://localhost:6379'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('8h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  EMAIL_FROM: z.string().default('EFOYTA SACCO <kidoastu1993@gmail.com>'),

  // ── OTP & Security Policies ────────────────────────────────────────────────
  OTP_EXPIRY_MINUTES: z.coerce.number().default(15),
  MAX_OTP_ATTEMPTS: z.coerce.number().default(5),

  // ── Telegram Bot Notifications ─────────────────────────────────────────────
  TELEGRAM_BOT_TOKEN: z.string().optional(),

  // ── AfroMessage (Ethiopian SMS provider) ──────────────────────────────────
  AFROMESSAGE_TOKEN: z.string().optional(),
  AFROMESSAGE_SENDER_ID: z.string().optional(), // Registered sender name (optional)

  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_BUCKET: z.string().default('coop-files'),
  S3_REGION: z.string().default('us-east-1'),

  // ── IP Restriction ─────────────────────────────────────────────────────────
  // Comma-separated list of exact IPs and/or CIDR ranges.
  // Empty string = block all in production (fail-closed); skipped in dev/test.
  BRANCH_IPS: z.string().default(''),
  ADMIN_IPS: z.string().default(''),

  // ── CORS ───────────────────────────────────────────────────────────────────
  // Comma-separated list of allowed frontend origins (exact protocol + domain).
  // Falls back to localhost in development when not set.
  ALLOWED_ORIGINS: z.string().default(''),

  // ── AI Integration ──────────────────────────────────────────────────────────
  GROQ_API_KEY: z.string().optional().default(''),

  // ── OpenID Connect (OIDC) & Enterprise SSO (Keycloak / Temenos) ───────────
  OIDC_ENABLED: z.preprocess((val) => val === 'true' || val === true || val === '1', z.boolean()).default(false),
  OIDC_PROVIDER_NAME: z.string().default('Keycloak OIDC'),
  OIDC_ISSUER_URL: z.string().optional(),
  OIDC_CLIENT_ID: z.string().optional(),
  OIDC_CLIENT_SECRET: z.string().optional(),
  OIDC_JWKS_URI: z.string().optional(),
  OIDC_REDIRECT_URI: z.string().optional(),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
// Sync normalized DATABASE_URL back to process.env so Prisma native Query Engine reads the pool limit
process.env.DATABASE_URL = env.DATABASE_URL;

export type Env = typeof env;
