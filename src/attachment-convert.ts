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
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

const UNZIP_BIN = process.env.NANOCLAW_UNZIP_BIN || 'unzip';
const UNZIP_TIMEOUT_MS = 30_000;
/** Extracted XML/PDF ceiling — a content.xml is markup-heavy (1 MB for a
 *  two-page agreement), so this sits well above the readable-text size. */
const UNZIP_MAX_OUTPUT = 64 * 1024 * 1024;

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
  const text = odfXmlToText(content.toString('utf-8'));
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
