/**
 * Redis Service
 *
 * Wraps the raw ioredis client with typed, domain-friendly methods.
 * Used for:
 *  - Refresh token storage (auth module)
 *  - General-purpose caching (future modules)
 *
 * Keeping this as a plain class (not a singleton instance) makes it easy
 * to inject or mock in tests.
 */

import { redisClient } from './client';

export class RedisService {
  /**
   * Store a value with an optional TTL (seconds).
   */
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await redisClient.set(key, value, 'EX', ttlSeconds);
    } else {
      await redisClient.set(key, value);
    }
  }

  /**
   * Retrieve a value. Returns null when the key doesn't exist or has expired.
   */
  async get(key: string): Promise<string | null> {
    return redisClient.get(key);
  }

  /**
   * Delete one or more keys.
   */
  async del(...keys: string[]): Promise<void> {
    await redisClient.del(...keys);
  }

  /**
   * Check if a key exists.
   */
  async exists(key: string): Promise<boolean> {
    const result = await redisClient.exists(key);
    return result === 1;
  }

  /**
   * Update the TTL of an existing key without changing its value.
   */
  async expire(key: string, ttlSeconds: number): Promise<void> {
    await redisClient.expire(key, ttlSeconds);
  }
}

// Export a single shared instance — swap for DI container when scaling
export const redisService = new RedisService();
