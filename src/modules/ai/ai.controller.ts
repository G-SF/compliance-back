/**
 * AI Controller
 *
 * Handles POST /api/v1/ai/generate and POST /api/v1/ai/generate-with-files.
 * Builds the full prompt from prompt + context + uploaded file contents,
 * then delegates generation to aiService.
 */

import { Request, Response, NextFunction } from 'express';
import { aiService } from './ai.service';
import { validateGenerateDto, validateGenerateWithFilesDto } from './ai.dto';
import { FILE_ANALYSIS_SYSTEM_PROMPT } from './ai.prompts';
import { extractTextFromFile, ALLOWED_EXTENSIONS } from './ai.file-parser';
import { ApiResponse } from '../../shared/utils/response.util';

/**
 * Builds a single prompt string from the base prompt, optional context,
 * optional typed contract text, and an array of file contents.
 */
function buildPrompt(
  prompt: string,
  opts: { context?: string; contractText?: string; fileContents?: string[] } = {},
): string {
  const parts: string[] = [];

  if (opts.context?.trim()) {
    parts.push(`Context:\n${opts.context.trim()}`);
  }

  if (opts.contractText?.trim()) {
    parts.push(`--- Contrato (texto digitado) ---\n${opts.contractText.trim()}`);
  }

  if (opts.fileContents && opts.fileContents.length > 0) {
    parts.push(
      opts.fileContents.map((content, i) => `--- Arquivo ${i + 1} ---\n${content}`).join('\n\n'),
    );
  }

  parts.push(`User: ${prompt}`);

  return parts.join('\n\n');
}

export const aiController = {
  async generate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = validateGenerateDto(req.body);
      const prompt = buildPrompt(dto.prompt, { context: dto.context });

      const result = await aiService.complete({ prompt });

      res.json(
        ApiResponse.success({
          response: result.text,
          model: result.model,
          usage: {
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            totalTokens: result.tokensUsed,
            costUsd: result.costUsd,
          },
        }),
      );
    } catch (err) {
      next(err);
    }
  },

  async generateWithFiles(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as Record<string, unknown>;
      const dto = validateGenerateWithFilesDto(body);

      const files = req.files as Express.Multer.File[] | undefined;

      const fileContents: string[] = [];

      if (files && files.length > 0) {
        for (const file of files) {
          const ext = '.' + file.originalname.split('.').pop()?.toLowerCase();
          if (!ALLOWED_EXTENSIONS.includes(ext)) {
            const err = new Error(
              `Arquivo "${file.originalname}" não suportado. Permitidos: ${ALLOWED_EXTENSIONS.join(', ')}`,
            );
            (err as Error & { statusCode: number }).statusCode = 400;
            throw err;
          }
          fileContents.push(await extractTextFromFile(file.buffer, file.originalname));
        }
      }

      // Requer pelo menos um arquivo ou texto digitado
      if (fileContents.length === 0 && !dto.contractText?.trim()) {
        const err = new Error(
          'Envie pelo menos um arquivo (PDF, DOCX, TXT) ou preencha o campo contractText com o texto do contrato',
        );
        (err as Error & { statusCode: number }).statusCode = 400;
        throw err;
      }

      const prompt = buildPrompt(dto.prompt, { contractText: dto.contractText, fileContents });
      const result = await aiService.complete({
        prompt,
        systemPrompt: FILE_ANALYSIS_SYSTEM_PROMPT,
      });

      res.json(
        ApiResponse.success({
          response: result.text,
          model: result.model,
          usage: {
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            totalTokens: result.tokensUsed,
            costUsd: result.costUsd,
          },
        }),
      );
    } catch (err) {
      next(err);
    }
  },
};
