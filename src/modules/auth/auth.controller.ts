/**
 * Auth Controller
 *
 * Thin layer: validates input via DTOs, delegates to AuthService,
 * and serialises the response. No business logic lives here.
 */

import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';
import {
  validateRegisterDto,
  validateLoginDto,
  validateRefreshTokenDto,
  validateVerifyEmailDto,
  validateForgotPasswordDto,
  validateResetPasswordDto,
} from './auth.dto';
import { ApiResponse } from '../../shared/utils/response.util';
import { AuthenticatedRequest } from '../../shared/middleware/auth.middleware';
import { UserRole } from './models/user.model';
import { billingService } from '../billing/billing.service';
import { config } from '../../config';

export const authController = {
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = validateRegisterDto(req.body);
      const result = await authService.register(dto);
      res
        .status(201)
        .json(ApiResponse.success(result, 'User registered. Please verify your email.'));
    } catch (err) {
      next(err);
    }
  },

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = validateLoginDto(req.body);
      const tokens = await authService.login(dto);
      res.json(ApiResponse.success(tokens, 'Login successful'));
    } catch (err: unknown) {
      const e = err as { statusCode?: number; code?: string; userId?: string; message?: string };
      if (e.code === 'EMAIL_NOT_VERIFIED' && e.userId) {
        res.status(403).json({
          success: false,
          message: e.message,
          code: 'EMAIL_NOT_VERIFIED',
          userId: e.userId,
        });
        return;
      }
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

  /**
   * POST /verify-email — verifies 6-digit code and returns tokens
   */
  async verifyEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = validateVerifyEmailDto(req.body);
      const tokens = await authService.verifyEmail(dto.userId, dto.code);
      res.json(ApiResponse.success(tokens, 'Email verified successfully'));
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /resend-code — resends verification code to the user's email
   */
  async resendCode(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req.body as { userId?: string };
      if (!userId || typeof userId !== 'string') {
        res.status(400).json(ApiResponse.error('userId is required', 400));
        return;
      }
      await authService.sendVerificationCode(userId);
      res.json(ApiResponse.success(null, 'Verification code resent'));
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /google/callback — passport redirects here after Google auth
   * Issues tokens and redirects to the frontend OAuth callback page.
   */
  async googleCallback(req: Request, res: Response): Promise<void> {
    const profile = req.user as { googleId: string; email: string; name: string | null };

    try {
      const tokens = await authService.googleAuth(profile);
      const params = new URLSearchParams({
        access: tokens.accessToken,
        refresh: tokens.refreshToken,
      });
      res.redirect(`${config.billing.frontendUrl}/auth/callback?${params.toString()}`);
    } catch {
      res.redirect(`${config.billing.frontendUrl}/login?error=oauth_failed`);
    }
  },

  /**
   * POST /forgot-password — sends password reset link to the user's email.
   * Always returns 200 to prevent email-enumeration.
   */
  async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email } = validateForgotPasswordDto(req.body);
      await authService.forgotPassword(email);
      res.json(ApiResponse.success(null, 'If that email exists, a reset link was sent.'));
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /reset-password — validates token and sets a new password.
   */
  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token, password } = validateResetPasswordDto(req.body);
      await authService.resetPassword(token, password);
      res.json(ApiResponse.success(null, 'Password reset successfully.'));
    } catch (err) {
      next(err);
    }
  },
};
