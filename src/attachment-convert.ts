/**
 * Attachment format detection and text extraction for channel uploads.
 *
 * markitdown covers pdf/docx/xlsx/pptx. It does NOT handle OpenDocument, and
 * nothing handles Apple iWork. Before this module those files matched no branch
 * in the Slack attachment path and were dropped with no note at all, so the
 * agent saw a message with no submission and asked the student to attach one
 * they had already attached (grader, Vannessa Valle, 2026-07-28T01:52Z).
 *
 * Two formats, two very different stories:
 *   - ODF (.odt/.ods/.odp) is a zip with a `content.xml` of plain markup. Text
 *     extraction is exact and dependency-free.
 *   - iWork (.pages/.numbers) is a zip whose text lives in `Index/*.iwa` —
 *     Snappy-compressed protobuf. Only files saved with an embedded preview
 *     carry a readable `QuickLook/Preview.pdf`; modern ones ship `preview.jpg`,
 *     a thumbnail of page one, which is useless for grading. So we extract the
 *     preview PDF when present and otherwise say plainly that the file must be
 *     re-exported.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

const UNZIP_BIN = process.env.NANOCLAW_UNZIP_BIN || 'unzip';
const UNZIP_TIMEOUT_MS = 30_000;
/** Extracted XML/PDF ceiling — a content.xml is markup-heavy (1 MB for a
 *  two-page agreement), so this sits well above the readable-text size. */
const UNZIP_MAX_OUTPUT = 64 * 1024 * 1024;
const ZIP_MAX_ENTRIES = 2_000;
const ZIP_MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
const ZIP_LIST_MAX_OUTPUT = 2 * 1024 * 1024;
const MARKITDOWN_BIN =
  process.env.NANOCLAW_MARKITDOWN_BIN ||
  join(homedir(), '.nanoclaw-venvs', 'markitdown', 'bin', 'markitdown');
const MARKITDOWN_TIMEOUT_MS = 90_000;
const MARKITDOWN_MAX_OUTPUT = 20 * 1024 * 1024;
const TESSERACT_BIN = process.env.NANOCLAW_TESSERACT_BIN || 'tesseract';
const PDFTOPPM_BIN = process.env.NANOCLAW_PDFTOPPM_BIN || 'pdftoppm';
const PDFTOTEXT_BIN = process.env.NANOCLAW_PDFTOTEXT_BIN || 'pdftotext';
const OCR_TIMEOUT_MS = 120_000;
const OCR_MAX_OUTPUT = 5 * 1024 * 1024;
const OCR_MAX_PDF_PAGES = 10;
const MAX_EXTRACTED_TEXT_CHARS = 200_000;

export type AttachmentKind =
  | 'text'
  | 'doc'
  | 'odf'
  | 'iwork'
  | 'image'
  | 'unsupported';

const TEXT_EXT = new Set(['csv', 'text', 'plain', 'tsv', 'txt']);
const DOC_EXT = new Set(['pdf', 'docx', 'xlsx', 'pptx', 'doc', 'xls', 'ppt']);
const ODF_EXT = new Set(['odt', 'ods', 'odp']);
/** `.key` is deliberately absent: it collides with PEM/SSH private keys far
 *  more often than it means Keynote. Keynote still routes here by mimetype. */
const IWORK_EXT = new Set(['pages', 'numbers']);
const IMAGE_EXT = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'heic',
  'bmp',
  'tiff',
]);

const DOC_MIME_RE =
  /pdf|officedocument|ms-excel|msword|ms-powerpoint|powerpoint/;
const ODF_MIME_RE = /opendocument/;
const IWORK_MIME_RE = /iwork|apple\.(pages|numbers|keynote)/;

/**
 * Route an attachment to a handler. Extension wins over mimetype because Slack
 * reports `application/octet-stream` for plenty of real uploads.
 */
