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

/** Hard cap on total characters assembled for the AI (~10 k tokens). */
const MAX_AI_CHARS = 40_000;

/**
 * Keywords indicating contractually relevant content.
 * Prefix/infix matches — covers inflected forms (e.g. "rescisão", "rescisório").
 */
const RELEVANCE_KEYWORDS = [
  // rescisão, vigência, cláusulas
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
  // pagamento e valores
  'pagamento',
  'valor',
  'remunera',
  'honorár',
  'honorar',
  'preço',
  'preco',
  // partes
  'contratante',
  'contratado',
  'parte',
  // propriedade intelectual e confidencialidade
  'propriedade intelectual',
  'direito autoral',
  'confidencialid',
  'sigilo',
  // responsabilidade e indenização
  'responsabilid',
  'indenizaç',
  'indenizac',
  // proteção de dados
  'lgpd',
  'dado pessoal',
  'tratamento de dado',
  // foro e exclusividade
  'foro',
  'exclusivid',
];

// ── Step 0 — Audit-trail stripping ────────────────────────────────────────

/**
 * Removes digital-signature audit trails appended by CredSign/CredPago and
 * similar e-signature platforms (DocuSign, ClickSign, etc.).
 *
 * In signed Brazilian contracts these sections typically occupy 2-4 extra
 * pages and can account for 35-50% of the total input tokens while carrying
 * zero contractual value.
 *
 * Strategy:
 *  1. Hard cut at the first "Eventos do documento" heading — everything after
 *     this point is the audit log (timestamps, IPs, event records).
 *  2. Strip CredSign footer lines embedded on each content page.
 *  3. Strip remaining standalone hash lines / metadata headers.
 */
function stripSignatureAuditTrail(text: string): string {
  // 1. Cut at the audit-log section header (CredSign / DocuSign / ClickSign)
  const auditHeaderRe = /\b(?:Eventos\s+do\s+documento|Log\s+de\s+assinatura|Audit\s+trail)\b/i;
  const match = auditHeaderRe.exec(text);
  if (match) {
    text = text.slice(0, match.index).trimEnd();
  }

  return (
    text
      // CredSign footer: "CredSign: <hash> - Para validar acesse <url>"
      .replace(/CredSign:\s*[A-Fa-f0-9]{20,}[^\n]*/gi, '')
      // "Código do documento #<hash>"
      .replace(/C[oó]digo\s+do\s+documento\s*#[A-Fa-f0-9]+[^\n]*/gi, '')
      // "Hash do documento original / (SHA256): <hash>"
      .replace(/Hash\s+do\s+documento\s+original[\s\S]*?[A-Fa-f0-9]{20,}/gi, '')
      // "Este log pertence única e exclusivamente ao documento de HASH acima"
      .replace(/Este\s+log\s+pertence\s+[úu]nica\s+e\s+exclusivamente[^\n]*/gi, '')
      // "X páginas - Datas e horários em GMT ..."
      .replace(/\d+\s+p[áa]ginas\s*[-–]\s*Datas\s+e\s+hor[áa]rios[^\n]*/gi, '')
      // "Última atualização em ..."
      .replace(/[ÚU]ltima\s+atualiza[çc][ãa]o\s+em[^\n]*/gi, '')
      // Standalone 32+ char hex strings (orphaned hashes not caught by cleanText)
      .replace(/^[A-Fa-f0-9]{32,}\s*$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

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
 *  - Strips digital-signature certificate blocks (-----BEGIN … -----END-----)
 *  - Strips control characters (null bytes, form-feeds, etc.)
 *  - Removes lines that are ONLY a page number in common formats:
 *      "3", "Página 3", "Page 3 of 10", "- 3 -"
 *  - Removes pure hex lines (hash dumps / certificate fingerprints)
 *  - Removes digital-signature metadata lines (Assinado digitalmente, Certificado:, etc.)
 *  - Collapses multiple spaces/tabs to a single space per line
 *  - Collapses 3+ consecutive blank lines to 2
 */
export function cleanText(raw: string): string {
  const pageNumberPattern =
    /^\s*(?:p[áa]gina|page|pg\.?)?\s*-?\s*\d{1,4}\s*(?:\/\s*\d{1,4}|of\s+\d{1,4})?\s*-?\s*$/i;

  // Pure hex lines: only hex digits, colons, and spaces — typical of hash/fingerprint dumps
  const pureHexLineRe = /^[A-Fa-f0-9][A-Fa-f0-9\s:]{30,}$/;

  // Known digital-signature metadata prefixes (case-insensitive)
  const sigMetaRe =
    /^\s*(?:assinado\s+digitalmente|assinatura\s+digital|certificado\s*:|algoritmo\s*:|issuer\s*:|subject\s*:|serial\s*:|validity\s*:|fingerprint\s*:)/i;

  // Step 1 — strip PEM/CMS certificate blocks entirely (can span many lines)
  const withoutBlocks = raw.replace(/-----BEGIN[\s\S]*?-----END[^\n]*-----/g, '');

  return withoutBlocks
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ')
    .split('\n')
    .map(line => line.replace(/[ \t]{2,}/g, ' ').trimEnd())
    .filter(line => {
      const t = line.trim();
      if (pageNumberPattern.test(line)) return false;
      if (pureHexLineRe.test(t)) return false;
      if (sigMetaRe.test(t)) return false;
      return true;
    })
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

export interface PdfProcessOptions {
  /**
   * When true (default), applies `filterRelevantSections` to focus on
   * contractually relevant paragraphs — ideal for question-answering.
   *
   * Set to false for full-document structured analysis (generate-with-files)
   * so that sections about parties/CNPJ, IP, LGPD, confidentiality, etc.
   * are never silently discarded before the AI sees them.
   */
  applyFilter?: boolean;
}

/**
 * Full pipeline: extract → clean → [filter] → chunk → cap → log.
 *
 * All relevant chunks are concatenated in order up to MAX_AI_CHARS.
 * A truncation notice is appended when the cap is reached.
 *
 * @param options.applyFilter - defaults to `true`; set to `false` to skip
 *   `filterRelevantSections` and preserve the complete contract text.
 */
export async function processPdfForAi(
  buffer: Buffer,
  options: PdfProcessOptions = {},
): Promise<PdfProcessResult> {
  const { applyFilter = true } = options;
  // Step 1 — Extract
  const raw = await extractPdfText(buffer);
  const originalChars = raw.length;

  // Step 1.5 — Strip e-signature audit trail (CredSign, DocuSign, etc.)
  // Must run before cleanText so subsequent filters see only contract content.
  const withoutAudit = stripSignatureAuditTrail(raw);

  // Step 2 — Clean
  const cleaned = cleanText(withoutAudit);

  // Step 3 — Filter (skipped for full-document analysis to preserve all clauses)
  const filtered = applyFilter ? filterRelevantSections(cleaned) : cleaned;

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
