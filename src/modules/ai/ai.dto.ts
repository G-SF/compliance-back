/**
 * AI DTOs
 *
 * Input validation for AI endpoints.
 */

/**
 * generate-with-files (core/analyze): only a file or contractText is accepted.
 * No user question — the analysis is fully driven by the system prompt.
 */
export interface GenerateWithFilesDto {
  contractText?: string;
}

/**
 * ask-with-file (freemium): user must send a question about the file.
 * documentId is optional — when provided, enables per-contract question tracking.
 * analysisId is optional — when provided, the answer is stored in the existing analysis
 * instead of creating a new orphaned history entry.
 */
export interface AskWithFileDto {
  question: string;
  contractText?: string;
  /** documentId returned by /ai/generate-with-files — enables per-contract limit tracking */
  documentId?: string;
  /** analysisId returned by /ai/generate-with-files — links the ask response to the analysis */
  analysisId?: string;
}

export function validateGenerateWithFilesDto(body: unknown): GenerateWithFilesDto {
  const b = body as Record<string, unknown>;

  if (b.contractText !== undefined && typeof b.contractText !== 'string') {
    const err = new Error('contractText deve ser uma string');
    (err as NodeJS.ErrnoException & { statusCode: number }).statusCode = 400;
    throw err;
  }

  if (typeof b.contractText === 'string' && b.contractText.length > 100_000) {
    const err = new Error('contractText não pode ultrapassar 100.000 caracteres');
    (err as NodeJS.ErrnoException & { statusCode: number }).statusCode = 400;
    throw err;
  }

  return {
    contractText: typeof b.contractText === 'string' ? b.contractText.trim() : undefined,
  };
}

export function validateAskWithFileDto(body: unknown): AskWithFileDto {
  const b = body as Record<string, unknown>;

  if (!b.question || typeof b.question !== 'string' || b.question.trim().length === 0) {
    const err = new Error('question é obrigatório e deve ser uma string não vazia');
    (err as NodeJS.ErrnoException & { statusCode: number }).statusCode = 400;
    throw err;
  }

  if (b.question.trim().length > 500) {
    const err = new Error('question não pode ultrapassar 500 caracteres');
    (err as NodeJS.ErrnoException & { statusCode: number }).statusCode = 400;
    throw err;
  }

  if (b.contractText !== undefined && typeof b.contractText !== 'string') {
    const err = new Error('contractText deve ser uma string');
    (err as NodeJS.ErrnoException & { statusCode: number }).statusCode = 400;
    throw err;
  }

  return {
    question: b.question.trim(),
    contractText: typeof b.contractText === 'string' ? b.contractText.trim() : undefined,
    documentId: typeof b.documentId === 'string' ? b.documentId.trim() : undefined,
    analysisId: typeof b.analysisId === 'string' ? b.analysisId.trim() : undefined,
  };
}
