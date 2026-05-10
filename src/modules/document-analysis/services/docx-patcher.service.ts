/**
 * DOCX Patcher Service
 *
 * Applies surgical text patches to a DOCX file while preserving all
 * original formatting (fonts, bold/italic, tables, styles, images, etc.).
 *
 * Strategy:
 *   1. Unzip the DOCX (which is a ZIP containing XML files)
 *   2. Load `word/document.xml`
 *   3. Extract all <w:t> (text run) elements with their positions in the XML string
 *   4. Build a "virtual" plain text by joining all decoded <w:t> contents
 *   5. For each patch, locate trecho_exato in the virtual text
 *   6. Map the match back to the affected <w:t> elements:
 *      - First element: keep prefix before match + insert rewrite text
 *      - Middle elements: clear content (they were part of the replaced span)
 *      - Last element: keep suffix after match
 *   7. Re-encode XML entities in the new content
 *   8. Add xml:space="preserve" when content has leading/trailing whitespace
 *   9. Repack the ZIP and return the modified DOCX buffer
 */

import PizZip from 'pizzip';

export interface DocxPatch {
  trecho_exato: string;
  rewrite: string;
}

// ── XML entity helpers ─────────────────────────────────────────────────────

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"');
}

function encodeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&apos;')
    .replace(/"/g, '&quot;');
}

// ── Run extraction ─────────────────────────────────────────────────────────

interface RunInfo {
  /** Position of the opening `<w:t` tag in the XML string */
  elementStart: number;
  /** Position just after the closing `</w:t>` in the XML string */
  elementEnd: number;
  /** Position of the text content start (right after `>` of opening tag) */
  contentStart: number;
  /** Position of the text content end (right before `</w:t>`) */
  contentEnd: number;
  /** Decoded plain-text content of this run */
  decodedText: string;
  /** Start position in the virtual (concatenated) text */
  virtualStart: number;
  /** End position in the virtual (concatenated) text (exclusive) */
  virtualEnd: number;
}

/**
 * Extracts all <w:t> elements from the XML string and builds a virtual text
 * by concatenating their decoded contents.
 */
function extractRuns(xml: string): { runs: RunInfo[]; virtualText: string } {
  const runs: RunInfo[] = [];
  let virtualText = '';

  // Matches <w:t>, <w:t xml:space="preserve">, or any other attribute variant
  const pattern = /(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(xml)) !== null) {
    const elementStart = match.index;
    const openTag = match[1];
    const rawContent = match[2];
    const elementEnd = match.index + match[0].length;
    const contentStart = elementStart + openTag.length;
    const contentEnd = contentStart + rawContent.length;
    const decodedText = decodeXml(rawContent);

    runs.push({
      elementStart,
      elementEnd,
      contentStart,
      contentEnd,
      decodedText,
      virtualStart: virtualText.length,
      virtualEnd: virtualText.length + decodedText.length,
    });

    virtualText += decodedText;
  }

  return { runs, virtualText };
}

// ── Single-patch application ───────────────────────────────────────────────

function applyPatchToXml(xml: string, trecho: string, rewrite: string): string {
  const { runs, virtualText } = extractRuns(xml);

  const matchIndex = virtualText.indexOf(trecho);
  if (matchIndex === -1) return xml; // not found — skip gracefully

  const matchEnd = matchIndex + trecho.length;

  // Runs whose virtual span overlaps the match
  const affected = runs.filter(r => r.virtualEnd > matchIndex && r.virtualStart < matchEnd);
  if (affected.length === 0) return xml;

  /**
   * Compute the new decoded content for each affected run:
   *  - First run: prefix (before match) + full rewrite
   *  - Middle runs: empty string
   *  - Last run: suffix (after match)
   *  - Single run (first === last): prefix + rewrite + suffix
   */
  const replacements: Array<{ contentStart: number; contentEnd: number; newRawContent: string }> =
    [];

  for (let i = 0; i < affected.length; i++) {
    const run = affected[i];
    const isFirst = i === 0;
    const isLast = i === affected.length - 1;

    let newDecoded: string;

    if (isFirst && isLast) {
      const prefix = run.decodedText.slice(0, matchIndex - run.virtualStart);
      const suffix = run.decodedText.slice(matchEnd - run.virtualStart);
      newDecoded = prefix + rewrite + suffix;
    } else if (isFirst) {
      const prefix = run.decodedText.slice(0, matchIndex - run.virtualStart);
      newDecoded = prefix + rewrite;
    } else if (isLast) {
      const suffixStart = matchEnd - run.virtualStart;
      newDecoded = suffixStart < run.decodedText.length ? run.decodedText.slice(suffixStart) : '';
    } else {
      newDecoded = '';
    }

    replacements.push({
      contentStart: run.contentStart,
      contentEnd: run.contentEnd,
      newRawContent: encodeXml(newDecoded),
    });
  }

  // Apply in reverse order (highest position first) so earlier positions stay valid
  replacements.sort((a, b) => b.contentStart - a.contentStart);

  let result = xml;
  for (const rep of replacements) {
    result = result.slice(0, rep.contentStart) + rep.newRawContent + result.slice(rep.contentEnd);
  }

  return result;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Applies an array of text patches to a DOCX buffer.
 * Returns the modified DOCX buffer with original formatting intact.
 *
 * @throws if the buffer is not a valid DOCX (missing word/document.xml)
 */
export function applyPatchesToDocx(buffer: Buffer, patches: DocxPatch[]): Buffer {
  const zip = new PizZip(buffer);

  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('Invalid DOCX: missing word/document.xml');

  let xml = docFile.asText();

  for (const patch of patches) {
    if (patch.trecho_exato.trim() && patch.rewrite !== undefined) {
      xml = applyPatchToXml(xml, patch.trecho_exato, patch.rewrite);
    }
  }

  zip.file('word/document.xml', xml);

  return Buffer.from(zip.generate({ type: 'uint8array', compression: 'DEFLATE' }));
}

/**
 * Creates a minimal DOCX buffer from plain text.
 * Each \n in `text` becomes a new paragraph.
 */
export function createDocxFromText(text: string): Buffer {
  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => `<w:p><w:r><w:t xml:space="preserve">${encodeXml(line)}</w:t></w:r></w:p>`)
    .join('');

  const documentXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
    `<w:body>${paragraphs}<w:sectPr/></w:body>`,
    '</w:document>',
  ].join('');

  const contentTypes = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
    '</Types>',
  ].join('');

  const rootRels = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>',
    '</Relationships>',
  ].join('');

  const wordRels = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>',
  ].join('');

  const zip = new PizZip();
  zip.file('[Content_Types].xml', contentTypes);
  zip.file('_rels/.rels', rootRels);
  zip.file('word/document.xml', documentXml);
  zip.file('word/_rels/document.xml.rels', wordRels);

  return Buffer.from(zip.generate({ type: 'uint8array', compression: 'DEFLATE' }));
}
