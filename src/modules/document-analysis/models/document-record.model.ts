import { Schema, model, Document, Types } from 'mongoose';

export interface IDocumentRecord extends Document {
  userId: Types.ObjectId;
  fileName: string | null;
  originalText: string;
  /** SHA-256 of originalText — used for deduplication */
  hash: string;
  createdAt: Date;
  updatedAt: Date;
}

const documentRecordSchema = new Schema<IDocumentRecord>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    fileName: { type: String, default: null },
    originalText: { type: String, required: true },
    hash: { type: String, required: true, index: true },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

// Unique per user — same user uploading the same document gets a cached result
documentRecordSchema.index({ userId: 1, hash: 1 }, { unique: true });

export const DocumentRecordModel = model<IDocumentRecord>('DocumentRecord', documentRecordSchema);
