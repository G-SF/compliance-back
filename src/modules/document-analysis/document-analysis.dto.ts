/**
 * Document Analysis — Request/Response DTOs with validation
 */

import { z } from 'zod';

// ── Analyze ────────────────────────────────────────────────────────────────

const analyzeBodySchema = z.object({
  /** Raw contract text when no file is uploaded */
  text: z.string().trim().min(1).optional(),
});

export type AnalyzeDto = z.infer<typeof analyzeBodySchema>;

export function validateAnalyzeDto(body: unknown): AnalyzeDto {
  const result = analyzeBodySchema.safeParse(body);
  if (!result.success) {
    throw Object.assign(
      new Error(result.error.issues.map((e: { message: string }) => e.message).join('; ')),
      { statusCode: 400 },
    );
  }
  return result.data;
}

// ── Correct ────────────────────────────────────────────────────────────────

const correctBodySchema = z.object({
  /**
   * Optional list of issue IDs to apply.
   * If omitted, ALL issues for the document are applied.
   */
  issueIds: z.array(z.string().trim().min(1)).optional(),
});

export type CorrectDto = z.infer<typeof correctBodySchema>;

export function validateCorrectDto(body: unknown): CorrectDto {
  const result = correctBodySchema.safeParse(body);
  if (!result.success) {
    throw Object.assign(
      new Error(result.error.issues.map((e: { message: string }) => e.message).join('; ')),
      { statusCode: 400 },
    );
  }
  return result.data;
}
