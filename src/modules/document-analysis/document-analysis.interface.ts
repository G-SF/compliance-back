/**
 * Document Analysis — Shared Interfaces
 *
 * Defines the data shapes used across chunk, issue, patch and pipeline services.
 * Kept separate from Mongoose models so services can depend on plain objects.
 */

/** Raw issue as returned by the AI for a single excerpt */
export interface Issue {
  trecho_exato: string;
  problema: string;
  needs_context: boolean;
  rewrite: string;
}

/** AI response shape for a single chunk in a batch call */
export interface ChunkAnalysisResult {
  chunkIndex: number;
  issues: Issue[];
}

/** Aggregate metrics collected during a full document analysis run */
export interface AnalyzeMetrics {
  chunksTotal: number;
  chunksAnalyzed: number;
  chunksFromCache: number;
  issuesFound: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}
