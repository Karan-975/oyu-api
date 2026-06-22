import { createClient } from 'redis';
import { config } from './config';
import { logger } from '../shared/utils/logger';

const redisClient = createClient({
  socket: {
    host: config.redis.host,
    port: config.redis.port,
    reconnectStrategy: () => false,
  },
  password: config.redis.password,
});

redisClient.on('error', (err) => logger.error('Redis Client Error', err));
redisClient.on('connect', () => logger.info('✅ Redis connected'));

export async function connectRedis(): Promise<void> {
  try {
    await redisClient.connect();
  } catch (error) {
    logger.warn('⚠️ Redis unavailable, continuing without Redis cache', error);
  }
}

export { redisClient };

export const RedisKeys = {
  refreshToken: (userId: string) => `refresh_token:${userId}`,
  passwordReset: (token: string) => `pwd_reset:${token}`,
  notificationCount: (userId: string) => `notif_count:${userId}`,
  rateLimitLogin: (ip: string) => `rate_limit:login:${ip}`,
};
