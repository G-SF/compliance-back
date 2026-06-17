/**
 * Billing Service
 *
 * Core business logic for:
 *  - Plan resolution and seeding
 *  - Atomic credit deduction / restoration
 *  - Per-contract usage tracking (questions, auto-fix)
 *  - Plan upgrades and credit grants
 *  - Monthly subscription renewal (credit reset)
 */

import { Types } from 'mongoose';
import { UserModel } from '../auth/models/user.model';
import { PlanModel, IPlan, PLAN_DEFINITIONS, PLAN_SLUGS, PlanSlug } from './models/plan.model';
import { SubscriptionModel } from './models/subscription.model';
import { CreditTransactionModel } from './models/credit-transaction.model';
import { ContractUsageModel } from './models/contract-usage.model';
import { logger } from '../../shared/utils/logger';

// ── Public types ────────────────────────────────────────────────────────────

export interface UserBillingStatus {
  planSlug: PlanSlug;
  planName: string;
  creditsRemaining: number;
  analysisLimit: number;
  questionLimitPerContract: number;
  autoFixLimitPerContract: number;
  /** Max electronic signatures. -1 = unlimited, 0 = blocked */
  signatureLimit: number;
  /** Signatures already consumed (lifetime) */
  signaturesUsed: number;
  /** Remaining signatures. -1 = unlimited */
  signaturesRemaining: number;
  isMonthly: boolean;
  subscriptionStatus: string | null;
  currentPeriodEnd: Date | null;
}

export interface ContractLimits {
  questionsUsed: number;
  questionsRemaining: number;
  autoFixUsed: number;
  autoFixRemaining: number; // -1 = unlimited
}

// ── Service ─────────────────────────────────────────────────────────────────

