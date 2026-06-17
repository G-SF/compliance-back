/**
 * Stripe Service
 *
 * Handles:
 *  - Checkout session creation (one-time + subscription)
 *  - Customer portal session creation
 *  - Webhook event verification and processing
 */

import StripeLib = require('stripe');
import { config } from '../../config';
import { billingService } from './billing.service';
import { UserModel } from '../auth/models/user.model';
import { SubscriptionModel } from './models/subscription.model';
import { PlanModel, PLAN_SLUGS, PlanSlug } from './models/plan.model';
import { logger } from '../../shared/utils/logger';

// ── Stripe instance type ─────────────────────────────────────────────────────

type StripeClient = StripeLib.Stripe;

// ── Lazy-init Stripe client ──────────────────────────────────────────────────

let _stripe: StripeClient | null = null;

function getStripe(): StripeClient {
  if (!_stripe) {
    if (!config.stripe.secretKey) {
      throw Object.assign(new Error('Stripe não está configurado'), { statusCode: 503 });
    }
    _stripe = new StripeLib(config.stripe.secretKey);
  }
  return _stripe;
}

function getPriceId(planSlug: PlanSlug): string {
  const map: Partial<Record<PlanSlug, string>> = {
    basic: config.stripe.priceBasic,
    essential: config.stripe.priceEssential,
    monthly: config.stripe.priceMonthly,
  };
  const priceId = map[planSlug];
  if (!priceId) {
    throw Object.assign(new Error(`Nenhum preço Stripe configurado para o plano: ${planSlug}`), {
      statusCode: 400,
    });
  }
  return priceId;
}

// ── Stripe API field helpers ─────────────────────────────────────────────────
// The Stripe SDK v22 pins API version 2026-05-27.dahlia, which moved two fields:
//  - `current_period_end` left the Subscription object and now lives on each
//    subscription item (`subscription.items.data[].current_period_end`).
//  - `Invoice.subscription` was removed; the subscription reference is now under
//    `invoice.parent.subscription_details.subscription`.
// These helpers read the new location and fall back to the legacy shape so the
// code keeps working across API versions.

/** Extracts the current period end (epoch seconds) from a subscription object. */
function extractSubscriptionPeriodEnd(subscription: Record<string, unknown>): Date | null {
  const items = subscription['items'] as { data?: Array<Record<string, unknown>> } | undefined;
  const itemPeriodEnd = items?.data?.[0]?.['current_period_end'];
  if (typeof itemPeriodEnd === 'number') return new Date(itemPeriodEnd * 1000);

  // Legacy (pre-2025) top-level field
  const legacy = subscription['current_period_end'];
  if (typeof legacy === 'number') return new Date(legacy * 1000);

  return null;
}

/** Extracts the Stripe subscription id referenced by an invoice. */
function extractInvoiceSubscriptionId(invoice: Record<string, unknown>): string | null {
  const fromRef = (ref: unknown): string | null => {
    if (typeof ref === 'string') return ref;
    if (ref && typeof ref === 'object') {
      const id = (ref as Record<string, unknown>)['id'];
      if (typeof id === 'string') return id;
    }
    return null;
  };

  // Legacy (pre-2025) top-level field
  const legacy = fromRef(invoice['subscription']);
  if (legacy) return legacy;

  // API 2025+: invoice.parent.subscription_details.subscription
  const parent = invoice['parent'] as Record<string, unknown> | undefined;
  const subDetails = parent?.['subscription_details'] as Record<string, unknown> | undefined;
  return fromRef(subDetails?.['subscription']);
}

// ── Public service ───────────────────────────────────────────────────────────

