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
   * Example of a protected route — requires authMiddleware on the router.
   * Returns the authenticated user's ID from the JWT payload.
   */
  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // req.userId is attached by authMiddleware
      res.json(ApiResponse.success({ userId: (req as Request & { userId?: string }).userId }));
    } catch (err) {
      next(err);
    }
  },
};
