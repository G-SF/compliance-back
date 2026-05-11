/**
 * User Model (Mongoose)
 *
 * Intentionally kept minimal — add profile fields as the product grows.
 * The password field is excluded from serialisation via `toJSON` transform.
 */

import { Schema, model, Document, Types } from 'mongoose';

export type UserRole = 'user' | 'admin';
export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'trialing' | 'none';

export interface IUser extends Document {
  email: string;
  password: string;
  role: UserRole;
  // ── Billing ────────────────────────────────────────────────────────────────
  /** Reference to the active Plan */
  planId: Types.ObjectId | null;
  /** Available credits (1 credit = 1 analysis). Atomically decremented. */
  creditsRemaining: number;
  /** Stripe customer ID — set on first checkout */
  stripeCustomerId: string | null;
  /** Subscription status (only relevant for monthly plan) */
  subscriptionStatus: SubscriptionStatus | null;
  /** When the current billing period ends (monthly plan only) */
  currentPeriodEnd: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      // Never return the hashed password in API responses
      select: false,
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    // ── Billing fields ────────────────────────────────────────────────────────
    planId: { type: Schema.Types.ObjectId, ref: 'Plan', default: null },
    creditsRemaining: { type: Number, default: 2, min: 0 },
    stripeCustomerId: { type: String, default: null, sparse: true },
    subscriptionStatus: {
      type: String,
      enum: ['active', 'canceled', 'past_due', 'trialing', 'none', null],
      default: null,
    },
    currentPeriodEnd: { type: Date, default: null },
  },
  {
    timestamps: true,
    // Remove __v and hide password in all JSON outputs
    toJSON: {
      versionKey: false,
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret['password'];
        return ret;
      },
    },
  },
);

export const UserModel = model<IUser>('User', userSchema);