export const stripeService = {
  /**
   * Creates a Stripe Checkout session.
   * - mode=payment  for one-time plans (basic, essential)
   * - mode=subscription for the monthly plan
   */
  async createCheckoutSession(
    userId: string,
    planSlug: PlanSlug,
  ): Promise<{ url: string; sessionId: string }> {
    const stripe = getStripe();

    if (planSlug === PLAN_SLUGS.FREE) {
      throw Object.assign(new Error('O plano gratuito não requer pagamento'), {
        statusCode: 400,
      });
    }

    // Get or create Stripe customer
    const user = await UserModel.findById(userId).select('email stripeCustomerId name');
    if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name ?? undefined,
        metadata: { userId },
      });
      customerId = customer.id;
      await UserModel.findByIdAndUpdate(userId, {
        stripeCustomerId: customerId,
      });
    }

    const plan = await billingService.getPlanBySlug(planSlug);
    const priceId = getPriceId(planSlug);

    const sessionParams = {
      customer: customerId,
      mode: (plan.isMonthly ? 'subscription' : 'payment') as 'subscription' | 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${config.billing.frontendUrl}/billing?success=true&plan=${planSlug}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.billing.frontendUrl}/plans`,
      metadata: { userId, planSlug },
      ...(plan.isMonthly && {
        subscription_data: { metadata: { userId, planSlug } },
      }),
    };

    let session: Awaited<ReturnType<StripeClient['checkout']['sessions']['create']>>;
    try {
      session = await stripe.checkout.sessions.create(sessionParams);
    } catch (stripeErr) {
      const msg = stripeErr instanceof Error ? stripeErr.message : 'Stripe error';
      throw Object.assign(new Error(`Falha ao criar sessão de pagamento: ${msg}`), {
        statusCode: 503,
      });
    }
    if (!session.url) {
      throw Object.assign(new Error('Falha ao criar sessão de checkout'), {
        statusCode: 500,
      });
    }
    return { url: session.url, sessionId: session.id };
  },

  /**
   * Creates a Stripe Customer Portal session so the user can manage
   * their subscription, update payment methods, or cancel.
   */
  async createPortalSession(userId: string): Promise<string> {
    const stripe = getStripe();

    const user = await UserModel.findById(userId).select('stripeCustomerId');
    if (!user?.stripeCustomerId) {
      throw Object.assign(new Error('Nenhum cliente Stripe encontrado para este usuário'), {
        statusCode: 404,
      });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${config.billing.frontendUrl}/billing`,
    });
    return session.url;
  },

  /**
   * Verifies a Checkout session with Stripe and applies the plan if the webhook
   * hasn't processed yet. Used as a fallback when webhook delivery is delayed.
   */
  async verifyAndApplyCheckoutSession(
    sessionId: string,
    userId: string,
  ): Promise<import('./billing.service').UserBillingStatus> {
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.metadata?.['userId'] !== userId) {
      throw Object.assign(new Error('Session não autorizada'), { statusCode: 403 });
    }

    const planSlug = session.metadata?.['planSlug'] as PlanSlug | undefined;

    if (planSlug && session.payment_status === 'paid') {
      const currentStatus = await billingService.getUserBillingStatus(userId);
      if (currentStatus.planSlug !== planSlug) {
        await billingService.applyPlanPurchase(userId, planSlug);
        logger.info(`[Stripe] Plano aplicado via verify-session: user=${userId} plan=${planSlug}`);
      }
    }

    return billingService.getUserBillingStatus(userId);
  },

  /**
   * Verifies the Stripe webhook signature and dispatches to handlers.
   * Expects the raw request body (Buffer).
   */
  async handleWebhook(payload: Buffer, signature: string): Promise<void> {
    const stripe = getStripe();
    const secret = config.stripe.webhookSecret;

    if (!secret) {
      throw Object.assign(new Error('Webhook secret não configurado'), {
        statusCode: 500,
      });
    }

    let event: ReturnType<StripeClient['webhooks']['constructEvent']>;
    try {
      event = stripe.webhooks.constructEvent(payload, signature, secret);
    } catch (err) {
      throw Object.assign(new Error(`Webhook signature inválida: ${(err as Error).message}`), {
        statusCode: 400,
      });
    }

    logger.info(`[Stripe] Webhook: ${event.type}`);

    const data = event.data.object as unknown as Record<string, unknown>;

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(data);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(data);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(data);
        break;
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(stripe, data);
        break;
      default:
        logger.info(`[Stripe] Evento não tratado: ${event.type}`);
    }
  },
};

// ── Webhook handlers ─────────────────────────────────────────────────────────

