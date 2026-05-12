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
import { billingService } from './modules/billing/billing.service';
import cron from 'node-cron';

async function bootstrap() {
  // 1. Build the Express app and start HTTP server FIRST
  // (Railway health-check requires the port to be bound before DB connects)
  const app = createApp();

  const server = app.listen(config.port, () => {
    logger.info(`Server running on port ${config.port} [${config.nodeEnv}]`);
  });

  // 2. Connect to MongoDB
  await connectDatabase();

  // 3. Connect to Redis — non-fatal so a Redis misconfiguration doesn't
  //    crash the whole service; rate-limiting features will degrade gracefully.
  try {
    await redisClient.ping();
    logger.info('Redis connection established');
  } catch (err) {
    logger.warn('Redis ping failed — continuing without Redis.', err);
  }

  // 4. Seed billing plans (idempotent)
  await billingService.seedPlans();

  // 5. Start monthly subscription renewal cron (runs daily at 02:00)
  cron.schedule('0 2 * * *', async () => {
    logger.info('[Cron] Running monthly subscription renewals...');
    await billingService.processMonthlyRenewals().catch(err => {
      logger.error('[Cron] Monthly renewal failed', err);
    });
  });
  logger.info('[Cron] Monthly renewal job scheduled (daily at 02:00)');

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
