/**
 * Plan Model
 *
 * Static plan definitions seeded at startup.
 * Slugs are used as stable references across the codebase.
 */

import { Schema, model, Document } from 'mongoose';

export const PLAN_SLUGS = {
  FREE: 'free',
  BASIC: 'basic',
  ESSENTIAL: 'essential',
  MONTHLY: 'monthly',
} as const;

export type PlanSlug = (typeof PLAN_SLUGS)[keyof typeof PLAN_SLUGS];

export interface IPlan extends Document {
  slug: PlanSlug;
  name: string;
  /** Price in BRL cents (0 for free) */
  priceInCents: number;
  /** Crossed-out (anchor) price in BRL cents — null if none */
  anchorPriceInCents: number | null;
  /** Credits granted on purchase / reset. For monthly this resets monthly. */
  creditAmount: number;
  /** Max analyses per period (== creditAmount for one-time plans) */
  analysisLimit: number;
  /** Max questions a user can ask about a single contract */
  questionLimitPerContract: number;
  /** Max auto-fix calls per contract. -1 = unlimited, 0 = blocked */
  autoFixLimitPerContract: number;
  /** Max electronic signatures allowed. -1 = unlimited, 0 = blocked */
  signatureLimit: number;
  /** Whether this is a recurring subscription plan */
  isMonthly: boolean;
  /** Stripe Price ID (null until Stripe is configured) */
  stripePriceId: string | null;
  active: boolean;
}

const planSchema = new Schema<IPlan>(
  {
    slug: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    priceInCents: { type: Number, required: true, min: 0 },
    anchorPriceInCents: { type: Number, default: null },
    creditAmount: { type: Number, required: true, min: 0 },
    analysisLimit: { type: Number, required: true, min: 0 },
    questionLimitPerContract: { type: Number, required: true, min: 0 },
    autoFixLimitPerContract: { type: Number, required: true, min: -1 },
    signatureLimit: { type: Number, required: true, default: 0, min: -1 },
    isMonthly: { type: Boolean, required: true, default: false },
    stripePriceId: { type: String, default: null },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

export const PlanModel = model<IPlan>('Plan', planSchema);

/** Plan definitions — single source of truth for seeding */
export const PLAN_DEFINITIONS: Omit<IPlan, keyof Document | 'createdAt' | 'updatedAt'>[] = [
  {
    slug: 'free',
    name: 'Gratuito',
    priceInCents: 0,
    anchorPriceInCents: null,
    creditAmount: 2,
    analysisLimit: 2,
    questionLimitPerContract: 1,
    autoFixLimitPerContract: 0,
    signatureLimit: 0, // sem assinatura
    isMonthly: false,
    stripePriceId: null,
    active: true,
  },
  {
    slug: 'basic',
    name: 'Básico',
    priceInCents: 690,
    anchorPriceInCents: null,
    creditAmount: 5,
    analysisLimit: 5,
    questionLimitPerContract: 2,
    autoFixLimitPerContract: 0,
    signatureLimit: 5, // até 5 assinaturas
    isMonthly: false,
    stripePriceId: null,
    active: true,
  },
  {
    slug: 'essential',
    name: 'Essencial',
    priceInCents: 1490,
    anchorPriceInCents: 1990,
    creditAmount: 10,
    analysisLimit: 10,
    questionLimitPerContract: 5,
    autoFixLimitPerContract: 1,
    signatureLimit: -1, // assinaturas ilimitadas
    isMonthly: false,
    stripePriceId: null,
    active: true,
  },
  {
    slug: 'monthly',
    name: 'Plano Mensal',
    priceInCents: 3490,
    anchorPriceInCents: null,
    creditAmount: 40,
    analysisLimit: 40,
    questionLimitPerContract: 10,
    autoFixLimitPerContract: -1, // unlimited
    signatureLimit: -1, // assinaturas ilimitadas
    isMonthly: true,
    stripePriceId: null,
    active: true,
  },
];
