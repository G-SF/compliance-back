/**
 * Auth Controller
 *
 * Thin layer: validates input via DTOs, delegates to AuthService,
 * and serialises the response. No business logic lives here.
 */

import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';
import { validateRegisterDto, validateLoginDto, validateRefreshTokenDto } from './auth.dto';
import { ApiResponse } from '../../shared/utils/response.util';
import { AuthenticatedRequest } from '../../shared/middleware/auth.middleware';
import { UserRole } from './models/user.model';
import { billingService } from '../billing/billing.service';

export const authController = {
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = validateRegisterDto(req.body);
      const user = await authService.register(dto);
      res.status(201).json(ApiResponse.success(user, 'User registered successfully'));
    } catch (err) {
      next(err);
    }
  },

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = validateLoginDto(req.body);
      const tokens = await authService.login(dto);
      res.json(ApiResponse.success(tokens, 'Login successful'));
    } catch (err) {
      next(err);
    }
  },

  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = validateRefreshTokenDto(req.body);
      const tokens = await authService.refresh(dto.refreshToken);
      res.json(ApiResponse.success(tokens, 'Tokens refreshed'));
    } catch (err) {
      next(err);
    }
  },

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = validateRefreshTokenDto(req.body);
      await authService.logout(dto.refreshToken);
      res.json(ApiResponse.success(null, 'Logged out successfully'));
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /me — returns authenticated user's profile (email + role)
   */
  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const user = await authService.findById(userId);
      if (!user) {
        res.status(404).json(ApiResponse.error('User not found', 404));
        return;
      }

      // Attach billing status alongside profile (best-effort — never fails /me)
      const billing = await billingService.getUserBillingStatus(userId).catch(() => null);

      res.json(
        ApiResponse.success({
          id: user._id,
          email: user.email,
          role: user.role,
          billing,
        }),
      );
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /promote/:userId — admin only, changes another user's role
   */
  async promote(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId: targetId } = req.params as { userId: string };
      const { role } = req.body as { role: unknown };

      if (role !== 'user' && role !== 'admin') {
        res.status(400).json(ApiResponse.error('role must be "user" or "admin"', 400));
        return;
      }

      const user = await authService.promoteUser(targetId, role as UserRole);
      res.json(ApiResponse.success({ id: user._id, email: user.email, role: user.role }));
    } catch (err) {
      next(err);
    }
  },
};
