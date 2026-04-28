/**
 * Centralised Error Handling Middleware
 *
 * Must be registered LAST in the Express middleware chain (see app.ts).
 *
 * Handles:
 *  - Application errors with a custom `statusCode` property
 *  - Mongoose validation errors (400)
 *  - Mongoose duplicate key errors (409)
 *  - JWT errors (401) — should be caught in authMiddleware, but just in case
 *  - Anything else → 500 (internal details hidden from the client)
 */

import { Request, Response, NextFunction } from 'express';
import { MongoServerError } from 'mongodb';
import mongoose from 'mongoose';
import { JsonWebTokenError } from 'jsonwebtoken';
import { ApiResponse } from '../utils/response.util';
import { logger } from '../utils/logger';

interface AppError extends Error {
  statusCode?: number;
}

export function errorMiddleware(
  err: AppError,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  // Log the full error internally — never expose stack traces to clients
  logger.error(err.message, { stack: err.stack });

  // Mongoose validation error
  if (err instanceof mongoose.Error.ValidationError) {
    const messages = Object.values(err.errors).map(e => e.message);
    res.status(400).json(ApiResponse.error(messages.join(', '), 400));
    return;
  }

  // MongoDB duplicate key (e.g. unique email constraint)
  if (err instanceof MongoServerError && err.code === 11000) {
    res.status(409).json(ApiResponse.error('Resource already exists', 409));
    return;
  }

  // JWT errors surfaced outside authMiddleware
  if (err instanceof JsonWebTokenError) {
    res.status(401).json(ApiResponse.error('Invalid token', 401));
    return;
  }

  // Application-level errors with an explicit status code
  if (err.statusCode && err.statusCode < 500) {
    res.status(err.statusCode).json(ApiResponse.error(err.message, err.statusCode));
    return;
  }

  // Catch-all: 500 Internal Server Error — hide implementation details
  res.status(500).json(ApiResponse.error('Internal server error', 500));
}
