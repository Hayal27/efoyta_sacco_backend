import express from 'express';
import path from 'path';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';

import { env } from './config/env';
import { globalRateLimit } from './shared/middleware/rate-limit.middleware';
import { errorHandler } from './shared/middleware/error-handler.middleware';
import { ipRestrict } from './shared/middleware/ip-restrict.middleware';

// Module routers
import { authRouter } from './modules/auth/auth.routes';
import { membersRouter } from './modules/members/members.routes';
import { savingsRouter } from './modules/savings/savings.routes';
import { loansRouter } from './modules/loans/loans.routes';
import { guarantorsRouter } from './modules/guarantors/guarantors.routes';
import { collectionsRouter } from './modules/collections/collections.routes';
import { reportsRouter } from './modules/reports/reports.routes';
import { notificationsRouter } from './modules/notifications/notifications.routes';
import { usersRouter } from './modules/users/users.routes';
import { sharesRouter } from './modules/shares/shares.routes';
import { rolesRouter } from './modules/roles/roles.routes';
import { menusRouter } from './modules/menus/menus.routes';
import { branchesRouter } from './modules/branches/branches.routes';
import { auditLogsRouter } from './modules/audit-logs/audit-logs.routes';
import { accountingRouter } from './modules/accounting/accounting.routes';
import { backupRouter } from './modules/backup/backup.routes';
import { aiAssistantRouter } from './modules/ai-assistant/ai-assistant.routes';
import auditorRouter from './modules/auditor/auditor.routes';
import { cashManagementRouter } from './modules/cash-management/cash-management.routes';
import { memberPortalRouter } from './modules/member-portal/member-portal.routes';
import { verificationsRouter } from './modules/verifications/verifications.routes';
import { cmsRouter } from './modules/cms/cms.routes';
import { publicRouter } from './modules/public-website/public.routes';
import { hrRouter } from './modules/hr/hr.routes';


// Register event listeners (side-effect imports)
import './shared/events/listeners/on-loan-repaid';
import './shared/events/listeners/on-savings-deposited';
import './shared/events/listeners/on-savings-withdrawn';
import './shared/events/listeners/on-savings-transferred';
import './shared/events/listeners/on-loan-overdue';

export function createApp() {
  const app = express();

  // ── Trust proxy (required so req.ip resolves the real client IP behind nginx)
  // '1' means trust exactly one hop (the nginx reverse proxy). Use 'true'
  // only if there are multiple proxy layers in your infrastructure.
  app.set('trust proxy', 1);

  // ── Security ─────────────────────────────────────────────────────────────
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // ── CORS Configuration ───────────────────────────────────────────────────
  const configuredOrigins = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : [];

  const isAllowedOrigin = (origin: string): boolean => {
    const cleanOrigin = origin.trim().toLowerCase().replace(/\/+$/, '');

    // 1. If wildcard '*' is present in ALLOWED_ORIGINS, allow all
    if (configuredOrigins.includes('*')) return true;

    // 2. Exact match from ALLOWED_ORIGINS env
    if (configuredOrigins.some((o) => o.toLowerCase() === cleanOrigin)) return true;

    // 3. Always allow localhost & 127.0.0.1 on any port (for dev & test frontends)
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(cleanOrigin)) return true;

    // 4. Always allow efoytasacco.com and all its subdomains
    if (/^https?:\/\/([a-z0-9-]+\.)*efoytasacco\.com(:[0-9]+)?$/.test(cleanOrigin)) return true;

    // 5. Allow private network IPs for mobile testing (e.g. Expo / React Native)
    if (/^https?:\/\/(10\.\d+|192\.168\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+)(:\d+)?$/.test(cleanOrigin)) return true;

    return false;
  };

  const corsOptions: cors.CorsOptions = {
    origin: (origin, callback) => {
      // Allow non-browser clients (curl, server-to-server, Postman, mobile apps)
      if (!origin) return callback(null, true);

      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }

      // Return false without throwing a 500 unhandled error
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    exposedHeaders: ['Content-Disposition'],
    optionsSuccessStatus: 200,
  };

  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));
  app.use(globalRateLimit);

  // ── Request parsing ───────────────────────────────────────────────────────
  app.use(express.json({ limit: '35mb' }));
  app.use(express.urlencoded({ extended: true, limit: '35mb' }));
  app.use(cookieParser());
  app.use(compression());

  // ── Static Files (Biometrics, voice recordings, receipts, CMS media) ────────
  const staticUploadOptions = {
    setHeaders: (res: express.Response) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Access-Control-Allow-Origin', '*');
    },
  };
  const { getAllExistingUploadRoots } = require('./shared/utils/upload.utils');
  const existingUploadRoots: string[] = getAllExistingUploadRoots();
  for (const uploadRoot of existingUploadRoots) {
    app.use('/uploads', express.static(uploadRoot, staticUploadOptions));
  }

  // ── Logging ───────────────────────────────────────────────────────────────
  if (env.NODE_ENV !== 'test') {
    app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  }

  // ── Health check ──────────────────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', env: env.NODE_ENV, timestamp: new Date().toISOString() });
  });

  // ── OpenID Connect Discovery (RFC 8414 / OIDC Core 1.0) ────────────────────
  app.get('/.well-known/openid-configuration', (req, res) => {
    const { getDiscovery } = require('./modules/auth/oidc.controller');
    getDiscovery(req, res);
  });

  // ── API Routes ────────────────────────────────────────────────────────────
  const prefix = env.API_PREFIX;

  // Public routes — no IP restriction
  app.use(`${prefix}/auth`, authRouter);
  app.use(`${prefix}/members`, membersRouter);
  app.use(`${prefix}/savings`, savingsRouter);
  app.use(`${prefix}/loans`, loansRouter);
  app.use(`${prefix}/guarantors`, guarantorsRouter);
  app.use(`${prefix}/collections`, collectionsRouter);
  app.use(`${prefix}/reports`, reportsRouter);
  app.use(`${prefix}/notifications`, notificationsRouter);
  app.use(`${prefix}/shares`, sharesRouter);

  app.use(`${prefix}/audit-logs`, auditLogsRouter);
  app.use(`${prefix}/accounting`, accountingRouter);
  app.use(`${prefix}/cash-management`, cashManagementRouter);
  app.use(`${prefix}/backups`, backupRouter);
  app.use(`${prefix}/ai-assistant`, aiAssistantRouter);
  app.use(`${prefix}/auditor`, auditorRouter);
  app.use(`${prefix}/portal`, memberPortalRouter);
  app.use(`${prefix}/verifications`, verificationsRouter);
  app.use(`${prefix}/cms`, cmsRouter);
  app.use(`${prefix}/public`, publicRouter);
  app.use(`${prefix}/hr`, hrRouter);


  // Branch-restricted routes — only IPs in BRANCH_IPS may call these
  app.use('/api/v1/branches', ipRestrict('BRANCH_IPS'), branchesRouter);

  // Admin-restricted routes — only IPs in ADMIN_IPS may call these
  app.use('/api/v1/users', ipRestrict('ADMIN_IPS'), usersRouter);
  app.use('/api/v1/roles', ipRestrict('ADMIN_IPS'), rolesRouter);
  app.use('/api/v1/menus', ipRestrict('ADMIN_IPS'), menusRouter);

  // ── Error Handling ───────────────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({ success: false, error: 'Route not found', code: 'NOT_FOUND' });
  });

  // ── Global error handler (must be last) ───────────────────────────────────
  app.use(errorHandler);

  return app;
}
