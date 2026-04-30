/**
 * PDF Processor — Pre-processing Pipeline for Contract Analysis
 *
 * Reduces token usage and improves AI response quality by extracting,
 * cleaning, filtering, and chunking PDF text before it reaches the AI API.
 *
 * Pipeline: extractPdfText → cleanText → filterRelevantSections → splitIntoChunks
 *
 * Typical token reduction: 50–70 % compared to sending raw extracted text.
 */

import pdfParse = require('pdf-parse');
import { logger } from '../../shared/utils/logger';

/** Approximate characters per Claude token. Used only for log estimates. */
const CHARS_PER_TOKEN = 4;

/** Target chunk size in characters (~2 000 tokens each). */
const CHUNK_SIZE_CHARS = 8_000;

/** Hard cap on total characters assembled for the AI (~15 k tokens). */
const MAX_AI_CHARS = 60_000;

/**
 * Keywords indicating contractually relevant content.
 * Prefix/infix matches — covers inflected forms (e.g. "rescisão", "rescisório").
 */
const RELEVANCE_KEYWORDS = [
  'rescis',
  'multa',
  'penalidade',
  'prazo',
  'vigên',
  'vigenc',
  'cláusula',
  'clausula',
  'contrato',
  'aviso',
];

// ── Step 1 — Extraction ────────────────────────────────────────────────────

/**
 * Extracts raw text from a PDF buffer using pdf-parse.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer);
  return data.text;
}

// ── Step 2 — Cleaning ─────────────────────────────────────────────────────

/**
 * Deeply cleans raw extracted text:
 *  - Strips control characters (null bytes, form-feeds, etc.)
 *  - Removes lines that are ONLY a page number in common formats:
 *      "3", "Página 3", "Page 3 of 10", "- 3 -"
 *  - Collapses multiple spaces/tabs to a single space per line
 *  - Collapses 3+ consecutive blank lines to 2
 */
export function cleanText(raw: string): string {
  const pageNumberPattern =
    /^\s*(?:p[áa]gina|page|pg\.?)?\s*-?\s*\d{1,4}\s*(?:\/\s*\d{1,4}|of\s+\d{1,4})?\s*-?\s*$/i;

  return raw
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ')
    .split('\n')
    .map(line => line.replace(/[ \t]{2,}/g, ' ').trimEnd())
    .filter(line => !pageNumberPattern.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Step 3 — Relevance Filter ──────────────────────────────────────────────

/**
 * Keeps only paragraphs that contain at least one relevance keyword.
 * Operates at paragraph granularity (split by blank lines) so each matched
 * block retains its full local context.
 *
 * Falls back to the entire cleaned text when no paragraphs match, ensuring
 * no essential context is silently dropped.
 */
export function filterRelevantSections(text: string): string {
  const regex = new RegExp(RELEVANCE_KEYWORDS.join('|'), 'i');
  const paragraphs = text.split(/\n{2,}/);
  const relevant = paragraphs.filter(p => regex.test(p));

  if (relevant.length === 0) {
    logger.warn(
      '[PDF] No relevant sections matched keywords — using full cleaned text as fallback',
    );
    return text;
  }

  return relevant.join('\n\n');
}

// ── Step 4 — Chunking ─────────────────────────────────────────────────────

/**
 * Splits text into chunks of at most `chunkSize` characters.
 * Prefers to break at the last paragraph boundary within the window to avoid
 * cutting mid-sentence.
 */
export function splitIntoChunks(text: string, chunkSize = CHUNK_SIZE_CHARS): string[] {
  if (text.length <= chunkSize) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= chunkSize) {
      chunks.push(remaining);
      break;
    }

    const slice = remaining.slice(0, chunkSize);
    const lastBreak = slice.lastIndexOf('\n\n');
    // Only use the paragraph break if it falls in the latter half of the window
    const cut = lastBreak > chunkSize * 0.5 ? lastBreak + 2 : chunkSize;

    chunks.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }

  return chunks;
}

// ── Pipeline ──────────────────────────────────────────────────────────────

export interface PdfProcessResult {
  /** Final text ready to be sent to the AI. */
  text: string;
  /** Character count of the raw extracted text (before any processing). */
  originalChars: number;
  /** Character count of the text after the full pipeline. */
  processedChars: number;
  /** Estimated percentage of characters (≈ tokens) removed. */
  reductionPct: number;
  /** Number of chunks the filtered text was split into (informational). */
  chunkCount: number;
}

/**
 * Full pipeline: extract → clean → filter → chunk → cap → log.
 *
 * All relevant chunks are concatenated in order up to MAX_AI_CHARS.
 * A truncation notice is appended when the cap is reached.
 */
export async function processPdfForAi(buffer: Buffer): Promise<PdfProcessResult> {
  // Step 1 — Extract
  const raw = await extractPdfText(buffer);
  const originalChars = raw.length;

  // Step 2 — Clean
  const cleaned = cleanText(raw);

  // Step 3 — Filter
  const filtered = filterRelevantSections(cleaned);

  // Step 4 — Chunk
  const chunks = splitIntoChunks(filtered);

  // Reassemble chunks up to the hard cap
  let assembled = '';
  for (const chunk of chunks) {
    if (assembled.length + chunk.length + 2 > MAX_AI_CHARS) {
      assembled += '\n\n[DOCUMENTO TRUNCADO — seções adicionais omitidas por limite de tamanho]';
      break;
    }
    assembled += (assembled ? '\n\n' : '') + chunk;
  }

  const processedChars = assembled.length;
  const reductionPct =
    originalChars > 0 ? Math.round((1 - processedChars / originalChars) * 100) : 0;

  logger.info('[PDF] Pre-processing complete', {
    originalChars,
    processedChars,
    estimatedOriginalTokens: Math.round(originalChars / CHARS_PER_TOKEN),
    estimatedProcessedTokens: Math.round(processedChars / CHARS_PER_TOKEN),
    reductionPct: `${reductionPct}%`,
    chunkCount: chunks.length,
  });

  return {
    text: assembled,
    originalChars,
    processedChars,
    reductionPct,
    chunkCount: chunks.length,
  };
}
