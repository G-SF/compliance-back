/**
 * Role-Based Access Control Middleware
 *
 * Usage:
 *   router.get('/admin/all', authMiddleware, requireRole('admin'), handler)
 *
 * Must be placed AFTER authMiddleware (which attaches userRole to the request).
 */

import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware';
import { UserRole } from '../../modules/auth/models/user.model';
import { ApiResponse } from '../utils/response.util';

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authed = req as AuthenticatedRequest;
    if (!roles.includes(authed.userRole)) {
      res.status(403).json(ApiResponse.error('Forbidden: insufficient permissions', 403));
      return;
    }
    next();
  };
}
