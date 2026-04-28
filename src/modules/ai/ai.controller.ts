/**
 * AI Controller
 *
 * Handles POST /api/v1/ai/generate and POST /api/v1/ai/generate-with-files.
 * Builds the full prompt from prompt + context + uploaded file contents,
 * then delegates generation to aiService.
 */

import { Request, Response, NextFunction } from 'express';
import { aiService } from './ai.service';
import { validateGenerateDto } from './ai.dto';
import { ApiResponse } from '../../shared/utils/response.util';

const ALLOWED_EXTENSIONS = ['.txt', '.json', '.md'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB (enforced by multer too)

/**
 * Builds a single prompt string from the base prompt, optional context,
 * and an array of text file contents extracted from uploaded files.
 */
function buildPrompt(prompt: string, context?: string, fileContents?: string[]): string {
  const parts: string[] = [];

  if (context && context.trim()) {
    parts.push(`Context:\n${context.trim()}`);
  }

  if (fileContents && fileContents.length > 0) {
    const fileSection = fileContents
      .map((content, i) => `--- File ${i + 1} ---\n${content}`)
      .join('\n\n');
    parts.push(`Files:\n${fileSection}`);
  }

  parts.push(`User: ${prompt}`);

  return parts.join('\n\n');
}

export const aiController = {
  async generate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = validateGenerateDto(req.body);
      const prompt = buildPrompt(dto.prompt, dto.context);

      const result = await aiService.complete({ prompt });

      res.json(
        ApiResponse.success({
          response: result.text,
          model: result.model,
        }),
      );
    } catch (err) {
      next(err);
    }
  },

  async generateWithFiles(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as Record<string, unknown>;
      const dto = validateGenerateDto(body);

      const files = req.files as Express.Multer.File[] | undefined;

      const fileContents: string[] = [];

      if (files && files.length > 0) {
        for (const file of files) {
          const ext = '.' + file.originalname.split('.').pop()?.toLowerCase();

          if (!ALLOWED_EXTENSIONS.includes(ext)) {
            const err = new Error(
              `File "${file.originalname}" has unsupported type. Allowed: .txt, .json, .md`,
            );
            (err as Error & { statusCode: number }).statusCode = 400;
            throw err;
          }

          if (file.size > MAX_FILE_SIZE_BYTES) {
            const err = new Error(`File "${file.originalname}" exceeds the 5 MB limit`);
            (err as Error & { statusCode: number }).statusCode = 400;
            throw err;
          }

          fileContents.push(file.buffer.toString('utf8'));
        }
      }

      const prompt = buildPrompt(dto.prompt, dto.context, fileContents);
      const result = await aiService.complete({ prompt });

      res.json(
        ApiResponse.success({
          response: result.text,
          model: result.model,
        }),
      );
    } catch (err) {
      next(err);
    }
  },
};
