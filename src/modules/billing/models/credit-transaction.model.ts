/**
 * Credit Transaction Model
 *
 * Immutable audit log of every credit change.
 * Never update or delete — only insert.
 */

import { Schema, model, Document, Types } from 'mongoose';

export type TransactionType =
  | 'grant' // credits added on plan purchase or monthly reset
  | 'consume' // 1 credit deducted per analysis
  | 'restore' // credit returned when analysis fails
  | 'adjustment'; // manual admin adjustment

export interface ICreditTransaction extends Document {
  userId: Types.ObjectId;
  type: TransactionType;
  /** Positive = credit added. Negative = credit deducted. */
  amount: number;
  /** Credits remaining AFTER this transaction */
  balanceAfter: number;
  /** Human-readable reason */
  reason: string;
  /** Related entity refs (optional) */
  analysisId: Types.ObjectId | null;
  planId: Types.ObjectId | null;
  createdAt: Date;
}

const creditTransactionSchema = new Schema<ICreditTransaction>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: ['grant', 'consume', 'restore', 'adjustment'],
      required: true,
    },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    reason: { type: String, required: true },
    analysisId: { type: Schema.Types.ObjectId, ref: 'Analysis', default: null },
    planId: { type: Schema.Types.ObjectId, ref: 'Plan', default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: { versionKey: false },
  },
);

creditTransactionSchema.index({ userId: 1, createdAt: -1 });

export const CreditTransactionModel = model<ICreditTransaction>(
  'CreditTransaction',
  creditTransactionSchema,
);
