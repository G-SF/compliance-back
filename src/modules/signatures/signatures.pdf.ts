/**
 * Signature PDF Builder
 *
 * Appends a final "evidence" page to the original PDF containing the textual
 * proof of the electronic signature plus the hand-drawn signature image.
 * Uses pdf-lib (already a project dependency). No ICP-Brasil, no certificates.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface SignedPdfInput {
  /** Original uploaded PDF bytes */
  originalPdf: Buffer;
  /** Hand-drawn signature as a Base64 PNG (raw or `data:image/png;base64,...`) */
  signaturePngBase64: string;
  name: string;
  email: string;
  /** SHA-256 of the original PDF */
  pdfHash: string;
  signedAt: Date;
}

/** Strips an optional data-URL prefix and returns the raw PNG bytes. */
function decodePngBase64(input: string): Buffer {
  const commaIdx = input.indexOf(',');
  const base64 = input.startsWith('data:') && commaIdx !== -1 ? input.slice(commaIdx + 1) : input;
  return Buffer.from(base64, 'base64');
}

/**
 * Returns a new PDF (Buffer) equal to the original with one extra page
 * describing the electronic signature.
 */
export async function buildSignedPdf(input: SignedPdfInput): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(input.originalPdf, { ignoreEncryption: true });

  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // A4 portrait
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const margin = 56;
  const dark = rgb(0.1, 0.12, 0.16);
  const muted = rgb(0.38, 0.42, 0.48);

  let y = height - margin;

  // Title
  page.drawText('Assinado eletronicamente', {
    x: margin,
    y,
    size: 20,
    font: helveticaBold,
    color: dark,
  });
  y -= 14;

  // Divider
  page.drawLine({
    start: { x: margin, y: y - 6 },
    end: { x: width - margin, y: y - 6 },
    thickness: 1,
    color: rgb(0.85, 0.87, 0.9),
  });
  y -= 44;

  // Evidence fields
  const drawField = (label: string, value: string): void => {
    page.drawText(label, { x: margin, y, size: 9, font: helveticaBold, color: muted });
    y -= 16;
    page.drawText(value, { x: margin, y, size: 12, font: helvetica, color: dark });
    y -= 28;
  };

  drawField('NOME', input.name || '—');
  drawField('EMAIL', input.email || '—');
  drawField('DATA (UTC)', input.signedAt.toISOString());
  drawField('HASH (SHA-256 do documento original)', input.pdfHash);

  // Signature image
  y -= 8;
  page.drawText('ASSINATURA', { x: margin, y, size: 9, font: helveticaBold, color: muted });
  y -= 12;

  try {
    const pngBytes = decodePngBase64(input.signaturePngBase64);
    const png = await pdfDoc.embedPng(pngBytes);
    const maxW = 240;
    const scale = png.width > maxW ? maxW / png.width : 1;
    const drawW = png.width * scale;
    const drawH = png.height * scale;
    page.drawImage(png, { x: margin, y: y - drawH, width: drawW, height: drawH });
    y -= drawH + 8;
  } catch {
    // If the PNG is invalid, fall back to a baseline so the document still renders
    y -= 60;
  }

  page.drawLine({
    start: { x: margin, y },
    end: { x: margin + 240, y },
    thickness: 1,
    color: rgb(0.6, 0.63, 0.68),
  });

  // Footer disclaimer
  page.drawText('Documento assinado eletronicamente. Assinatura simples (sem ICP-Brasil).', {
    x: margin,
    y: margin,
    size: 8,
    font: helvetica,
    color: muted,
  });

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

/** Validates that the buffer looks like a PDF (magic bytes `%PDF`). */
export function isPdfBuffer(buffer: Buffer): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x25 && // %
    buffer[1] === 0x50 && // P
    buffer[2] === 0x44 && // D
    buffer[3] === 0x46 // F
  );
}
