/**
 * Patch Service
 *
 * Applies surgical text replacements to a document.
 * Only the exact excerpts identified as problematic are replaced —
 * the rest of the document is untouched.
 *
 * Strategy:
 *  1. Locate each trecho_exato in the current document state (indexOf)
 *  2. Sort patches by position (left → right) to apply in order
 *  3. Track cumulative offset so later patches remain accurate
 *  4. Fall back to a fresh indexOf search if the offset is stale
 *  5. Skip any patch whose excerpt is no longer found
 */

import { IDocumentIssue } from '../models/document-issue.model';

export interface PatchResult {
  correctedText: string;
  issuesApplied: number;
  issuesSkipped: number;
  appliedIssueIds: string[];
  skippedIssueIds: string[];
}

export const patchService = {
  applyPatches(documentText: string, issues: IDocumentIssue[]): PatchResult {
    const appliedIssueIds: string[] = [];
    const skippedIssueIds: string[] = [];

    // ── 1. Locate each issue in the original text ─────────────────────────
    const positioned = issues
      .map(issue => ({
        issue,
        startIndex: documentText.indexOf(issue.trecho_exato),
      }))
      .filter(({ startIndex, issue }) => {
        if (startIndex === -1) {
          skippedIssueIds.push(issue._id.toString());
          return false;
        }
        return true;
      });

    // ── 2. Sort left → right so offset arithmetic stays valid ─────────────
    positioned.sort((a, b) => a.startIndex - b.startIndex);

    // ── 3. Apply patches sequentially, tracking offset drift ──────────────
    let result = documentText;
    let offset = 0;

    for (const { issue, startIndex } of positioned) {
      const adjustedStart = startIndex + offset;
      const expectedEnd = adjustedStart + issue.trecho_exato.length;
      const slice = result.slice(adjustedStart, expectedEnd);

      let actualStart: number;

      if (slice === issue.trecho_exato) {
        // Happy path — excerpt still at expected position
        actualStart = adjustedStart;
      } else {
        // Offset drift (e.g. a previous patch changed lengths significantly)
        // Fall back to a fresh search in the current string
        const fallback = result.indexOf(issue.trecho_exato);
        if (fallback === -1) {
          skippedIssueIds.push(issue._id.toString());
          continue;
        }
        actualStart = fallback;
      }

      result =
        result.slice(0, actualStart) +
        issue.rewrite +
        result.slice(actualStart + issue.trecho_exato.length);

      offset += issue.rewrite.length - issue.trecho_exato.length;
      appliedIssueIds.push(issue._id.toString());
    }

    return {
      correctedText: result,
      issuesApplied: appliedIssueIds.length,
      issuesSkipped: skippedIssueIds.length,
      appliedIssueIds,
      skippedIssueIds,
    };
  },
};
