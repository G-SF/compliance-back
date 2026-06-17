/**
 * Signed Document Model
 *
 * Represents a PDF uploaded to the e-signature module.
 * The original (and, once signed, the final) PDF bytes are stored as Buffers in
 * MongoDB — matching the existing pattern (DocumentRecord.originalFileBuffer).
 * There is no external object storage; the "URL" of the spec is served by the
 * GET /signatures/:id/download endpoint.
 */

import { Schema, model, Document, Types } from 'mongoose';

export type SignedDocumentStatus = 'pending' | 'signed';

export interface ISignedDocument extends Document {
  userId: Types.ObjectId;
  fileName: string;
  status: SignedDocumentStatus;
  /** Original uploaded PDF bytes */
  originalFileBuffer: Buffer;
  /** Final signed PDF bytes (null until signed) */
  signedFileBuffer: Buffer | null;
  /** SHA-256 of the original PDF — proves what was signed */
  pdfHash: string | null;
  signedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const signedDocumentSchema = new Schema<ISignedDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    fileName: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'signed'],
      default: 'pending',
      index: true,
    },
    originalFileBuffer: { type: Buffer, required: true },
    signedFileBuffer: { type: Buffer, default: null },
    pdfHash: { type: String, default: null },
    signedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      // Never ship the raw PDF bytes in JSON list/detail responses — they are
      // served exclusively via the download endpoint.
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret['originalFileBuffer'];
        delete ret['signedFileBuffer'];
        return ret;
      },
    },
  },
);

export const SignedDocumentModel = model<ISignedDocument>('SignedDocument', signedDocumentSchema);
