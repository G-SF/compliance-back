/**
 * Contract Usage Model
 *
 * Tracks per-contract consumption of resources that have per-contract limits:
 *  - questionsUsed: how many /ask calls have been made for this document
 *  - autoFixUsed:   how many /generate-patches calls have been made for this document
 *
 * Keyed by (userId, documentRecordId) — one record per user per document.
 */

import { Schema, model, Document, Types } from 'mongoose';

export interface IContractUsage extends Document {
  userId: Types.ObjectId;
  documentRecordId: Types.ObjectId;
  questionsUsed: number;
  autoFixUsed: number;
  createdAt: Date;
  updatedAt: Date;
}

const contractUsageSchema = new Schema<IContractUsage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    documentRecordId: {
      type: Schema.Types.ObjectId,
      ref: 'DocumentRecord',
      required: true,
    },
    questionsUsed: { type: Number, default: 0, min: 0 },
    autoFixUsed: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

// One usage record per user per document
contractUsageSchema.index({ userId: 1, documentRecordId: 1 }, { unique: true });

export const ContractUsageModel = model<IContractUsage>('ContractUsage', contractUsageSchema);
