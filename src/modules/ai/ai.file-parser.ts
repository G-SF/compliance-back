/**
 * AI File Parser
 *
 * Extracts plain text from uploaded contract files.
 * PDFs go through the full pre-processing pipeline (pdf-processor.ts) to reduce
 * token usage and improve AI response quality. TXT and DOCX use lightweight
 * normalisation.
 * Supported: .txt, .pdf, .docx
 */

import PizZip from 'pizzip';
import path from 'path';
import { processPdfForAi } from './pdf-processor';

export const ALLOWED_EXTENSIONS = ['.txt', '.pdf', '.docx'];

/**
 * Controls how the PDF pre-processing pipeline handles the contract text.
 *
 * - `'analysis'` — skips `filterRelevantSections` so the complete contract is
 *   preserved. Required by /generate-with-files, whose structured JSON output
 *   must cover parties/CNPJ, IP, LGPD, confidentiality, exclusivity, etc.
 *
 * - `'ask'` — applies `filterRelevantSections` to focus the context on clauses
 *   matching relevance keywords, reducing tokens for question-answering calls.
 */
export type FileExtractionMode = 'analysis' | 'ask';

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
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, ' ')
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
 *
 * @param mode - `'analysis'` preserves the full contract text (no relevance
 *   filter) for structured JSON analysis. `'ask'` applies the relevance filter
 *   to reduce tokens for question-answering calls. Defaults to `'ask'`.
 */
export async function extractTextFromFile(
  buffer: Buffer,
  filename: string,
  mode: FileExtractionMode = 'ask',
): Promise<string> {
  const ext = path.extname(filename).toLowerCase();

  let raw: string;

  switch (ext) {
    case '.txt':
      raw = buffer.toString('utf8');
      break;

    case '.pdf': {
      // Full pipeline: extract → clean → [filter] → chunk → cap
      // applyFilter=false for 'analysis' to preserve parties/CNPJ, IP, LGPD, etc.
      const { text } = await processPdfForAi(buffer, { applyFilter: mode !== 'analysis' });
      return text;
    }

    case '.docx': {
      // Usa PizZip (fork do JSZip otimizado para Office Open XML) para
      // descompactar o DOCX e extrai o texto de word/document.xml sem depender
      // do mammoth, que repassa o ArrayBuffer ao JSZip com byteOffset errado.
      const zip = new PizZip(buffer);
      const xmlFile = zip.files['word/document.xml'];
      if (!xmlFile) throw new Error('Arquivo DOCX inválido: word/document.xml não encontrado.');
      const xml = xmlFile.asText();
      // Preserva quebras de parágrafo (<w:p>) e remove demais tags XML
      raw = xml
        .replace(/<w:br[^>]*\/>/gi, '\n')
        .replace(/<\/w:p>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
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