export function classifyAttachment(
  ext: string,
  mimetype?: string,
): AttachmentKind {
  const e = (ext || '').toLowerCase();
  const m = (mimetype || '').toLowerCase();
  if (TEXT_EXT.has(e) || m.startsWith('text/') || m === 'application/csv') {
    return 'text';
  }
  if (ODF_EXT.has(e) || ODF_MIME_RE.test(m)) return 'odf';
  if (IWORK_EXT.has(e) || IWORK_MIME_RE.test(m)) return 'iwork';
  if (DOC_EXT.has(e) || DOC_MIME_RE.test(m)) return 'doc';
  // Images get their own kind purely so the note can give usable advice —
  // telling someone to re-export a screenshot as .docx helps nobody.
  if (IMAGE_EXT.has(e) || m.startsWith('image/')) return 'image';
  return 'unsupported';
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#')) {
      const code = body.startsWith('#x')
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/**
 * Flatten an ODF `content.xml` to readable text. Block-level elements become
 * line breaks before tags are stripped, so paragraphs and table cells do not
 * run together into one wall of text.
 */
export function odfXmlToText(xml: string): string {
  const body = xml.replace(/^[\s\S]*?<office:body[^>]*>/, '');
  return decodeEntities(
    body
      // Drop markup that carries no reader-visible text.
      .replace(/<office:(annotation|binary-data)[\s\S]*?<\/office:\1>/g, '')
      .replace(/<text:tab\s*\/>/g, '\t')
      .replace(/<text:s\s*\/>/g, ' ')
      .replace(/<text:line-break\s*\/>/g, '\n')
      // Cell and paragraph boundaries must survive tag stripping.
      .replace(/<\/table:table-cell>/g, '\t')
      .replace(/<\/table:table-row>/g, '\n')
      .replace(/<\/(text:p|text:h|text:list-item)>/g, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Read one entry out of a zip buffer. Returns null when absent or unreadable. */
async function readZipEntry(
  buf: Buffer,
  entry: string,
  id: string,
): Promise<Buffer | null> {
  let dir: string | undefined;
  try {
    dir = await mkdtemp(join(tmpdir(), 'nanoclaw-zip-'));
    const fp = join(dir, `${id}.zip`);
    await writeFile(fp, buf);
    const { stdout } = await execFileP(UNZIP_BIN, ['-p', fp, entry], {
      timeout: UNZIP_TIMEOUT_MS,
      maxBuffer: UNZIP_MAX_OUTPUT,
      encoding: 'buffer',
    });
    return stdout.length ? Buffer.from(stdout) : null;
  } catch {
    // Absent entry, not a zip, or a truncated upload — all mean "no text here".
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Readable text from an ODF document, or null when it holds none. */
export async function extractOdfText(
  buf: Buffer,
  id: string,
): Promise<string | null> {
  const content = await readZipEntry(buf, 'content.xml', id);
  if (!content) return null;
  const xml = content
    .toString('utf-8')
    .replace(/^\uFEFF/, '')
    .trimStart();
  if (!/^(?:<\?xml[\s\S]*?\?>\s*)?<office:document-content(?:\s|>)/.test(xml)) {
    return null;
  }
  const text = odfXmlToText(xml);
  return text.length ? text : null;
}

/**
 * The embedded preview PDF from an iWork document, or null when the file was
 * saved without one — which is the common case for current Pages/Numbers.
 */
export async function extractIWorkPdf(
  buf: Buffer,
  id: string,
): Promise<Buffer | null> {
  for (const entry of ['QuickLook/Preview.pdf', 'Preview.pdf']) {
    const pdf = await readZipEntry(buf, entry, id);
    if (pdf?.subarray(0, 4).toString('latin1') === '%PDF') return pdf;
  }
  return null;
}

export interface ZipPackageValidation {
  ok: boolean;
  entryCount: number;
  uncompressedBytes: number;
  errorCode?: string;
}

/**
 * Inspect Office/ODF/iWork zip structure before a parser sees it. Generic
 * archives never reach this function; accepted document packages still need
 * expansion and traversal ceilings.
 */
export async function validateZipPackage(
  buf: Buffer,
  id: string,
): Promise<ZipPackageValidation> {
  let dir: string | undefined;
  try {
    dir = await mkdtemp(join(tmpdir(), 'nanoclaw-zip-list-'));
    const fp = join(dir, `${id}.zip`);
    await writeFile(fp, buf);
    const { stdout } = await execFileP(UNZIP_BIN, ['-l', fp], {
      timeout: UNZIP_TIMEOUT_MS,
      maxBuffer: ZIP_LIST_MAX_OUTPUT,
    });
    let entryCount = 0;
    let uncompressedBytes = 0;
    for (const line of stdout.split(/\r?\n/)) {
      const match =
        /^\s*(\d+)\s+\d{2,4}-\d{2}-\d{2,4}\s+\d{2}:\d{2}\s+(.+)$/.exec(line);
      if (!match) continue;
      const name = match[2].trim().replace(/\\/g, '/');
      const segments = name.split('/');
      if (name.startsWith('/') || segments.includes('..')) {
        return {
          ok: false,
          entryCount,
          uncompressedBytes,
          errorCode: 'zip_path_traversal',
        };
      }
      entryCount += 1;
      uncompressedBytes += Number(match[1]);
      if (entryCount > ZIP_MAX_ENTRIES) {
        return {
          ok: false,
          entryCount,
          uncompressedBytes,
          errorCode: 'zip_entry_limit',
        };
      }
      if (uncompressedBytes > ZIP_MAX_UNCOMPRESSED_BYTES) {
        return {
          ok: false,
          entryCount,
          uncompressedBytes,
          errorCode: 'zip_expansion_limit',
        };
      }
    }
    return entryCount > 0
      ? { ok: true, entryCount, uncompressedBytes }
      : {
          ok: false,
          entryCount: 0,
          uncompressedBytes: 0,
          errorCode: 'zip_empty_or_invalid',
        };
  } catch {
    return {
      ok: false,
      entryCount: 0,
      uncompressedBytes: 0,
      errorCode: 'zip_inspection_failed',
    };
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Convert a PDF or Office document buffer to markdown through the same bounded
 * host dependency used by Slack. The caller supplies a hash-like id; filenames
 * from untrusted messages never become paths.
 */
export async function convertViaMarkitdown(
  buf: Buffer,
  ext: string,
  id: string,
): Promise<string | null> {
  let dir: string | undefined;
  try {
    dir = await mkdtemp(join(tmpdir(), 'nanoclaw-att-'));
    const fp = join(dir, `${id}.${ext || 'bin'}`);
    await writeFile(fp, buf);
    const { stdout } = await execFileP(MARKITDOWN_BIN, [fp], {
      timeout: MARKITDOWN_TIMEOUT_MS,
      maxBuffer: MARKITDOWN_MAX_OUTPUT,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export interface AttachmentExtractionResult {
  state: 'ready' | 'needs_review' | 'unsupported' | 'extraction_failed';
  method: string;
  text?: string;
  errorCode?: string;
}

function boundedExtractedText(text: string): string {
  const normalized = text.replace(/\0/g, '').trim();
  return normalized.length > MAX_EXTRACTED_TEXT_CHARS
    ? `${normalized.slice(0, MAX_EXTRACTED_TEXT_CHARS)}\n[extraction truncated]`
    : normalized;
}

async function ocrImage(
  buf: Buffer,
  ext: string,
  id: string,
): Promise<string | null> {
  let dir: string | undefined;
  try {
    dir = await mkdtemp(join(tmpdir(), 'nanoclaw-ocr-'));
    const fp = join(dir, `${id}.${ext || 'img'}`);
    await writeFile(fp, buf);
    const { stdout } = await execFileP(TESSERACT_BIN, [fp, 'stdout'], {
      timeout: OCR_TIMEOUT_MS,
      maxBuffer: OCR_MAX_OUTPUT,
    });
    return boundedExtractedText(stdout) || null;
  } catch {
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function ocrPdf(buf: Buffer, id: string): Promise<string | null> {
  let dir: string | undefined;
  try {
    dir = await mkdtemp(join(tmpdir(), 'nanoclaw-pdf-ocr-'));
    const pdfPath = join(dir, `${id}.pdf`);
    const pagePrefix = join(dir, 'page');
    await writeFile(pdfPath, buf);
    await execFileP(
      PDFTOPPM_BIN,
      [
        '-f',
        '1',
        '-l',
        String(OCR_MAX_PDF_PAGES),
        '-r',
        '200',
        '-png',
        pdfPath,
        pagePrefix,
      ],
      { timeout: OCR_TIMEOUT_MS, maxBuffer: OCR_MAX_OUTPUT },
    );
    const pages = (await readdir(dir))
      .filter((name) => /^page-\d+\.png$/.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const chunks: string[] = [];
    for (const page of pages) {
      const { stdout } = await execFileP(
        TESSERACT_BIN,
        [join(dir, page), 'stdout'],
        { timeout: OCR_TIMEOUT_MS, maxBuffer: OCR_MAX_OUTPUT },
      );
      if (stdout.trim()) chunks.push(stdout.trim());
    }
    return boundedExtractedText(chunks.join('\n\n')) || null;
  } catch {
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function extractPdfText(buf: Buffer, id: string): Promise<string | null> {
  let dir: string | undefined;
  try {
    dir = await mkdtemp(join(tmpdir(), 'nanoclaw-pdf-text-'));
    const pdfPath = join(dir, `${id}.pdf`);
    await writeFile(pdfPath, buf);
    const { stdout } = await execFileP(PDFTOTEXT_BIN, [pdfPath, '-'], {
      timeout: MARKITDOWN_TIMEOUT_MS,
      maxBuffer: MARKITDOWN_MAX_OUTPUT,
    });
    return boundedExtractedText(stdout) || null;
  } catch {
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Extract bounded text from a verified attachment buffer. Unsupported or
 * unreadable content returns an explicit state; callers must never equate an
 * empty result with successful processing.
 */
export async function extractAttachmentText(
  buf: Buffer,
  filename: string,
  mimeType: string,
  id: string,
): Promise<AttachmentExtractionResult> {
  const ext = extname(filename).slice(1).toLowerCase();
  const kind = classifyAttachment(ext, mimeType);

  if (kind === 'text') {
    if (buf.includes(0)) {
      return {
        state: 'needs_review',
        method: 'utf8',
        errorCode: 'binary_text_content',
      };
    }
    const text = boundedExtractedText(buf.toString('utf-8'));
    return text
      ? { state: 'ready', method: 'utf8', text }
      : {
          state: 'needs_review',
          method: 'utf8',
          errorCode: 'empty_text',
        };
  }

  if (kind === 'odf') {
    const text = await extractOdfText(buf, id);
    return text
      ? {
          state: 'ready',
          method: 'odf-content-xml-v1',
          text: boundedExtractedText(text),
        }
      : {
          state: 'extraction_failed',
          method: 'odf-content-xml-v1',
          errorCode: 'odf_no_text',
        };
  }

  if (kind === 'iwork') {
    const preview = await extractIWorkPdf(buf, id);
    if (!preview) {
      return {
        state: 'needs_review',
        method: 'iwork-preview-v1',
        errorCode: 'iwork_no_pdf_preview',
      };
    }
    const text = await extractPdfText(preview, id);
    const ocr = text?.trim() ? null : await ocrPdf(preview, id);
    const extracted = boundedExtractedText(text || ocr || '');
    return extracted
      ? {
          state: 'ready',
          method: text ? 'iwork-preview-pdftotext-v1' : 'iwork-preview-ocr-v1',
          text: extracted,
        }
      : {
          state: 'needs_review',
          method: 'iwork-preview-v1',
          errorCode: 'iwork_preview_unreadable',
        };
  }

  if (kind === 'image') {
    const text = await ocrImage(buf, ext, id);
    return text
      ? { state: 'ready', method: 'tesseract-v1', text }
      : {
          state: 'needs_review',
          method: 'tesseract-v1',
          errorCode: 'image_ocr_no_text',
        };
  }

  if (kind === 'doc') {
    if (ext === 'pdf' || mimeType.toLowerCase() === 'application/pdf') {
      const direct = await extractPdfText(buf, id);
      if (direct) {
        return { state: 'ready', method: 'pdftotext-v1', text: direct };
      }
      const text = await ocrPdf(buf, id);
      return text
        ? { state: 'ready', method: 'pdf-tesseract-v1', text }
        : {
            state: 'needs_review',
            method: 'pdf-tesseract-v1',
            errorCode: 'pdf_ocr_no_text',
          };
    }
    const converted = await convertViaMarkitdown(buf, ext || 'bin', id);
    if (converted?.trim()) {
      return {
        state: 'ready',
        method: 'markitdown-v1',
        text: boundedExtractedText(converted),
      };
    }
    return {
      state: 'extraction_failed',
      method: 'markitdown-v1',
      errorCode: 'document_conversion_failed',
    };
  }

  return {
    state: 'unsupported',
    method: 'none',
    errorCode: 'unsupported_format',
  };
}
