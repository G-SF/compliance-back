/**
 * AI File Parser
 *
 * Extracts plain text from uploaded contract files.
 * Supported: .txt, .pdf, .docx
 */

import pdfParse = require('pdf-parse');
import mammoth from 'mammoth';
import path from 'path';

export const ALLOWED_EXTENSIONS = ['.txt', '.pdf', '.docx'];

/**
 * Extracts text content from a file buffer based on its extension.
 * Throws a 400-statusCode error for unsupported types.
 */
export async function extractTextFromFile(buffer: Buffer, filename: string): Promise<string> {
  const ext = path.extname(filename).toLowerCase();

  switch (ext) {
    case '.txt':
      return buffer.toString('utf8').trim();

    case '.pdf': {
      const data = await pdfParse(buffer);
      return data.text.trim();
    }

    case '.docx': {
      const result = await mammoth.extractRawText({ buffer });
      return result.value.trim();
    }

    default:
      throw Object.assign(
        new Error(
          `Tipo de arquivo não suportado: "${ext}". Permitidos: ${ALLOWED_EXTENSIONS.join(', ')}`,
        ),
        { statusCode: 400 },
      );
  }
}
