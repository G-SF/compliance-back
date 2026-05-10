/**
 * PDF Patcher Service — Whitepaint approach (v2)
 *
 * Applies surgical text patches to a PDF while preserving the original layout:
 * images, tables, page numbers, headers, footers, columns — all untouched.
 *
 * Key improvements over v1:
 *   1. Font size from item.height (pdfjs 3.x) + vector-magnitude fallback.
 *   2. Overflow prevention: replacement text is word-wrapped using real Helvetica
 *      metrics (font.widthOfTextAtSize). If the rewrite needs more lines than the
 *      original, the font size is scaled down via binary search to fit — this
 *      eliminates the garbling caused by text overflowing into adjacent paragraphs.
 *   3. A single full-span whitepaint rectangle covers the entire matched region in
 *      addition to per-line rects, preventing partial glyph bleed-through.
 *   4. Each patch is wrapped in try/catch — one bad patch never corrupts the doc.
 *   5. Line-grouping tolerance raised to 4 pt (handles denser PDFs).
 */

import { PDFDocument, PDFFont, rgb, StandardFonts } from 'pdf-lib';

// pdfjs-dist v3 legacy build — CommonJS, no web worker in Node.js
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports
const pdfjsLib: any = require('pdfjs-dist/legacy/build/pdf.js');
pdfjsLib.GlobalWorkerOptions.workerSrc = '';

export interface PdfPatch {
  trecho_exato: string;
  rewrite: string;
}

interface TextItem {
  str: string;
  x: number; // left edge, PDF page coords (pt, origin bottom-left)
  y: number; // baseline y, PDF page coords
  width: number; // advance width (pt)
  fontSize: number; // detected font size (pt)
  pageIndex: number;
  virtualStart: number;
  virtualEnd: number;
}

// ── Geometry constants ─────────────────────────────────────────────────────

const ASCENT = 0.9; // fraction of fontSize to cover above baseline
const DESCENT = 0.35; // fraction of fontSize to cover below baseline
const H_PAD = 5; // horizontal padding for each whitepaint rect (pt)
const V_PAD = 4; // vertical padding (pt)
const LINE_TOL = 4; // y-distance threshold for same-line grouping (pt)
const MIN_FONT = 5; // minimum allowed font size when scaling down (pt)

// ── Step 1: Extract text items ─────────────────────────────────────────────

async function extractTextItems(buffer: Buffer): Promise<TextItem[]> {
  const pdf = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    verbosity: 0,
    isEvalSupported: false,
  }).promise;

  const all: TextItem[] = [];
  let cursor = 0;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent({ includeMarkedContent: false });

    for (const raw of content.items) {
      if (!('str' in raw)) continue;
      const item = raw as {
        str: string;
        transform: number[];
        width: number;
        height: number;
      };
      if (!item.str) continue;

      const [a, b, , , tx, ty] = item.transform;

      // Primary: item.height (pdfjs 3.x reports rendered glyph height directly)
      // Fallback: magnitude of the transform scale vector
      const fromHeight = Math.abs(item.height);
      const fromTransform = Math.sqrt(a * a + b * b);
      const fontSize = Math.max(fromHeight > 0.5 ? fromHeight : 0, fromTransform, 1);

      // item.width is the advance width; use abs() to handle RTL
      const itemWidth =
        Math.abs(item.width) > 0 ? Math.abs(item.width) : fontSize * item.str.length * 0.55;

      all.push({
        str: item.str,
        x: tx,
        y: ty,
        width: itemWidth,
        fontSize,
        pageIndex: pageNum - 1,
        virtualStart: cursor,
        virtualEnd: cursor + item.str.length,
      });
      cursor += item.str.length;
    }
  }

  return all;
}

// ── Step 2: Locate needle in virtual text ──────────────────────────────────

function findInVirtualText(
  haystack: string,
  needle: string,
): { start: number; end: number } | null {
  const exact = haystack.indexOf(needle);
  if (exact !== -1) return { start: exact, end: exact + needle.length };

  // Whitespace-normalised fallback
  const posMap: number[] = [];
  let norm = '';
  let lastSpace = false;
  for (let i = 0; i < haystack.length; i++) {
    if (/\s/.test(haystack[i])) {
      if (!lastSpace) {
        norm += ' ';
        posMap.push(i);
      }
      lastSpace = true;
    } else {
      norm += haystack[i];
      posMap.push(i);
      lastSpace = false;
    }
  }
  const normNeedle = needle.replace(/\s+/g, ' ').trim();
  const ni = norm.indexOf(normNeedle);
  if (ni === -1) return null;

  const s = posMap[ni] ?? ni;
  const e = (posMap[ni + normNeedle.length - 1] ?? ni + normNeedle.length - 1) + 1;
  return { start: s, end: e };
}

// ── Step 3: Layout helpers ─────────────────────────────────────────────────

function groupIntoLines(items: TextItem[]): TextItem[][] {
  const lines: TextItem[][] = [];
  for (const item of items) {
    const existing = lines.find(l => Math.abs(l[0].y - item.y) <= LINE_TOL);
    if (existing) existing.push(item);
    else lines.push([item]);
  }
  // Top → bottom (higher y = visually higher in PDF coords)
  lines.sort((a, b) => b[0].y - a[0].y);
  for (const line of lines) line.sort((a, b) => a.x - b.x);
  return lines;
}

/**
 * Word-wraps `text` to fit within `maxWidth` at `fontSize` using real
 * Helvetica metrics. Returns an array of visual lines.
 */
