/**
 * Chunk Service
 *
 * Splits plain text into semantically bounded chunks suitable for AI analysis
 * (~500–1000 tokens each) and manages context windows for adjacent chunks.
 */

import crypto from 'crypto';

/** Target chunk size in characters (≈ 875 tokens at 4 chars/token) */
const TARGET_CHARS = 3_500;
/** Hard ceiling — never exceed this to stay within model context windows */
const MAX_CHARS = 5_000;

export interface ChunkWithContext {
  index: number;
  chunk: string;
  /** Truncated excerpt of the preceding chunk (for context-aware prompts) */
  prevExcerpt?: string;
  /** Truncated excerpt of the following chunk (for context-aware prompts) */
  nextExcerpt?: string;
}

const CONTEXT_EXCERPT_CHARS = 300;

export const chunkService = {
  /**
   * Splits text into chunks of ~TARGET_CHARS characters.
   * Splits at double-newline paragraph boundaries when possible
   * to preserve natural semantic units.
   */
  splitIntoChunks(text: string): string[] {
    const paragraphs = text
      .split(/\n{2,}/)
      .map(p => p.trim())
      .filter(Boolean);

    const chunks: string[] = [];
    let current = '';

    for (const para of paragraphs) {
      const wouldExceed = current.length + para.length + 2 > MAX_CHARS;

      if (wouldExceed && current.length > 0) {
        chunks.push(current.trim());
        current = para;
      } else {
        current = current ? `${current}\n\n${para}` : para;
      }

      // Flush early when a single paragraph already hits the target
      if (current.length >= TARGET_CHARS) {
        chunks.push(current.trim());
        current = '';
      }
    }

    if (current.trim()) {
      chunks.push(current.trim());
    }

    return chunks.filter(c => c.length > 0);
  },

  /** SHA-256 fingerprint of chunk content (used for cache deduplication) */
  hashContent(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  },

  /**
   * Returns a chunk enriched with brief excerpts from adjacent chunks.
   * Used when building prompts for context-sensitive analysis.
   */
  withContext(chunks: string[], index: number): ChunkWithContext {
    return {
      index,
      chunk: chunks[index],
      prevExcerpt:
        index > 0 ? chunks[index - 1].slice(-CONTEXT_EXCERPT_CHARS).trimStart() : undefined,
      nextExcerpt:
        index < chunks.length - 1
          ? chunks[index + 1].slice(0, CONTEXT_EXCERPT_CHARS).trimEnd()
          : undefined,
    };
  },

  /**
   * Groups an ordered list of chunk indices into batches.
   * Each batch is sent to the AI in a single call to reduce API round-trips.
   */
  batchIndices(indices: number[], batchSize: number): number[][] {
    const batches: number[][] = [];
    for (let i = 0; i < indices.length; i += batchSize) {
      batches.push(indices.slice(i, i + batchSize));
    }
    return batches;
  },
};
