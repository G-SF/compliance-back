/**
 * AI Costs Routes
 *
 * All routes require authentication.
 * Admin routes additionally require the 'admin' role.
 *
 * User endpoints (scoped to the authenticated user):
 *   GET /api/v1/ai-costs/summary           Overall totals + by-model + by-type
 *   GET /api/v1/ai-costs/requests          Paginated per-request list
 *   GET /api/v1/ai-costs/daily             Day-by-day breakdown
 *   GET /api/v1/ai-costs/weekly            Week-by-week breakdown
 *   GET /api/v1/ai-costs/monthly           Month-by-month breakdown
 *
 * Admin endpoints (all users, optionally filtered by ?userId=):
 *   GET /api/v1/ai-costs/admin/summary     Global totals
 *   GET /api/v1/ai-costs/admin/requests    All requests (paginated)
 *   GET /api/v1/ai-costs/admin/daily       Daily breakdown across all users
 *   GET /api/v1/ai-costs/admin/weekly      Weekly breakdown across all users
 *   GET /api/v1/ai-costs/admin/monthly     Monthly breakdown across all users
 *   GET /api/v1/ai-costs/admin/by-user     Cost ranking per user
 *
 * Common query params: from, to (ISO date), timezone (IANA, default America/Sao_Paulo)
 * Pagination: page (default 1), limit (default 50, max 100)
 */

import { Router } from 'express';
import { aiCostsController } from './ai-costs.controller';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { requireRole } from '../../shared/middleware/role.middleware';

export const aiCostsRouter = Router();

// All ai-costs routes require a valid JWT
aiCostsRouter.use(authMiddleware);

// ── Admin routes (registered before user routes to avoid param conflicts) ───
aiCostsRouter.get('/admin/summary', requireRole('admin'), aiCostsController.adminSummary);
aiCostsRouter.get('/admin/requests', requireRole('admin'), aiCostsController.adminRequests);
aiCostsRouter.get('/admin/daily', requireRole('admin'), aiCostsController.adminDaily);
aiCostsRouter.get('/admin/weekly', requireRole('admin'), aiCostsController.adminWeekly);
aiCostsRouter.get('/admin/monthly', requireRole('admin'), aiCostsController.adminMonthly);
aiCostsRouter.get('/admin/by-user', requireRole('admin'), aiCostsController.adminByUser);

// ── User routes ─────────────────────────────────────────────────────────────
aiCostsRouter.get('/summary', aiCostsController.summary);
aiCostsRouter.get('/requests', aiCostsController.requests);
aiCostsRouter.get('/daily', aiCostsController.daily);
aiCostsRouter.get('/weekly', aiCostsController.weekly);
aiCostsRouter.get('/monthly', aiCostsController.monthly);
