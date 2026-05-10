import { Schema, model, Document, Types } from 'mongoose';

export interface IDocumentRecord extends Document {
  userId: Types.ObjectId;
  fileName: string | null;
  fileExtension: string | null;
  originalText: string;
  /** Binary buffer of the original uploaded file — used for format-preserving download */
  originalFileBuffer: Buffer | null;
  /** SHA-256 of originalText — used for deduplication */
  hash: string;
  createdAt: Date;
  updatedAt: Date;
}

const documentRecordSchema = new Schema<IDocumentRecord>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    fileName: { type: String, default: null },
    fileExtension: { type: String, default: null },
    originalText: { type: String, required: true },
    originalFileBuffer: { type: Buffer, default: null },
    hash: { type: String, required: true, index: true },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

// Unique per user — same user uploading the same document gets a cached result
documentRecordSchema.index({ userId: 1, hash: 1 }, { unique: true });

export const DocumentRecordModel = model<IDocumentRecord>('DocumentRecord', documentRecordSchema);
