/**
 * Issue Service
 *
 * Handles all persistence operations for document chunks and issues.
 * Controllers and the pipeline service stay decoupled from Mongoose internals.
 */

import { Types } from 'mongoose';
import { DocumentChunkModel, IDocumentChunk } from '../models/document-chunk.model';
import { DocumentIssueModel, IDocumentIssue } from '../models/document-issue.model';
import { Issue } from '../document-analysis.interface';

export const issueService = {
  // ── Chunks ────────────────────────────────────────────────────────────────

  async saveChunks(
    documentId: string,
    chunks: Array<{ content: string; hash: string; chunkIndex: number }>,
  ): Promise<IDocumentChunk[]> {
    const docs = chunks.map(c => ({
      documentId: new Types.ObjectId(documentId),
      content: c.content,
      hash: c.hash,
      chunkIndex: c.chunkIndex,
      analyzed: false,
    }));
    return DocumentChunkModel.insertMany(docs);
  },

  /**
   * Returns existing chunks (from ANY document) that have already been analyzed
   * and whose content hash matches one of the provided hashes.
   * Used to avoid re-sending identical content to the AI.
   */
  async findAnalyzedChunksByHashes(hashes: string[]): Promise<IDocumentChunk[]> {
    return DocumentChunkModel.find({
      hash: { $in: hashes },
      analyzed: true,
    }).lean() as unknown as IDocumentChunk[];
  },

  async markChunkAnalyzed(chunkId: string): Promise<void> {
    await DocumentChunkModel.updateOne({ _id: chunkId }, { $set: { analyzed: true } });
  },

  // ── Issues ────────────────────────────────────────────────────────────────

  async saveIssues(
    chunkId: string | null,
    documentId: string,
    issues: Issue[],
    analysisId?: string,
  ): Promise<IDocumentIssue[]> {
    if (issues.length === 0) return [];

    const docs = issues.map(issue => ({
      chunkId: chunkId ? new Types.ObjectId(chunkId) : null,
      documentId: new Types.ObjectId(documentId),
      analysisId: analysisId ? new Types.ObjectId(analysisId) : null,
      trecho_exato: issue.trecho_exato,
      problema: issue.problema,
      needs_context: issue.needs_context,
      rewrite: issue.rewrite,
    }));

    return DocumentIssueModel.insertMany(docs);
  },

  async getIssuesByDocument(documentId: string): Promise<IDocumentIssue[]> {
    return DocumentIssueModel.find({ documentId: new Types.ObjectId(documentId) })
      .populate('chunkId', 'chunkIndex')
      .lean() as unknown as IDocumentIssue[];
  },

  async getIssuesByChunk(chunkId: string): Promise<IDocumentIssue[]> {
    return DocumentIssueModel.find({
      chunkId: new Types.ObjectId(chunkId),
    }).lean() as unknown as IDocumentIssue[];
  },

  async getIssuesByIds(issueIds: string[]): Promise<IDocumentIssue[]> {
    return DocumentIssueModel.find({
      _id: { $in: issueIds.map(id => new Types.ObjectId(id)) },
    }).lean() as unknown as IDocumentIssue[];
  },

  /** Returns issues previously generated for a (document, analysis) pair — used as cache. */
  async findByDocumentAndAnalysis(
    documentId: string,
    analysisId: string,
  ): Promise<IDocumentIssue[]> {
    return DocumentIssueModel.find({
      documentId: new Types.ObjectId(documentId),
      analysisId: new Types.ObjectId(analysisId),
    }).lean() as unknown as IDocumentIssue[];
  },
};
