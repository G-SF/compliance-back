import { Schema, model, Document, Types } from 'mongoose';

export interface IDocumentChunk extends Document {
  documentId: Types.ObjectId;
  content: string;
  /** SHA-256 of content — used to detect already-analyzed identical chunks */
  hash: string;
  chunkIndex: number;
  /** True after the AI has processed this chunk */
  analyzed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const documentChunkSchema = new Schema<IDocumentChunk>(
  {
    documentId: {
      type: Schema.Types.ObjectId,
      ref: 'DocumentRecord',
      required: true,
      index: true,
    },
    content: { type: String, required: true },
    hash: { type: String, required: true },
    chunkIndex: { type: Number, required: true },
    analyzed: { type: Boolean, default: false },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

documentChunkSchema.index({ documentId: 1, chunkIndex: 1 });
documentChunkSchema.index({ hash: 1, analyzed: 1 }); // cache lookup

export const DocumentChunkModel = model<IDocumentChunk>('DocumentChunk', documentChunkSchema);
