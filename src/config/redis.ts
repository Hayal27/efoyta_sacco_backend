import { Redis } from 'ioredis';
import { env } from './env';

let hasLoggedRedisWarning = false;

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
  lazyConnect: true,
  maxLoadingRetryTime: 1000,
  connectTimeout: 2000,
  retryStrategy(times) {
    if (times > 1) {
      if (!hasLoggedRedisWarning) {
        hasLoggedRedisWarning = true;
        console.warn(`⚠️ Redis server unreachable at ${env.REDIS_URL}. Background BullMQ workers will stay paused until Redis is running.`);
      }
      return null; // Stop reconnecting to free sockets and timers
    }
    return 500;
  },
});

let isConnected = false;

redis.on('connect', () => {
  isConnected = true;
  console.info('✅ Redis connected successfully');
});

redis.on('error', (err: any) => {
  if (!isConnected && (err?.code === 'ECONNREFUSED' || err?.code === 'ENOTFOUND')) {
    // Silent suppression for offline local Redis in shared hosting / cPanel
    return;
  }
  console.warn('⚠️ Redis warning:', err?.message || err);
});