function wordWrap(text: string, maxWidth: number, fontSize: number, font: PDFFont): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const wrapped: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth || !current) {
      current = candidate;
    } else {
      if (current) wrapped.push(current);
      current = word;
    }
  }
  if (current) wrapped.push(current);
  return wrapped.length > 0 ? wrapped : [''];
}

/**
 * Binary-searches for the largest font size at which `text` fits within
 * `numLines` visual lines at `maxWidth`. Never returns below MIN_FONT.
 */
function fittingFontSize(
  text: string,
  maxWidth: number,
  numLines: number,
  nominalSize: number,
  font: PDFFont,
): number {
  if (wordWrap(text, maxWidth, nominalSize, font).length <= numLines) {
    return nominalSize; // nominal size already fits
  }
  // Binary search between MIN_FONT and nominalSize
  let lo = MIN_FONT;
  let hi = nominalSize;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (wordWrap(text, maxWidth, mid, font).length <= numLines) lo = mid;
    else hi = mid;
  }
  return Math.max(MIN_FONT, lo);
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Applies an array of text patches to a PDF buffer.
 * Returns the modified PDF buffer with the original layout intact.
 */
export async function applyPatchesToPdf(buffer: Buffer, patches: PdfPatch[]): Promise<Buffer> {
  const items = await extractTextItems(buffer);
  const virtualText = items.map(i => i.str).join('');

  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (const patch of patches) {
    if (!patch.trecho_exato?.trim() || patch.rewrite === undefined) continue;

    try {
      const found = findInVirtualText(virtualText, patch.trecho_exato);
      if (!found) continue;

      const { start, end } = found;

      const affected = items.filter(it => it.virtualEnd > start && it.virtualStart < end);
      if (!affected.length) continue;

      // Group by page
      const byPage = new Map<number, TextItem[]>();
      for (const it of affected) {
        const arr = byPage.get(it.pageIndex) ?? [];
        arr.push(it);
        byPage.set(it.pageIndex, arr);
      }

      for (const [pageIdx, pageItems] of byPage) {
        const page = pages[pageIdx];
        if (!page) continue;

        const lines = groupIntoLines(pageItems);

        // ── Column geometry ──────────────────────────────────────────────────
        // Use left-most x of first line and right-most x+width across all lines
        // to bound the column the replacement text must stay within.
        const firstLine = lines[0];
        const colStartX = Math.min(...firstLine.map(i => i.x));
        const colEndX = Math.max(...lines.flatMap(l => l.map(i => i.x + i.width)));
        const colWidth = Math.max(50, colEndX - colStartX);

        // Median font size (robust against single-char outliers)
        const sizes = [...affected.map(i => i.fontSize)].sort((a, b) => a - b);
        const nominalFs = sizes[Math.floor(sizes.length / 2)];

        // ── Font size that fits replacement within same line count ───────────
        const rewriteText = patch.rewrite.replace(/\s+/g, ' ').trim();
        const renderFs = fittingFontSize(rewriteText, colWidth, lines.length, nominalFs, helvetica);
        const wrappedLines = wordWrap(rewriteText, colWidth, renderFs, helvetica);

        // ── Whitepaint pass 1: per-line rects ────────────────────────────────
        for (const line of lines) {
          const minX = Math.min(...line.map(i => i.x)) - H_PAD;
          const maxX = Math.max(...line.map(i => i.x + i.width)) + H_PAD;
          const fs = Math.max(...line.map(i => i.fontSize));
          const baseY = line[0].y;

          page.drawRectangle({
            x: minX,
            y: baseY - fs * DESCENT - V_PAD,
            width: Math.max(1, maxX - minX),
            height: fs * (ASCENT + DESCENT) + V_PAD * 2,
            color: rgb(1, 1, 1),
            borderWidth: 0,
          });
        }

        // ── Whitepaint pass 2: full-span rect to catch bleed-through glyphs ─
        const topLine = lines[0];
        const bottomLine = lines[lines.length - 1];
        const topFs = Math.max(...topLine.map(i => i.fontSize));
        const botFs = Math.max(...bottomLine.map(i => i.fontSize));
        const spanTop = topLine[0].y + topFs * ASCENT + V_PAD;
        const spanBottom = bottomLine[0].y - botFs * DESCENT - V_PAD;

        page.drawRectangle({
          x: colStartX - H_PAD,
          y: spanBottom,
          width: colWidth + H_PAD * 2,
          height: Math.max(1, spanTop - spanBottom),
          color: rgb(1, 1, 1),
          borderWidth: 0,
        });

        // ── Draw replacement text, one wrapped line at a time ────────────────
        const lineHeightPt = renderFs * 1.25;

        for (let li = 0; li < wrappedLines.length; li++) {
          const lineText = wrappedLines[li];
          if (!lineText) continue;

          // Align to the matched line's baseline when available;
          // extrapolate downward for overflow lines (should only happen at MIN_FONT)
          const baselineY = lines[li]
            ? lines[li][0].y
            : firstLine[0].y - (li - lines.length + 1) * lineHeightPt;

          page.drawText(lineText, {
            x: colStartX,
            y: baselineY,
            size: renderFs,
            font: helvetica,
            color: rgb(0, 0, 0),
          });
        }
      }
    } catch {
      // One broken patch must never corrupt the rest of the document
      continue;
    }
  }

  return Buffer.from(await pdfDoc.save());
}
