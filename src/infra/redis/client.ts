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

const redisOptions: Redis['options'] = {
  host: config.redis.host,
  port: config.redis.port,
  ...(config.redis.password ? { password: config.redis.password } : {}),
  // Retry strategy: attempt 10 times with increasing delays, then give up
  retryStrategy: (times: number) => {
    if (times > 10) {
      logger.error('Redis max retry attempts reached. Giving up.');
      return null; // stop retrying
    }
    const delay = Math.min(times * 200, 2000);
    logger.warn(`Redis reconnecting... attempt ${times} (delay ${delay}ms)`);
    return delay;
  },
};

export const redisClient = new Redis(redisOptions);

redisClient.on('connect', () => logger.info('Redis connected'));
redisClient.on('error', err => logger.error('Redis error', err));
