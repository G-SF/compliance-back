/**
 * MongoDB Connection with Retry Strategy
 *
 * Uses exponential back-off to handle transient connection failures
 * (common during container start-up when Mongo isn't ready yet).
 */

import mongoose from 'mongoose';
import { config } from '../config';
import { logger } from '../shared/utils/logger';

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

export async function connectDatabase(attempt = 1): Promise<void> {
  try {
    await mongoose.connect(config.mongo.uri, {
      // These timeouts prevent the app from hanging indefinitely
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    logger.info('MongoDB connection established');
  } catch (err) {
    if (attempt >= MAX_RETRIES) {
      logger.error(`MongoDB connection failed after ${MAX_RETRIES} attempts`, err);
      throw err;
    }

    const delay = RETRY_DELAY_MS * attempt;
    logger.warn(`MongoDB connection attempt ${attempt} failed. Retrying in ${delay}ms...`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return connectDatabase(attempt + 1);
  }
}

// Expose mongoose events so the main process can react to disconnects
mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected');
});

mongoose.connection.on('error', err => {
  logger.error('MongoDB error', err);
});
