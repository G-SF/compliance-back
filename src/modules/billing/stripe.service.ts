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

// â”€â”€ Stripe instance type â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type StripeClient = StripeLib.Stripe;

// â”€â”€ Lazy-init Stripe client â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

let _stripe: StripeClient | null = null;

function getStripe(): StripeClient {
  if (!_stripe) {
    if (!config.stripe.secretKey) {
      throw Object.assign(new Error('Stripe nÃ£o estÃ¡ configurado'), { statusCode: 503 });
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
    throw Object.assign(new Error(`Nenhum preÃ§o Stripe configurado para o plano: ${planSlug}`), {
      statusCode: 400,
    });
  }
  return priceId;
}

// â”€â”€ Public service â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
      throw Object.assign(new Error('O plano gratuito nÃ£o requer pagamento'), {
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
      success_url: `${config.billing.frontendUrl}/billing?success=true&plan=${planSlug}`,
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
      throw Object.assign(new Error('Falha ao criar sessÃ£o de checkout'), {
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
      throw Object.assign(new Error('Nenhum cliente Stripe encontrado para este usuÃ¡rio'), {
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
   * Verifies the Stripe webhook signature and dispatches to handlers.
   * Expects the raw request body (Buffer).
   */
  async handleWebhook(payload: Buffer, signature: string): Promise<void> {
    const stripe = getStripe();
    const secret = config.stripe.webhookSecret;

    if (!secret) {
      throw Object.assign(new Error('Webhook secret nÃ£o configurado'), {
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
        logger.info(`[Stripe] Evento nÃ£o tratado: ${event.type}`);
    }
  },
};

// â”€â”€ Webhook handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function handleCheckoutCompleted(session: Record<string, unknown>): Promise<void> {
  const metadata = session['metadata'] as Record<string, string> | null;
  const userId = metadata?.['userId'];
  const planSlug = metadata?.['planSlug'];

  if (!userId || !planSlug) {
    logger.warn('[Stripe] checkout.session.completed sem metadata', { sessionId: session['id'] });
    return;
  }

  if (session['mode'] === 'payment') {
    await billingService.applyPlanPurchase(userId, planSlug as PlanSlug);
    logger.info(`[Stripe] Plano aplicado (one-time): user=${userId} plan=${planSlug}`);
  } else if (session['mode'] === 'subscription') {
    const customer = session['customer'];
    const customerId = typeof customer === 'string' ? customer : null;
    if (customerId) {
      await UserModel.findByIdAndUpdate(userId, { stripeCustomerId: customerId });
    }
    // Apply plan immediately so status is updated before invoice.payment_succeeded fires
    await billingService.applyPlanPurchase(userId, planSlug as PlanSlug);
    logger.info(`[Stripe] Checkout de assinatura concluído: user=${userId} plan=${planSlug}`);
  }
}

async function handleSubscriptionUpdated(subscription: Record<string, unknown>): Promise<void> {
  const metadata = subscription['metadata'] as Record<string, string> | null;
  const userId = metadata?.['userId'];
  if (!userId) return;

  const status = subscription['status'] as string;
  const periodEnd = new Date((subscription['current_period_end'] as number) * 1000);
  const subscriptionId = subscription['id'] as string;

  await UserModel.findByIdAndUpdate(userId, {
    subscriptionStatus: status,
    currentPeriodEnd: periodEnd,
  });

  await SubscriptionModel.findOneAndUpdate(
    { stripeSubscriptionId: subscriptionId },
    { status, currentPeriodEnd: periodEnd },
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
  const subscriptionId =
    typeof invoice['subscription'] === 'string' ? invoice['subscription'] : null;

  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const userId = subscription.metadata?.['userId'];
  const planSlug = subscription.metadata?.['planSlug'];

  if (!userId || !planSlug) return;

  const plan = await PlanModel.findOne({ slug: planSlug });
  if (!plan) return;

  const periodEnd = new Date(
    (subscription as unknown as Record<string, number>)['current_period_end'] * 1000,
  );
  const customer = subscription.customer;
  const customerId = typeof customer === 'string' ? customer : customer.id;

  await UserModel.findByIdAndUpdate(userId, {
    planId: plan._id,
    creditsRemaining: plan.creditAmount,
    subscriptionStatus: 'active',
    currentPeriodEnd: periodEnd,
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
      currentPeriodEnd: periodEnd,
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
