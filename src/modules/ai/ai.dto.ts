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
 * generate-with-files: the user may send files, type the contract directly, or both.
 * At least one of `files` (multipart) or `contractText` must be present — validated in the controller.
 * `prompt` is optional; defaults to "Analise este contrato".
 */
export interface GenerateWithFilesDto {
  prompt: string;
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

  // prompt is optional — defaults to "Analise este contrato"
  if (b.prompt !== undefined && (typeof b.prompt !== 'string' || b.prompt.trim().length === 0)) {
    const err = new Error('prompt deve ser uma string não vazia');
    (err as NodeJS.ErrnoException & { statusCode: number }).statusCode = 400;
    throw err;
  }

  if (b.contractText !== undefined && typeof b.contractText !== 'string') {
    const err = new Error('contractText deve ser uma string');
    (err as NodeJS.ErrnoException & { statusCode: number }).statusCode = 400;
    throw err;
  }

  return {
    prompt: typeof b.prompt === 'string' ? b.prompt.trim() : 'Analise este contrato',
    contractText: typeof b.contractText === 'string' ? b.contractText.trim() : undefined,
  };
}
