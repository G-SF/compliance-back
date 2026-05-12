/**
 * Redis Client (ioredis)
 *
 * ioredis is preferred over the official `redis` package because it:
 *  - Has built-in retry strategy
 *  - Supports Cluster and Sentinel out of the box
 *  - Better TypeScript types
 *
 * The client is a singleton exported here and used by RedisService.
 */

import Redis from 'ioredis';
import { config } from '../../config';
import { logger } from '../../shared/utils/logger';

const retryStrategy = (times: number) => {
  if (times > 10) {
    logger.error('Redis max retry attempts reached. Giving up.');
    return null;
  }
  const delay = Math.min(times * 200, 2000);
  logger.warn(`Redis reconnecting... attempt ${times} (delay ${delay}ms)`);
  return delay;
};

export const redisClient = config.redis.url
  ? new Redis(config.redis.url, {
      retryStrategy,
      tls: config.redis.url.startsWith('rediss://') ? {} : undefined,
    })
  : new Redis({
      host: config.redis.host,
      port: config.redis.port,
      ...(config.redis.password ? { password: config.redis.password } : {}),
      retryStrategy,
    });

redisClient.on('connect', () => logger.info('Redis connected'));
redisClient.on('error', err => logger.error('Redis error', err));
