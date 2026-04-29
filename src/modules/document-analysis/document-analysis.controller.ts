/**
 * Document Analysis Controller
 *
 * POST /api/v1/document-analysis/generate-patches
 *   Takes documentId + analysisId (both returned by /ai/generate-with-files).
 *   Uses the structured analysis already produced to generate surgical patches.
 *   Returns the list of patches for user review / selection.
 *
 * POST /api/v1/document-analysis/correct/:documentId
 *   Apply selected (or all) patches to the stored document.
 *   Optional body: { issueIds: string[] } — omit to apply ALL patches.
 *   Returns the corrected text + metrics.
 *
 * GET  /api/v1/document-analysis/:documentId/issues
 *   Returns all patches for a previously processed document.
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { documentAnalysisService } from './services/document-analysis.service';
import { validateCorrectDto } from './document-analysis.dto';
import { ApiResponse } from '../../shared/utils/response.util';
import { AuthenticatedRequest } from '../../shared/middleware/auth.middleware';
import { issueService } from './services/issue.service';
import { DocumentRecordModel } from './models/document-record.model';

const generatePatchesSchema = z.object({
  documentId: z.string().trim().min(1),
  analysisId: z.string().trim().min(1),
});

export const documentAnalysisController = {
  /**
   * POST /generate-patches
   * Body: { documentId: string, analysisId: string }
   *
   * Both IDs are returned by POST /ai/generate-with-files.
   * Uses the problemas + sugestoes from the existing analysis to generate
   * trecho_exato → rewrite patches via a targeted (cheap) AI call.
   * Subsequent calls with the same pair return cached patches for free.
   */
  async generatePatches(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;

      const parsed = generatePatchesSchema.safeParse(req.body);
      if (!parsed.success) {
        throw Object.assign(
          new Error(parsed.error.issues.map((e: { message: string }) => e.message).join('; ')),
          { statusCode: 400 },
        );
      }

      const { documentId, analysisId } = parsed.data;

      const { issues, fromCache, inputTokens, outputTokens, costUsd } =
        await documentAnalysisService.generatePatches(documentId, analysisId, userId);

      res.json(
        ApiResponse.success({
          documentId,
          analysisId,
          fromCache,
          totalPatches: issues.length,
          patches: issues,
          usage: fromCache ? null : { inputTokens, outputTokens, costUsd },
        }),
      );
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /correct/:documentId
   * Body (optional): { issueIds: string[] }
   *
   * Applies the selected patches (or all patches for the document) and returns
   * the corrected document text.
   */
  async correct(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const { documentId } = req.params;
      const dto = validateCorrectDto(req.body);

      // Ownership check
      const docRecord = await DocumentRecordModel.findOne({
        _id: documentId,
        userId,
      });
      if (!docRecord) {
        throw Object.assign(new Error('Document not found'), { statusCode: 404 });
      }

      const result = await documentAnalysisService.correctDocument(documentId, dto.issueIds);

      res.json(
        ApiResponse.success({
          documentId: result.documentId,
          correctedText: result.correctedText,
          metrics: {
            issuesApplied: result.issuesApplied,
            issuesSkipped: result.issuesSkipped,
          },
          appliedIssueIds: result.appliedIssueIds,
          skippedIssueIds: result.skippedIssueIds,
        }),
      );
    } catch (err) {
      next(err);
    }
  },

  /** GET /:documentId/issues — retrieve all patches for a document. */
  async getIssues(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const { documentId } = req.params;

      const docRecord = await DocumentRecordModel.findOne({ _id: documentId, userId });
      if (!docRecord) {
        throw Object.assign(new Error('Document not found'), { statusCode: 404 });
      }

      const issues = await issueService.getIssuesByDocument(documentId);

      res.json(ApiResponse.success({ documentId, totalPatches: issues.length, patches: issues }));
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /:documentId/download?issueIds=id1,id2
   *
   * Applies patches and streams the corrected document as a .txt file download.
   * issueIds is an optional comma-separated list; omit to apply ALL patches.
   * The filename is derived from the original document name.
   */
  async download(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const { documentId } = req.params;
      const rawIds = req.query.issueIds as string | undefined;
      const issueIds = rawIds
        ? rawIds
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
        : undefined;

      // Ownership check
      const docRecord = await DocumentRecordModel.findOne({ _id: documentId, userId });
      if (!docRecord) {
        throw Object.assign(new Error('Document not found'), { statusCode: 404 });
      }

      const result = await documentAnalysisService.correctDocument(documentId, issueIds);

      // Derive filename from the original upload name, always serve as .txt
      const baseName = docRecord.fileName
        ? docRecord.fileName.replace(/\.[^.]+$/, '')
        : 'documento-corrigido';
      const downloadName = `${baseName}-corrigido.txt`;

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
      res.send(result.correctedText);
    } catch (err) {
      next(err);
    }
  },
};
