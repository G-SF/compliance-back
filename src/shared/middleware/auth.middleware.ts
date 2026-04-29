/**
 * JWT Authentication Middleware
 *
 * Extracts and verifies the Bearer token from the Authorization header.
 * On success, attaches `userId` to the request object for downstream handlers.
 * On failure, returns 401 — never leaks internal error details to the client.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { ApiResponse } from '../utils/response.util';
import { UserRole } from '../../modules/auth/models/user.model';

// Extend Express Request to carry the authenticated user's ID and role
export interface AuthenticatedRequest extends Request {
  userId: string;
  userRole: UserRole;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json(ApiResponse.error('Authorization header missing or malformed', 401));
    return;
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix

  try {
    const payload = jwt.verify(token, config.jwt.secret) as { userId: string; role: UserRole };
    (req as AuthenticatedRequest).userId = payload.userId;
    (req as AuthenticatedRequest).userRole = payload.role ?? 'user';
    next();
  } catch {
    res.status(401).json(ApiResponse.error('Invalid or expired token', 401));
  }
}
