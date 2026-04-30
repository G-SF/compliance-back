/**
 * AI File Parser
 *
 * Extracts plain text from uploaded contract files.
 * Normalizes the extracted text to reduce token usage (collapse whitespace,
 * remove page-number artifacts, truncate very large documents).
 * Supported: .txt, .pdf, .docx
 */

import pdfParse = require('pdf-parse');
import mammoth from 'mammoth';
import path from 'path';

export const ALLOWED_EXTENSIONS = ['.txt', '.pdf', '.docx'];

/**
 * Maximum characters to send to the AI (~15 k tokens).
 * Covers 99 % of real contracts while avoiding runaway cost on oversized files.
 */
const MAX_DOCUMENT_CHARS = 60_000;

/**
 * Normalizes raw extracted text to reduce token waste:
 *  - Removes control characters (null bytes, etc.)
 *  - Collapses multiple spaces/tabs to a single space per line
 *  - Strips lines that are only a standalone page number (PDF artifact)
 *  - Collapses 3+ consecutive blank lines to 2
 */
function normalizeExtractedText(raw: string): string {
  return raw
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ')
    .split('\n')
    .map(line => line.replace(/[ \t]{2,}/g, ' ').trimEnd())
    .filter(line => !/^\s*\d{1,4}\s*$/.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Extracts and normalizes text content from a file buffer based on its extension.
 * Throws a 400-statusCode error for unsupported types.
 */
export async function extractTextFromFile(buffer: Buffer, filename: string): Promise<string> {
  const ext = path.extname(filename).toLowerCase();

  let raw: string;

  switch (ext) {
    case '.txt':
      raw = buffer.toString('utf8');
      break;

    case '.pdf': {
      const data = await pdfParse(buffer);
      raw = data.text;
      break;
    }

    case '.docx': {
      const result = await mammoth.extractRawText({ buffer });
      raw = result.value;
      break;
    }

    default:
      throw Object.assign(
        new Error(
          `Tipo de arquivo não suportado: "${ext}". Permitidos: ${ALLOWED_EXTENSIONS.join(', ')}`,
        ),
        { statusCode: 400 },
      );
  }

  const normalized = normalizeExtractedText(raw);

  if (normalized.length > MAX_DOCUMENT_CHARS) {
    return (
      normalized.slice(0, MAX_DOCUMENT_CHARS) +
      '\n\n[DOCUMENTO TRUNCADO — texto restante omitido por limite de tamanho]'
    );
  }

  return normalized;
}
