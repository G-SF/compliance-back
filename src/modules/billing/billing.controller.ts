/**
 * Billing Controller
 *
 * GET    /billing/status          — user's plan + credits
 * GET    /billing/plans           — all active plans
 * POST   /billing/recharge        — applies a plan immediately (test/dev mode)
 * GET    /billing/history         — credit transaction history
 * GET    /billing/contract-usage/:documentId — per-contract usage counters
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { billingService } from './billing.service';
import { stripeService } from './stripe.service';
import { ApiResponse } from '../../shared/utils/response.util';
import { AuthenticatedRequest } from '../../shared/middleware/auth.middleware';
import { PLAN_SLUGS, PlanSlug } from './models/plan.model';

const rechargeSchema = z.object({
  planSlug: z.enum([PLAN_SLUGS.FREE, PLAN_SLUGS.BASIC, PLAN_SLUGS.ESSENTIAL, PLAN_SLUGS.MONTHLY]),
});

export const billingController = {
  /** GET /billing/status */
  async getStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const status = await billingService.getUserBillingStatus(userId);
      res.json(ApiResponse.success(status));
    } catch (err) {
      next(err);
    }
  },

  /** GET /billing/plans */
  async getPlans(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const plans = await billingService.getAllActivePlans();
      res.json(ApiResponse.success(plans));
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /billing/recharge
   * Applies a plan immediately — useful for development and testing.
   * Body: { planSlug: 'free' | 'basic' | 'essential' | 'monthly' }
   */
  async recharge(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const parsed = rechargeSchema.safeParse(req.body);

      if (!parsed.success) {
        throw Object.assign(new Error(parsed.error.issues.map(e => e.message).join('; ')), {
          statusCode: 400,
        });
      }

      await billingService.applyPlanPurchase(userId, parsed.data.planSlug as PlanSlug);
      const status = await billingService.getUserBillingStatus(userId);

      res.json(ApiResponse.success(status, `Plano "${parsed.data.planSlug}" aplicado com sucesso`));
    } catch (err) {
      next(err);
    }
  },

  /** GET /billing/history?page=1&limit=20 */
  async getCreditHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10));
      const limit = Math.min(50, Math.max(1, parseInt((req.query.limit as string) ?? '20', 10)));

      const result = await billingService.getCreditHistory(userId, page, limit);

      res.json(
        ApiResponse.success({
          transactions: result.transactions,
          total: result.total,
          page,
          limit,
          totalPages: Math.ceil(result.total / limit),
        }),
      );
    } catch (err) {
      next(err);
    }
  },

  /** GET /billing/contract-usage/:documentId */
  async getContractUsage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const { documentId } = req.params;

      const usage = await billingService.getContractUsage(userId, documentId);
      res.json(ApiResponse.success(usage));
    } catch (err) {
      next(err);
    }
  },

  // ── Stripe ────────────────────────────────────────────────────────────────

  /** POST /billing/checkout — creates a Stripe Checkout session */
  async createCheckoutSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const { planSlug } = req.body as { planSlug?: string };

      if (!planSlug) {
        throw Object.assign(new Error('planSlug is required'), { statusCode: 400 });
      }

      const session = await stripeService.createCheckoutSession(userId, planSlug as PlanSlug);
      res.json(ApiResponse.success(session));
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /billing/verify-payment?session_id=xxx
   * Verifies a Stripe Checkout session and applies the plan if the webhook
   * hasn't processed yet. Frontend calls this on return from Stripe.
   */
  async verifyPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const sessionId = req.query['session_id'] as string | undefined;

      if (!sessionId) {
        throw Object.assign(new Error('session_id é obrigatório'), { statusCode: 400 });
      }

      const status = await stripeService.verifyAndApplyCheckoutSession(sessionId, userId);
      res.json(ApiResponse.success(status));
    } catch (err) {
      next(err);
    }
  },

  /** POST /billing/portal — creates a Stripe Customer Portal session */
  async createPortalSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const url = await stripeService.createPortalSession(userId);
      res.json(ApiResponse.success({ url }));
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /webhooks/stripe
   * Stripe sends raw body — must NOT go through express.json().
   * Mounted at app level, before the JSON middleware.
   */
  async stripeWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sig = req.headers['stripe-signature'];
      if (!sig || typeof sig !== 'string') {
        res.status(400).json(ApiResponse.error('Missing stripe-signature header', 400));
        return;
      }

      await stripeService.handleWebhook(req.body as Buffer, sig);
      res.json({ received: true });
    } catch (err) {
      next(err);
    }
  },
};
