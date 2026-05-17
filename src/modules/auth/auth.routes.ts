/**
 * Auth Routes
 */

import { Router } from 'express';
import passport from 'passport';
import { authController } from './auth.controller';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { requireRole } from '../../shared/middleware/role.middleware';

export const authRouter = Router();

// Public
authRouter.post('/register', authController.register);
authRouter.post('/login', authController.login);
authRouter.post('/refresh', authController.refresh);
authRouter.post('/logout', authController.logout);

// Email verification
authRouter.post('/verify-email', authController.verifyEmail);
authRouter.post('/resend-code', authController.resendCode);

// Password reset
authRouter.post('/forgot-password', authController.forgotPassword);
authRouter.post('/reset-password', authController.resetPassword);

// Google OAuth
authRouter.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false }),
);
authRouter.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login?error=oauth_failed' }),
  authController.googleCallback,
);

// Protected
authRouter.get('/me', authMiddleware, authController.me);

// Admin only
authRouter.patch('/promote/:userId', authMiddleware, requireRole('admin'), authController.promote);