export const billingService = {
  // ── Plan seeding ──────────────────────────────────────────────────────────

  /**
   * Upserts all plan definitions into the database.
   * Called once at startup — idempotent.
   */
  async seedPlans(): Promise<void> {
    for (const def of PLAN_DEFINITIONS) {
      await PlanModel.findOneAndUpdate({ slug: def.slug }, def, {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      });
    }
    logger.info('[Billing] Plans seeded successfully');
  },

  // ── Plan resolution ───────────────────────────────────────────────────────

  async getPlanBySlug(slug: PlanSlug): Promise<IPlan> {
    const plan = await PlanModel.findOne({ slug, active: true });
    if (!plan) throw Object.assign(new Error(`Plan "${slug}" not found`), { statusCode: 500 });
    return plan;
  },

  async getPlanById(planId: Types.ObjectId | string): Promise<IPlan> {
    const plan = await PlanModel.findById(planId);
    if (!plan) throw Object.assign(new Error('Plan not found'), { statusCode: 500 });
    return plan;
  },

  async getAllActivePlans(): Promise<IPlan[]> {
    return PlanModel.find({ active: true }).sort({ priceInCents: 1 });
  },

  // ── User billing status ───────────────────────────────────────────────────

  async getUserBillingStatus(userId: string): Promise<UserBillingStatus> {
    const user = await UserModel.findById(userId).select(
      'planId creditsRemaining signaturesUsed subscriptionStatus currentPeriodEnd',
    );
    if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });

    const planId = user.planId ?? null;
    const plan = planId
      ? await PlanModel.findById(planId)
      : await PlanModel.findOne({ slug: PLAN_SLUGS.FREE });

    if (!plan) throw Object.assign(new Error('Plan not found'), { statusCode: 500 });

    const signaturesUsed = user.signaturesUsed ?? 0;
    const signatureLimit = plan.signatureLimit;

    return {
      planSlug: plan.slug as PlanSlug,
      planName: plan.name,
      creditsRemaining: user.creditsRemaining ?? 0,
      analysisLimit: plan.analysisLimit,
      questionLimitPerContract: plan.questionLimitPerContract,
      autoFixLimitPerContract: plan.autoFixLimitPerContract,
      signatureLimit,
      signaturesUsed,
      signaturesRemaining:
        signatureLimit === -1 ? -1 : Math.max(0, signatureLimit - signaturesUsed),
      isMonthly: plan.isMonthly,
      subscriptionStatus: user.subscriptionStatus ?? null,
      currentPeriodEnd: user.currentPeriodEnd ?? null,
    };
  },

  // ── Signature operations ──────────────────────────────────────────────────

  /**
   * Atomically consumes 1 signature from the user's plan allowance.
   * - signatureLimit === -1 → unlimited (always allowed, still counts usage)
   * - signatureLimit === 0  → blocked
   * - otherwise             → allowed while signaturesUsed < limit
   */
  async consumeSignature(
    userId: string,
  ): Promise<{ allowed: boolean; signaturesUsed: number; signaturesRemaining: number }> {
    const status = await this.getUserBillingStatus(userId);
    const limit = status.signatureLimit;

    if (limit === 0) {
      return { allowed: false, signaturesUsed: status.signaturesUsed, signaturesRemaining: 0 };
    }

    // Atomic guard: for limited plans, only increment while under the limit.
    const filter = limit === -1 ? { _id: userId } : { _id: userId, signaturesUsed: { $lt: limit } };

    const updated = await UserModel.findOneAndUpdate(
      filter,
      { $inc: { signaturesUsed: 1 } },
      { new: true },
    ).select('signaturesUsed');

    if (!updated) {
      return { allowed: false, signaturesUsed: status.signaturesUsed, signaturesRemaining: 0 };
    }

    return {
      allowed: true,
      signaturesUsed: updated.signaturesUsed,
      signaturesRemaining: limit === -1 ? -1 : Math.max(0, limit - updated.signaturesUsed),
    };
  },

  /** Restores 1 signature (e.g. when signing fails after the allowance was consumed). */
  async restoreSignature(userId: string, _reason: string): Promise<void> {
    await UserModel.findOneAndUpdate(
      { _id: userId, signaturesUsed: { $gte: 1 } },
      { $inc: { signaturesUsed: -1 } },
    );
  },

  // ── Credit operations ─────────────────────────────────────────────────────

  /**
   * Atomically deducts 1 credit from the user.
   * Returns the updated user or null if insufficient credits.
   * Uses MongoDB $inc with a balance guard to prevent double-spend.
   */
  async deductCredit(
    userId: string,
    reason: string,
    analysisId?: string,
  ): Promise<{ success: boolean; creditsRemaining: number }> {
    const updated = await UserModel.findOneAndUpdate(
      { _id: userId, creditsRemaining: { $gte: 1 } },
      { $inc: { creditsRemaining: -1 } },
      { new: true },
    ).select('creditsRemaining planId');

    if (!updated) {
      return { success: false, creditsRemaining: 0 };
    }

    // Async audit log — never fail the request if this fails
    CreditTransactionModel.create({
      userId: new Types.ObjectId(userId),
      type: 'consume',
      amount: -1,
      balanceAfter: updated.creditsRemaining,
      reason,
      analysisId: analysisId ? new Types.ObjectId(analysisId) : null,
      planId: updated.planId ?? null,
    }).catch((err: unknown) =>
      logger.warn('[Billing] Failed to write credit transaction', { err }),
    );

    return { success: true, creditsRemaining: updated.creditsRemaining };
  },

  /**
   * Restores 1 credit — called when an analysis fails after credit was deducted.
   */
  async restoreCredit(userId: string, reason: string): Promise<void> {
    const updated = await UserModel.findByIdAndUpdate(
      userId,
      { $inc: { creditsRemaining: 1 } },
      { new: true },
    ).select('creditsRemaining planId');

    CreditTransactionModel.create({
      userId: new Types.ObjectId(userId),
      type: 'restore',
      amount: 1,
      balanceAfter: updated?.creditsRemaining ?? 0,
      reason,
      analysisId: null,
      planId: updated?.planId ?? null,
    }).catch((err: unknown) =>
      logger.warn('[Billing] Failed to write restore transaction', { err }),
    );
  },

  /**
   * Grants credits to a user (on plan purchase or manual adjustment).
   * For monthly plan: resets to creditAmount. For others: adds to balance.
   */
  async grantCredits(opts: {
    userId: string;
    planId: string;
    creditAmount: number;
    reason: string;
    replace?: boolean; // true = set balance, false = add to balance
  }): Promise<number> {
    const update = opts.replace
      ? { $set: { creditsRemaining: opts.creditAmount } }
      : { $inc: { creditsRemaining: opts.creditAmount } };

    const updated = await UserModel.findByIdAndUpdate(opts.userId, update, { new: true }).select(
      'creditsRemaining',
    );

    const balanceAfter = updated?.creditsRemaining ?? opts.creditAmount;

    await CreditTransactionModel.create({
      userId: new Types.ObjectId(opts.userId),
      type: 'grant',
      amount: opts.creditAmount,
      balanceAfter,
      reason: opts.reason,
      analysisId: null,
      planId: new Types.ObjectId(opts.planId),
    });

    return balanceAfter;
  },

  // ── Plan upgrade / downgrade ──────────────────────────────────────────────

  /**
   * Applies a one-time plan purchase:
   *  1. Sets user.planId to the new plan
   *  2. Grants the plan's credits (replaces balance for monthly, adds for one-time)
   *  3. Clears subscription fields for one-time plans
   */
  async applyPlanPurchase(userId: string, planSlug: PlanSlug): Promise<void> {
    const plan = await this.getPlanBySlug(planSlug);

    if (plan.isMonthly) {
      // Monthly plan: subscription handled by Stripe webhook; this is for test mode
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      await UserModel.findByIdAndUpdate(userId, {
        planId: plan._id,
        creditsRemaining: plan.creditAmount,
        subscriptionStatus: 'active',
        currentPeriodEnd: periodEnd,
      });
    } else {
      // One-time purchase: add credits, update plan
      await UserModel.findByIdAndUpdate(userId, {
        planId: plan._id,
        creditsRemaining: plan.creditAmount,
        subscriptionStatus: null,
        currentPeriodEnd: null,
      });
    }

    await this.grantCredits({
      userId,
      planId: plan._id.toString(),
      creditAmount: plan.creditAmount,
      reason: `Compra de plano: ${plan.name}`,
      replace: true, // balance is already set above; log as grant
    }).catch(() => undefined); // ignore double-log

    logger.info(`[Billing] Plan applied: user=${userId} plan=${plan.slug}`);
  },

  // ── Per-contract limits ───────────────────────────────────────────────────

  /**
   * Returns current usage counters for a document.
   * Creates the record if it doesn't exist yet.
   */
  async getContractUsage(userId: string, documentRecordId: string): Promise<ContractLimits> {
    const status = await this.getUserBillingStatus(userId);
    const usage = await ContractUsageModel.findOneAndUpdate(
      {
        userId: new Types.ObjectId(userId),
        documentRecordId: new Types.ObjectId(documentRecordId),
      },
      {},
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    const qLimit = status.questionLimitPerContract;
    const afLimit = status.autoFixLimitPerContract;

    return {
      questionsUsed: usage.questionsUsed,
      questionsRemaining: Math.max(0, qLimit - usage.questionsUsed),
      autoFixUsed: usage.autoFixUsed,
      autoFixRemaining: afLimit === -1 ? -1 : Math.max(0, afLimit - usage.autoFixUsed),
    };
  },

  /**
   * Atomically increments questionsUsed for a document.
   * Returns false if the limit has been reached.
   */
  async consumeQuestion(
    userId: string,
    documentRecordId: string,
  ): Promise<{ allowed: boolean; questionsUsed: number; questionsRemaining: number }> {
    const status = await this.getUserBillingStatus(userId);
    const limit = status.questionLimitPerContract;

    const updated = await ContractUsageModel.findOneAndUpdate(
      {
        userId: new Types.ObjectId(userId),
        documentRecordId: new Types.ObjectId(documentRecordId),
        questionsUsed: { $lt: limit },
      },
      { $inc: { questionsUsed: 1 } },
      { upsert: false, new: true },
    );

    if (!updated) {
      // Check current state to return accurate numbers
      const current = await ContractUsageModel.findOne({
        userId: new Types.ObjectId(userId),
        documentRecordId: new Types.ObjectId(documentRecordId),
      });
      return {
        allowed: false,
        questionsUsed: current?.questionsUsed ?? limit,
        questionsRemaining: 0,
      };
    }

    return {
      allowed: true,
      questionsUsed: updated.questionsUsed,
      questionsRemaining: Math.max(0, limit - updated.questionsUsed),
    };
  },

  /**
   * Atomically increments autoFixUsed for a document.
   * Returns false if limit is 0 (plan doesn't allow) or exhausted.
   */
  async consumeAutoFix(
    userId: string,
    documentRecordId: string,
  ): Promise<{ allowed: boolean; autoFixUsed: number }> {
    const status = await this.getUserBillingStatus(userId);
    const limit = status.autoFixLimitPerContract;

    // Unlimited
    if (limit === -1) {
      await ContractUsageModel.findOneAndUpdate(
        {
          userId: new Types.ObjectId(userId),
          documentRecordId: new Types.ObjectId(documentRecordId),
        },
        { $inc: { autoFixUsed: 1 } },
        { upsert: true, new: true },
      );
      return { allowed: true, autoFixUsed: -1 };
    }

    // Blocked (free/basic plan)
    if (limit === 0) {
      return { allowed: false, autoFixUsed: 0 };
    }

    // Limited (essential: 1 per contract)
    const updated = await ContractUsageModel.findOneAndUpdate(
      {
        userId: new Types.ObjectId(userId),
        documentRecordId: new Types.ObjectId(documentRecordId),
        autoFixUsed: { $lt: limit },
      },
      { $inc: { autoFixUsed: 1 } },
      { upsert: false, new: true },
    );

    if (!updated) {
      const current = await ContractUsageModel.findOne({
        userId: new Types.ObjectId(userId),
        documentRecordId: new Types.ObjectId(documentRecordId),
      });
      return { allowed: false, autoFixUsed: current?.autoFixUsed ?? limit };
    }

    return { allowed: true, autoFixUsed: updated.autoFixUsed };
  },

  // ── Subscription renewal ──────────────────────────────────────────────────

  /**
   * Resets credits for all active monthly subscriptions whose period has ended.
   * Called by the cron job in main.ts — safe to call multiple times.
   */
  async processMonthlyRenewals(): Promise<void> {
    const now = new Date();
    const expiredSubscriptions = await SubscriptionModel.find({
      status: 'active',
      currentPeriodEnd: { $lte: now },
    }).populate<{ planId: IPlan }>('planId');

    if (expiredSubscriptions.length === 0) return;

    logger.info(`[Billing] Processing ${expiredSubscriptions.length} monthly renewal(s)`);

    for (const sub of expiredSubscriptions) {
      try {
        const plan = sub.planId as unknown as IPlan;
        const newPeriodEnd = new Date(sub.currentPeriodEnd);
        newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);

        // Reset credits
        await UserModel.findByIdAndUpdate(sub.userId, {
          creditsRemaining: plan.creditAmount,
          currentPeriodEnd: newPeriodEnd,
        });

        // Advance subscription period
        await SubscriptionModel.findByIdAndUpdate(sub._id, {
          currentPeriodEnd: newPeriodEnd,
        });

        await CreditTransactionModel.create({
          userId: sub.userId,
          type: 'grant',
          amount: plan.creditAmount,
          balanceAfter: plan.creditAmount,
          reason: `Monthly renewal: ${plan.name}`,
          analysisId: null,
          planId: plan._id,
        });

        logger.info(`[Billing] Renewed subscription for user ${sub.userId.toString()}`);
      } catch (err) {
        logger.warn(`[Billing] Failed to renew subscription ${sub._id.toString()}`, { err });
      }
    }
  },

  // ── Credit history ────────────────────────────────────────────────────────

  async getCreditHistory(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{ transactions: ICreditTransaction[]; total: number }> {
    const skip = (page - 1) * limit;
    const [transactions, total] = await Promise.all([
      CreditTransactionModel.find({ userId: new Types.ObjectId(userId) })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      CreditTransactionModel.countDocuments({ userId: new Types.ObjectId(userId) }),
    ]);
    return { transactions, total };
  },
};

// Re-export types needed by other modules
import type { ICreditTransaction } from './models/credit-transaction.model';
