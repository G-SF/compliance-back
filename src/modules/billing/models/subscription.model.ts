/**
 * Subscription Model
 *
 * Tracks the user's active subscription (monthly plan).
 * One-time purchases (basic, essential) are NOT subscriptions —
 * they are credit grants without a recurring status.
 */

import { Schema, model, Document, Types } from 'mongoose';

export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete';

export interface ISubscription extends Document {
  userId: Types.ObjectId;
  planId: Types.ObjectId;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: SubscriptionStatus;
  /** When the current billing period ends — credits reset on this date */
  currentPeriodEnd: Date;
  /** When the subscription was canceled (null if still active) */
  canceledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const subscriptionSchema = new Schema<ISubscription>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    planId: { type: Schema.Types.ObjectId, ref: 'Plan', required: true },
    stripeCustomerId: { type: String, default: null },
    stripeSubscriptionId: { type: String, default: null, sparse: true },
    status: {
      type: String,
      enum: ['active', 'canceled', 'past_due', 'trialing', 'incomplete'],
      required: true,
    },
    currentPeriodEnd: { type: Date, required: true },
    canceledAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

// Only one active subscription per user
subscriptionSchema.index({ userId: 1, status: 1 });
subscriptionSchema.index({ stripeSubscriptionId: 1 }, { sparse: true });

export const SubscriptionModel = model<ISubscription>('Subscription', subscriptionSchema);
