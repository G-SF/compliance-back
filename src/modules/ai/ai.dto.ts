/**
 * AI DTOs
 *
 * Input validation for AI endpoints.
 */

export interface GenerateDto {
  prompt: string;
  context?: string;
}

export interface GenerateWithFilesDto {
  prompt: string;
  context?: string;
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
