import { PrismaClient } from '@prisma/client';
import { env, normalizeDatabaseUrl } from './env';

declare global {
  // Prevent multiple Prisma instances in development (hot-reload safe)
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

const dbUrl = normalizeDatabaseUrl(env.DATABASE_URL);

export const prisma =
  globalThis.__prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: dbUrl,
      },
    },
    log: env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

if (env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}
