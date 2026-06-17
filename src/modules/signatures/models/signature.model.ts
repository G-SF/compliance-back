/**
 * Signature Model
 *
 * Immutable evidence log for each electronic signature event.
 * One record per signature applied to a SignedDocument.
 * Never update or delete — only insert.
 */

import { Schema, model, Document, Types } from 'mongoose';

export interface ISignature extends Document {
  documentId: Types.ObjectId;
  userId: Types.ObjectId;
  email: string;
  /** Hand-drawn signature as a Base64 PNG data URL */
  signatureImage: string;
  ipAddress: string | null;
  userAgent: string | null;
  /** SHA-256 of the original PDF at signing time */
  pdfHash: string;
  signedAt: Date;
}

const signatureSchema = new Schema<ISignature>(
  {
    documentId: {
      type: Schema.Types.ObjectId,
      ref: 'SignedDocument',
      required: true,
      index: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    email: { type: String, required: true },
    signatureImage: { type: String, required: true },
    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null },
    pdfHash: { type: String, required: true },
    signedAt: { type: Date, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      versionKey: false,
      // The signature image can be large; expose it only via the detail/history
      // endpoint when explicitly needed, not in every serialisation by default.
      transform: (_doc, ret: Record<string, unknown>) => ret,
    },
  },
);

signatureSchema.index({ documentId: 1, signedAt: -1 });

export const SignatureModel = model<ISignature>('Signature', signatureSchema);
