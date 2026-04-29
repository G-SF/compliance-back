/**
 * Document Analysis Service — Pipeline Orchestrator
 *
 * generatePatches()
 *   1. Load DocumentRecord (original text) — must belong to the requesting user
 *   2. Load Analysis — must belong to the same user and contain structured data
 *   3. Cache check: if patches for this (documentId, analysisId) pair already exist, return them
 *   4. Build a targeted patch-generation prompt using the analysis' problemas + sugestoes
 *   5. Call the AI (cheap — no re-analysis, only text location + rewrite)
 *   6. Validate each patch: trecho_exato must be verbatim present in the original text
 *   7. Persist and return valid patches
 *
 * correctDocument()
 *   1. Load DocumentRecord (original text)
 *   2. Load requested issues (all or a filtered subset by issueIds)
 *   3. Apply patches via patchService and return result
 */

import { Types } from 'mongoose';
import { aiService } from '../../ai/ai.service';
import { issueService } from './issue.service';
import { patchService, PatchResult } from './patch.service';
import { DocumentRecordModel } from '../models/document-record.model';
import { IDocumentIssue } from '../models/document-issue.model';
import { AnalysisModel } from '../../history/analysis.model';
import { PATCH_GENERATION_SYSTEM_PROMPT } from '../document-analysis.prompts';
import { Issue } from '../document-analysis.interface';
import { logger } from '../../../shared/utils/logger';

// ── Helpers ────────────────────────────────────────────────────────────────

interface RawPatch {
  problema: string;
  trecho_exato: string;
  rewrite: string;
}

function parseAiPatchResponse(raw: string): RawPatch[] {
  const clean = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const parsed: unknown = JSON.parse(clean);

  if (!Array.isArray(parsed)) {
    throw new Error('AI patch response is not a JSON array');
  }

  return (parsed as RawPatch[]).filter(
    p => typeof p.trecho_exato === 'string' && p.trecho_exato.trim().length > 0,
  );
}

// ── Public API ─────────────────────────────────────────────────────────────

export const documentAnalysisService = {
  /**
   * Converts the structured analysis from /ai/generate-with-files into
   * surgical text patches without re-analysing the document.
   *
   * Cached: calling with the same (documentId, analysisId) returns stored patches.
   */
  async generatePatches(
    documentId: string,
    analysisId: string,
    userId: string,
  ): Promise<{
    issues: IDocumentIssue[];
    fromCache: boolean;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }> {
    // ── Ownership checks ───────────────────────────────────────────────────
    const docRecord = await DocumentRecordModel.findOne({
      _id: documentId,
      userId: new Types.ObjectId(userId),
    });
    if (!docRecord) throw Object.assign(new Error('Document not found'), { statusCode: 404 });

    const analysis = await AnalysisModel.findOne({
      _id: analysisId,
      userId: new Types.ObjectId(userId),
    });
    if (!analysis) throw Object.assign(new Error('Analysis not found'), { statusCode: 404 });
    if (!analysis.analysis) {
      throw Object.assign(
        new Error(
          'This analysis has no structured data. Only generate-with-files analyses are supported.',
        ),
        { statusCode: 422 },
      );
    }

    // ── Cache check ────────────────────────────────────────────────────────
    const cached = await issueService.findByDocumentAndAnalysis(documentId, analysisId);
    if (cached.length > 0) {
      return { issues: cached, fromCache: true, inputTokens: 0, outputTokens: 0, costUsd: 0 };
    }

    // ── Build targeted prompt ──────────────────────────────────────────────
    const { problemas, sugestoes } = analysis.analysis;

    const problemasText = problemas
      .map((p, i) => `${i + 1}. [${p.severidade.toUpperCase()}] ${p.nome} — ${p.impacto}`)
      .join('\n');

    const sugestoesText = sugestoes.map((s, i) => `${i + 1}. ${s}`).join('\n');

    const prompt = [
      `[DOCUMENTO]\n${docRecord.originalText}\n[/DOCUMENTO]`,
      `[PROBLEMAS]\n${problemasText}\n[/PROBLEMAS]`,
      `[SUGESTOES]\n${sugestoesText}\n[/SUGESTOES]`,
    ].join('\n\n');

    // ── Call AI ────────────────────────────────────────────────────────────
    const result = await aiService.complete({
      prompt,
      systemPrompt: PATCH_GENERATION_SYSTEM_PROMPT,
    });

    logger.info('[DocumentAnalysis] Patch generation complete', {
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: result.costUsd,
    });

    // ── Parse and validate ─────────────────────────────────────────────────
    let rawPatches: RawPatch[] = [];
    try {
      rawPatches = parseAiPatchResponse(result.text);
    } catch {
      logger.warn('[DocumentAnalysis] Failed to parse AI patch response — returning empty list');
    }

    // Only accept patches where trecho_exato is actually present in the original text
    const validPatches: Issue[] = rawPatches
      .filter(p => docRecord.originalText.includes(p.trecho_exato))
      .map(p => ({
        trecho_exato: p.trecho_exato,
        problema: p.problema,
        needs_context: false,
        rewrite: p.rewrite,
      }));

    // ── Persist ────────────────────────────────────────────────────────────
    await issueService.saveIssues(null, documentId, validPatches, analysisId);

    const issues = await issueService.findByDocumentAndAnalysis(documentId, analysisId);

    return {
      issues,
      fromCache: false,
      inputTokens: result.inputTokens ?? 0,
      outputTokens: result.outputTokens ?? 0,
      costUsd: result.costUsd ?? 0,
    };
  },

  /**
   * Applies patches to the stored original text.
   *
   * @param documentId - ID from DocumentRecord (returned by generate-with-files)
   * @param issueIds   - optional subset; omit to apply ALL issues for the document
   */
  async correctDocument(
    documentId: string,
    issueIds?: string[],
  ): Promise<PatchResult & { documentId: string }> {
    const docRecord = await DocumentRecordModel.findById(documentId);

    if (!docRecord) {
      throw Object.assign(new Error('Document not found'), { statusCode: 404 });
    }

    const issues =
      issueIds && issueIds.length > 0
        ? await issueService.getIssuesByIds(issueIds)
        : await issueService.getIssuesByDocument(documentId);

    const result = patchService.applyPatches(docRecord.originalText, issues);

    return { documentId, ...result };
  },
};
