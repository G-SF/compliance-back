/**
 * AI Controller
 *
 * Handles POST /api/v1/ai/generate-with-files and POST /api/v1/ai/ask.
 * Builds the full prompt from contractText + uploaded file contents,
 * then delegates generation to aiService.
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { Types } from 'mongoose';
import { aiService } from './ai.service';
import { validateGenerateWithFilesDto, validateAskWithFileDto } from './ai.dto';
import { FILE_ANALYSIS_SYSTEM_PROMPT, ASK_WITH_FILE_SYSTEM_PROMPT } from './ai.prompts';
import { extractTextFromFile, ALLOWED_EXTENSIONS } from './ai.file-parser';
import { ApiResponse } from '../../shared/utils/response.util';
import { AnalysisModel } from '../history/analysis.model';
import { DocumentRecordModel } from '../document-analysis/models/document-record.model';
import { AuthenticatedRequest } from '../../shared/middleware/auth.middleware';
import { logger } from '../../shared/utils/logger';

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
          fileContents.push(await extractTextFromFile(file.buffer, file.originalname, 'analysis'));
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

      // Conciseness constraints appended at call-time — keeps FILE_ANALYSIS_SYSTEM_PROMPT
      // unchanged while capping output verbosity (~25-35% fewer output tokens).
      const analysisSystemPrompt =
        FILE_ANALYSIS_SYSTEM_PROMPT +
        '\n\nCOMPRIMENTO MÁXIMO POR CAMPO (obrigatório, sem exceções):\n' +
        'resumo ≤220 chars | maior_risco ≤100 chars | ' +
        'nome ≤45 chars | clausula ≤35 chars | impacto ≤130 chars | base_legal ≤65 chars | ' +
        'cada item de sugestoes ≤130 chars | cada item de alertas_legais ≤110 chars';

      const result = await aiService.complete({
        prompt,
        systemPrompt: analysisSystemPrompt,
        // Com campos curtos o JSON completo cabe em ~1 200-1 400 tokens;
        // 2 000 dá margem de 40% sem desperdiçar headroom.
        maxTokens: 2000,
      });

      // ── Persist DocumentRecord (upsert by hash) so the correction flow
      //    can load the original text later without re-uploading the file.
      const { userId } = req as AuthenticatedRequest;
      const rawDocumentText = [dto.contractText?.trim(), ...fileContents]
        .filter((t): t is string => Boolean(t))
        .join('\n\n');
      const docHash = crypto.createHash('sha256').update(rawDocumentText, 'utf8').digest('hex');

      const primaryFile = files && files.length > 0 ? files[0] : null;
      const rawExt = primaryFile?.originalname.split('.').pop()?.toLowerCase() ?? null;

      const docRecord = await DocumentRecordModel.findOneAndUpdate(
        { userId: new Types.ObjectId(userId), hash: docHash },
        {
          $setOnInsert: {
            userId: new Types.ObjectId(userId),
            fileName: primaryFile?.originalname ?? null,
            originalText: rawDocumentText,
            hash: docHash,
          },
        },
        { upsert: true, new: true },
      );

      // Pre-generate analysisId so we can return it before the non-blocking DB write
      const analysisObjectId = new Types.ObjectId();

      // Persist to history (non-blocking — never fail the request if save fails)
      AnalysisModel.create({
        _id: analysisObjectId,
        userId,
        documentRecordId: docRecord._id,
        fileName: primaryFile?.originalname ?? null,
        fileExtension: rawExt ? `.${rawExt}` : null,
        analysisType: 'generate-with-files',
        status: 'completed',
        analysis: result.parsed ?? null,
        rawResponse: result.text,
        riskLevel: result.parsed?.risco?.nivel ?? null,
        riskScore: result.parsed?.risco?.score ?? null,
        aiModel: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: result.costUsd,
        errorMessage: null,
      }).catch((err: unknown) => {
        logger.warn('[AI] Failed to save analysis to history', { error: err });
      });

      res.json(
        ApiResponse.success({
          analysis: result.parsed ?? null,
          documentId: docRecord._id.toString(),
          analysisId: analysisObjectId.toString(),
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
          fileContents.push(await extractTextFromFile(file.buffer, file.originalname, 'ask'));
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

      const result = await aiService.complete({
        prompt,
        systemPrompt: ASK_WITH_FILE_SYSTEM_PROMPT,
        // Markdown com 6 seções; 2 000 tokens é 3× o output típico (~675 tokens)
        maxTokens: 2000,
      });

      // Persist to history (non-blocking)
      const { userId } = req as AuthenticatedRequest;
      const primaryFile = files && files.length > 0 ? files[0] : null;
      const rawExt = primaryFile?.originalname.split('.').pop()?.toLowerCase() ?? null;

      // Pre-generate analysisId so we can return it before the non-blocking DB write
      const analysisObjectId = new Types.ObjectId();

      AnalysisModel.create({
        _id: analysisObjectId,
        userId,
        fileName: primaryFile?.originalname ?? null,
        fileExtension: rawExt ? `.${rawExt}` : null,
        analysisType: 'ask',
        status: 'completed',
        analysis: null,
        rawResponse: result.text,
        riskLevel: null,
        riskScore: null,
        aiModel: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: result.costUsd,
        errorMessage: null,
      }).catch(() => {
        /* ignore save errors */
      });

      res.json(
        ApiResponse.success({
          response: result.text,
          analysisId: analysisObjectId.toString(),
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
