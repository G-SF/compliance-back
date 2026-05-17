/**
 * Billing Routes
 *
 * GET    /api/v1/billing/status               — user plan + credits (auth required)
 * GET    /api/v1/billing/plans                — all active plans (public)
 * POST   /api/v1/billing/recharge             — apply a plan immediately (auth)
 * GET    /api/v1/billing/history              — credit history (auth)
 * GET    /api/v1/billing/contract-usage/:id   — per-contract limits (auth)
 */

import { Router } from 'express';
import { billingController } from './billing.controller';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { requireRole } from '../../shared/middleware/role.middleware';

export const billingRouter = Router();

// Public
billingRouter.get('/plans', billingController.getPlans);

// Protected (authenticated users)
billingRouter.use(authMiddleware);

billingRouter.get('/status', billingController.getStatus);
billingRouter.get('/history', billingController.getCreditHistory);
billingRouter.get('/contract-usage/:documentId', billingController.getContractUsage);

// Admin only — direct plan assignment bypasses payment; must never be user-accessible in prod
billingRouter.post('/recharge', requireRole('admin'), billingController.recharge);
