/**
 * Auth Routes
 *
 * Public endpoints: POST /register, POST /login, POST /refresh, POST /logout
 * Protected endpoint: GET /me  (requires valid JWT via authMiddleware)
 */

import { Router } from 'express';
import { authController } from './auth.controller';
import { authMiddleware } from '../../shared/middleware/auth.middleware';

export const authRouter = Router();

// Public
authRouter.post('/register', authController.register);
authRouter.post('/login', authController.login);
authRouter.post('/refresh', authController.refresh);
authRouter.post('/logout', authController.logout);

// Protected
authRouter.get('/me', authMiddleware, authController.me);
