/**
 * AI DTOs
 *
 * Input validation for AI endpoints.
 */

export interface GenerateDto {
  prompt: string;
  context?: string;
}

/**
 * generate-with-files (core/analyze): only a file or contractText is accepted.
 * No user question — the analysis is fully driven by the system prompt.
 */
export interface GenerateWithFilesDto {
  contractText?: string;
}

/**
 * ask-with-file (freemium): user must send a question about the file.
 * No system pre-prompt — the model answers freely within token limits.
 */
export interface AskWithFileDto {
  question: string;
  contractText?: string;
}

export function validateGenerateDto(body: unknown): GenerateDto {
  const b = body as Record<string, unknown>;

  if (!b.prompt || typeof b.prompt !== 'string' || b.prompt.trim().length === 0) {
    const err = new Error('prompt is required and must be a non-empty string');
    (err as NodeJS.ErrnoException & { statusCode: number }).statusCode = 400;
    throw err;
  }

  if (b.context !== undefined && typeof b.context !== 'string') {
    const err = new Error('context must be a string');
    (err as NodeJS.ErrnoException & { statusCode: number }).statusCode = 400;
    throw err;
  }

  return {
    prompt: b.prompt.trim(),
    context: typeof b.context === 'string' ? b.context.trim() : undefined,
  };
}

export function validateGenerateWithFilesDto(body: unknown): GenerateWithFilesDto {
  const b = body as Record<string, unknown>;

  if (b.contractText !== undefined && typeof b.contractText !== 'string') {
    const err = new Error('contractText deve ser uma string');
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
  };
}