async function handleCheckoutCompleted(session: Record<string, unknown>): Promise<void> {
  const metadata = session['metadata'] as Record<string, string> | null;
  const userId = metadata?.['userId'];
  const planSlug = metadata?.['planSlug'];

  if (!userId || !planSlug) {
    logger.warn('[Stripe] checkout.session.completed sem metadata', { sessionId: session['id'] });
    return;
  }

  // Skip if verify-payment endpoint already applied the plan (prevents duplicate transactions)
  const currentStatus = await billingService.getUserBillingStatus(userId);
  const alreadyApplied = currentStatus.planSlug === planSlug;

  if (session['mode'] === 'payment') {
    if (!alreadyApplied) {
      await billingService.applyPlanPurchase(userId, planSlug as PlanSlug);
    }
    logger.info(
      `[Stripe] Plano aplicado (one-time): user=${userId} plan=${planSlug} skip=${alreadyApplied}`,
    );
  } else if (session['mode'] === 'subscription') {
    const customer = session['customer'];
    const customerId = typeof customer === 'string' ? customer : null;
    if (customerId) {
      await UserModel.findByIdAndUpdate(userId, { stripeCustomerId: customerId });
    }
    if (!alreadyApplied) {
      await billingService.applyPlanPurchase(userId, planSlug as PlanSlug);
    }
    logger.info(
      `[Stripe] Checkout de assinatura concluído: user=${userId} plan=${planSlug} skip=${alreadyApplied}`,
    );
  }
}

async function handleSubscriptionUpdated(subscription: Record<string, unknown>): Promise<void> {
  const metadata = subscription['metadata'] as Record<string, string> | null;
  const userId = metadata?.['userId'];
  if (!userId) return;

  const status = subscription['status'] as string;
  const periodEnd = extractSubscriptionPeriodEnd(subscription);
  const subscriptionId = subscription['id'] as string;

  await UserModel.findByIdAndUpdate(userId, {
    subscriptionStatus: status,
    ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}),
  });

  await SubscriptionModel.findOneAndUpdate(
    { stripeSubscriptionId: subscriptionId },
    { status, ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}) },
    { new: true },
  );

  logger.info(`[Stripe] Subscription atualizada: user=${userId} status=${status}`);
}

async function handleSubscriptionDeleted(subscription: Record<string, unknown>): Promise<void> {
  const metadata = subscription['metadata'] as Record<string, string> | null;
  const userId = metadata?.['userId'];
  if (!userId) return;

  const freePlan = await PlanModel.findOne({ slug: PLAN_SLUGS.FREE });
  await UserModel.findByIdAndUpdate(userId, {
    planId: freePlan?._id ?? null,
    creditsRemaining: 0,
    subscriptionStatus: 'canceled',
    currentPeriodEnd: null,
  });

  await SubscriptionModel.findOneAndUpdate(
    { stripeSubscriptionId: subscription['id'] as string },
    { status: 'canceled', canceledAt: new Date() },
  );

  logger.info(`[Stripe] Subscription cancelada: user=${userId}`);
}

async function handleInvoicePaymentSucceeded(
  stripe: StripeClient,
  invoice: Record<string, unknown>,
): Promise<void> {
  const subscriptionId = extractInvoiceSubscriptionId(invoice);

  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const userId = subscription.metadata?.['userId'];
  const planSlug = subscription.metadata?.['planSlug'];

  if (!userId || !planSlug) return;

  const plan = await PlanModel.findOne({ slug: planSlug });
  if (!plan) return;

  const periodEnd = extractSubscriptionPeriodEnd(
    subscription as unknown as Record<string, unknown>,
  );
  const customer = subscription.customer;
  const customerId = typeof customer === 'string' ? customer : customer.id;

  await UserModel.findByIdAndUpdate(userId, {
    planId: plan._id,
    creditsRemaining: plan.creditAmount,
    subscriptionStatus: 'active',
    ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}),
    stripeCustomerId: customerId,
  });

  await SubscriptionModel.findOneAndUpdate(
    { stripeSubscriptionId: subscriptionId },
    {
      userId,
      planId: plan._id,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      status: 'active',
      ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  // Log a credit transaction for subscription renewals (subscription_cycle).
  // Initial purchases are already logged via applyPlanPurchase in handleCheckoutCompleted.
  const billingReason = invoice['billing_reason'] as string | null;
  if (billingReason === 'subscription_cycle') {
    const { Types } = await import('mongoose');
    const { CreditTransactionModel } = await import('./models/credit-transaction.model');
    await CreditTransactionModel.create({
      userId: new Types.ObjectId(userId),
      type: 'grant',
      amount: plan.creditAmount,
      balanceAfter: plan.creditAmount,
      reason: `Renovação mensal: ${plan.name}`,
      analysisId: null,
      planId: plan._id,
    });
  }

  logger.info(
    `[Stripe] Invoice paga / créditos renovados: user=${userId} plan=${planSlug} reason=${billingReason ?? 'unknown'}`,
  );
}
