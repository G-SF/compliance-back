/**
 * AI Controller
 *
 * Handles POST /api/v1/ai/generate and POST /api/v1/ai/generate-with-files.
 * Builds the full prompt from prompt + context + uploaded file contents,
 * then delegates generation to aiService.
 */

import { Request, Response, NextFunction } from 'express';
import { aiService } from './ai.service';
import {
  validateGenerateDto,
  validateGenerateWithFilesDto,
  validateAskWithFileDto,
} from './ai.dto';
import { FILE_ANALYSIS_SYSTEM_PROMPT } from './ai.prompts';
import { extractTextFromFile, ALLOWED_EXTENSIONS } from './ai.file-parser';
import { ApiResponse } from '../../shared/utils/response.util';

/**
 * Builds the user message for file-based requests.
 * The system prompt (FILE_ANALYSIS_SYSTEM_PROMPT) always drives the analysis;
 * this function only assembles the document content + optional user question.
 *
 * Scenario 1 — file only:    document content is sent; AI follows the system prompt.
 * Scenario 2 — file + question: document content + explicit question appended.
 */
function buildFileUserMessage(opts: {
  contractText?: string;
  fileContents?: string[];
  question?: string;
}): string {
  const parts: string[] = [];

  if (opts.contractText?.trim()) {
    parts.push(`--- Contrato (texto digitado) ---\n${opts.contractText.trim()}`);
  }

  if (opts.fileContents && opts.fileContents.length > 0) {
    parts.push(
      opts.fileContents.map((content, i) => `--- Arquivo ${i + 1} ---\n${content}`).join('\n\n'),
    );
  }

  if (opts.question?.trim()) {
    parts.push(`Pergunta: ${opts.question.trim()}`);
  }

  return parts.join('\n\n');
}

export const aiController = {
  async generate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = validateGenerateDto(req.body);
      const parts: string[] = [];
      if (dto.context?.trim()) parts.push(`Context:\n${dto.context.trim()}`);
      parts.push(`User: ${dto.prompt}`);
      const prompt = parts.join('\n\n');

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

      const prompt = buildFileUserMessage({
        contractText: dto.contractText,
        fileContents,
      });
      const result = await aiService.complete({
        prompt,
        systemPrompt: FILE_ANALYSIS_SYSTEM_PROMPT,
      });

      res.json(
        ApiResponse.success({
          analysis: result.parsed ?? null,
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

  /**
   * POST /ask
   * Freemium: user sends a file + a question. No system pre-prompt.
   * Returns the raw model answer (no structured JSON parsing).
   */
  async askWithFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as Record<string, unknown>;
      const dto = validateAskWithFileDto(body);

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

      if (fileContents.length === 0 && !dto.contractText?.trim()) {
        const err = new Error(
          'Envie pelo menos um arquivo (PDF, DOCX, TXT) ou preencha o campo contractText com o texto do contrato',
        );
        (err as Error & { statusCode: number }).statusCode = 400;
        throw err;
      }

      const prompt = buildFileUserMessage({
        contractText: dto.contractText,
        fileContents,
        question: dto.question,
      });

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
};
