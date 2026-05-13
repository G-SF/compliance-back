/**
 * Analysis Model (Mongoose)
 *
 * Persists every completed AI analysis so users can browse their history
 * and retrieve full details later.
 *
 * Indexed on:
 *   - userId  (queries de histórico do usuário)
 *   - createdAt DESC  (ordenação padrão)
 */

import { Schema, model, Document, Types } from 'mongoose';
import { ContractAnalysis } from '../../modules/ai/ai.interface';

export type AnalysisType = 'generate-with-files' | 'ask';
export type AnalysisStatus = 'completed' | 'error';

export interface IAnalysis extends Document {
  userId: Types.ObjectId;

  /** Referência ao DocumentRecord criado durante generate-with-files (para patches) */
  documentRecordId: Types.ObjectId | null;

  /** Nome original do arquivo principal (null = entrada só texto) */
  fileName: string | null;
  fileExtension: string | null; // .pdf | .docx | .txt | null

  analysisType: AnalysisType;
  status: AnalysisStatus;

  /** Dados estruturados retornados pelo Claude (presente em generate-with-files) */
  analysis: ContractAnalysis | null;
  /** Resposta bruta do modelo (sempre presente) */
  rawResponse: string;

  /** Pergunta feita pelo usuário via /ask (vinculada a esta análise) */
  question: string | null;
  /** Resposta em Markdown gerada pelo /ask vinculado a esta análise */
  questionResponse: string | null;

  /** Extraído de analysis.risco para facilitar queries / listagem */
  riskLevel: 'baixo' | 'médio' | 'alto' | null;
  riskScore: number | null; // 0 – 10

  aiModel: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;

  errorMessage: string | null;

  createdAt: Date;
  updatedAt: Date;
}

const analysisSchema = new Schema<IAnalysis>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    documentRecordId: { type: Schema.Types.ObjectId, ref: 'DocumentRecord', default: null },

    fileName: { type: String, default: null },
    fileExtension: { type: String, default: null },

    analysisType: { type: String, enum: ['generate-with-files', 'ask'], required: true },
    status: { type: String, enum: ['completed', 'error'], required: true },

    analysis: { type: Schema.Types.Mixed, default: null },
    rawResponse: { type: String, required: true },

    question: { type: String, default: null },
    questionResponse: { type: String, default: null },

    riskLevel: { type: String, enum: ['baixo', 'médio', 'alto', null], default: null },
    riskScore: { type: Number, default: null },

    aiModel: { type: String, required: true },
    inputTokens: { type: Number, required: true },
    outputTokens: { type: Number, required: true },
    costUsd: { type: Number, required: true },

    errorMessage: { type: String, default: null },
  },
  {
    timestamps: true,
    toJSON: { versionKey: false },
  },
);

// Compound index for paginated user history (newest first)
analysisSchema.index({ userId: 1, createdAt: -1 });

export const AnalysisModel = model<IAnalysis>('Analysis', analysisSchema);
