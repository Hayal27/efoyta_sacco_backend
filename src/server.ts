import './config/runtime-tune';
import 'express-async-errors';
import http from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './config/prisma';
import { initSocketIO } from './config/socket';

import { initBackupSchedulerLoop } from './shared/jobs/backup-schedule.job';
import { initOutboxRelayLoop } from './shared/jobs/outbox-relay.job';
import { seedWebsiteDefaults } from './modules/seed/seed-website-defaults';

async function bootstrap() {
  console.info(`🔄 Initializing core banking backend [${env.NODE_ENV}]...`);

  // Verify database connectivity
  try {
    await prisma.$connect();
    console.info('✅ Database connected');
  } catch (dbErr: any) {
    console.error('❌ Database connection failed:', dbErr?.message || dbErr);
    console.error('💡 Production troubleshooting checklist:');
    console.error('   1. Check user thread limit: ulimit -u');
    console.error('   2. Kill any stale/zombie processes: pkill -f node; pkill -f prisma');
    console.error('   3. Verify DATABASE_URL parameters in .env (connection_limit=5 is recommended on cPanel)');
    throw dbErr;
  }

  // Ensure website/CMS tables and default content exist (non-blocking)
  seedWebsiteDefaults().catch((err) => {
    console.warn('Website defaults initialization notice:', err?.message || err);
  });

  const app = createApp();

  // Wrap Express app in a raw HTTP server so Socket.IO can share the same port
  const httpServer = http.createServer(app);
  initSocketIO(httpServer);

  httpServer.listen(env.PORT, () => {
    console.info(`🚀 Server running on port ${env.PORT} [${env.NODE_ENV}]`);
    console.info(`📡 API: http://localhost:${env.PORT}${env.API_PREFIX}`);
    console.info(`🔌 WebSocket: ws://localhost:${env.PORT}`);

    // Initialize automated backup scheduler loop
    initBackupSchedulerLoop();

    // Initialize transactional outbox relay worker (event backbone)
    initOutboxRelayLoop();
  });

  // Graceful shutdown
  let isShuttingDown = false;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.info(`\n${signal} received — shutting down gracefully...`);
    try {
      if (httpServer && httpServer.listening) {
        httpServer.close();
      }
      await prisma.$disconnect();
      console.info('✅ Shutdown complete');
    } catch {}
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    console.error('⚠️ [Process] Uncaught Exception intercepted:', err);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('⚠️ [Process] Unhandled Rejection intercepted:', reason);
  });
}

bootstrap().catch((err) => {
  console.error('❌ Bootstrap failed:', err);
  process.exit(1);
});
