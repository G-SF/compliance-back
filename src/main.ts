/**
 * Application Entry Point
 *
 * Responsibilities:
 *  1. Load environment variables (must be first, before any other import)
 *  2. Validate critical config values
 *  3. Connect to MongoDB and Redis
 *  4. Start the HTTP server
 *
 * We keep this file minimal — all Express wiring lives in app.ts so that
 * the app instance can be imported independently in tests.
 */

import 'dotenv/config';
import { config } from './config';
import { createApp } from './app';
import { connectDatabase } from './database/connection';
import { redisClient } from './infra/redis/client';
import { logger } from './shared/utils/logger';

async function bootstrap() {
  // 1. Connect to MongoDB
  await connectDatabase();

  // 2. Connect to Redis (ioredis connects lazily, but we can ping to verify)
  await redisClient.ping();
  logger.info('Redis connection established');

  // 3. Build the Express app
  const app = createApp();

  // 4. Start HTTP server
  const server = app.listen(config.port, () => {
    logger.info(`Server running on port ${config.port} [${config.nodeEnv}]`);
  });

  // LLM requests podem demorar vários minutos — desabilita os timeouts do Node
  server.headersTimeout = 0;
  server.requestTimeout = 0;
  server.timeout = 0;

  // Graceful shutdown — ensures in-flight requests finish before disconnect
  const gracefulShutdown = async (signal: string) => {
    logger.info(`${signal} received. Shutting down gracefully...`);
    server.close(async () => {
      await redisClient.quit();
      logger.info('Redis connection closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

bootstrap().catch(err => {
  logger.error('Fatal error during bootstrap', err);
  process.exit(1);
});
