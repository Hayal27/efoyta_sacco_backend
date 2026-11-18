const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

async function run() {
  console.log('Building @coop/backend production bundle with esbuild...');
  const distDir = path.join(__dirname, 'dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  const startTime = Date.now();
  await esbuild.build({
    entryPoints: {
      server: path.join(__dirname, 'src/server.ts'),
      seed: path.join(__dirname, 'scripts/seed-roles.ts'),
    },
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    outdir: distDir,
    sourcemap: true,
    banner: {
      js: `/**
 * cPanel / CloudLinux LVE Safe Environment Initialization
 * Caps Tokio worker threads and libuv pool size to prevent [PANIC: timer has gone away]
 */
if (!process.env.TOKIO_WORKER_THREADS) { process.env.TOKIO_WORKER_THREADS = '2'; }
if (!process.env.UV_THREADPOOL_SIZE) { process.env.UV_THREADPOOL_SIZE = '4'; }
`,
    },
    external: [
      '@prisma/client',
      'bcryptjs',
      'sharp',
      'exceljs',
      'bullmq',
      'ioredis',
      'puppeteer',
      'nodemailer',
      'africastalking',
      'express',
      'cors',
      'helmet',
      'morgan',
      'compression',
      'cookie-parser',
      'express-rate-limit',
      'jsonwebtoken',
      'socket.io',
      'dotenv',
    ],
  });

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`Backend built successfully to apps/backend/dist/server.js in ${duration}s!`);
}

run().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
