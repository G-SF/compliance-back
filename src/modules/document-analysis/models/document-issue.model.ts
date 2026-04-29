import { Schema, model, Document, Types } from 'mongoose';

export interface IDocumentIssue extends Document {
  /** null when the issue was generated from an existing Analysis (not chunk pipeline) */
  chunkId: Types.ObjectId | null;
  documentId: Types.ObjectId;
  /** Links this patch to the Analysis that originated it */
  analysisId: Types.ObjectId | null;
  /** Verbatim excerpt from the chunk that has the problem */
  trecho_exato: string;
  /** Description of the problem in Brazilian Portuguese */
  problema: string;
  /** Whether surrounding context was needed to properly assess the issue */
  needs_context: boolean;
  /** Drop-in replacement for trecho_exato */
  rewrite: string;
  createdAt: Date;
  updatedAt: Date;
}

const documentIssueSchema = new Schema<IDocumentIssue>(
  {
    chunkId: { type: Schema.Types.ObjectId, ref: 'DocumentChunk', default: null },
    documentId: {
      type: Schema.Types.ObjectId,
      ref: 'DocumentRecord',
      required: true,
      index: true,
    },
    analysisId: { type: Schema.Types.ObjectId, ref: 'Analysis', default: null, index: true },
    trecho_exato: { type: String, required: true },
    problema: { type: String, required: true },
    needs_context: { type: Boolean, default: false },
    rewrite: { type: String, required: true },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

export const DocumentIssueModel = model<IDocumentIssue>('DocumentIssue', documentIssueSchema);
