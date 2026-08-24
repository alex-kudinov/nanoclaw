import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  classifyAttachment,
  extractAttachmentText,
  extractIWorkPdf,
  extractOdfText,
  odfXmlToText,
  validateZipPackage,
} from './attachment-convert.js';

const execFileP = promisify(execFile);

describe('classifyAttachment', () => {
  it.each([
    ['txt', 'text/plain', 'text'],
    ['csv', 'application/csv', 'text'],
    ['pdf', 'application/pdf', 'doc'],
    ['docx', '', 'doc'],
    ['odt', 'application/vnd.oasis.opendocument.text', 'odf'],
    ['ods', '', 'odf'],
    ['odp', '', 'odf'],
    ['pages', 'application/octet-stream', 'iwork'],
    ['numbers', '', 'iwork'],
    ['png', 'image/png', 'image'],
    ['heic', '', 'image'],
    ['zip', 'application/zip', 'unsupported'],
    ['', 'application/octet-stream', 'unsupported'],
  ])('routes .%s (%s) to %s', (ext, mime, expected) => {
    expect(classifyAttachment(ext, mime)).toBe(expected);
  });

  it('routes iWork by mimetype when Slack reports a generic extension', () => {
    expect(
      classifyAttachment('bin', 'application/x-iwork-pages-sffpages'),
    ).toBe('iwork');
  });

  it('does NOT treat a .key private key as Keynote', () => {
    // `.key` collides with PEM/SSH keys far more often than it means Keynote,
    // so the extension alone must never route to the iWork unzip path.
    expect(classifyAttachment('key', 'text/plain')).toBe('text');
    expect(classifyAttachment('key', 'application/octet-stream')).toBe(
      'unsupported',
    );
  });

  it('is case-insensitive on extension', () => {
    expect(classifyAttachment('ODT', '')).toBe('odf');
  });
});

describe('extractAttachmentText', () => {
  it('returns bounded UTF-8 text as ready evidence', async () => {
    await expect(
      extractAttachmentText(
        Buffer.from('Invoice total: $500'),
        'invoice.txt',
        'text/plain',
        'txt-1',
      ),
    ).resolves.toEqual({
      state: 'ready',
      method: 'utf8',
      text: 'Invoice total: $500',
    });
  });

  it('holds binary content disguised as text', async () => {
    await expect(
      extractAttachmentText(
        Buffer.from([0x41, 0x00, 0x42]),
        'invoice.txt',
        'text/plain',
        'txt-2',
      ),
    ).resolves.toMatchObject({
      state: 'needs_review',
      errorCode: 'binary_text_content',
    });
  });

  it('returns an explicit unsupported state for archives', async () => {
    await expect(
      extractAttachmentText(
        Buffer.from([0x50, 0x4b, 0x03, 0x04]),
        'bundle.zip',
        'application/zip',
        'zip-1',
      ),
    ).resolves.toMatchObject({
      state: 'unsupported',
      errorCode: 'unsupported_format',
    });
  });
});

describe('odfXmlToText', () => {
  const wrap = (inner: string) =>
    `<?xml version="1.0"?><office:document-content><office:body><office:text>${inner}</office:text></office:body></office:document-content>`;

  it('breaks paragraphs onto separate lines', () => {
    const out = odfXmlToText(
      wrap('<text:p>First line.</text:p><text:p>Second line.</text:p>'),
    );
    expect(out).toBe('First line.\nSecond line.');
  });

  it('keeps headings and list items on their own lines', () => {
    const out = odfXmlToText(
      wrap(
        '<text:h>Title</text:h><text:list><text:list-item><text:p>Point</text:p></text:list-item></text:list>',
      ),
    );
    expect(out.split('\n').filter(Boolean)).toEqual(['Title', 'Point']);
  });

  it('separates table cells and rows so tables do not run together', () => {
    const out = odfXmlToText(
      wrap(
        '<table:table-row><table:table-cell><text:p>A</text:p></table:table-cell>' +
          '<table:table-cell><text:p>B</text:p></table:table-cell></table:table-row>',
      ),
    );
    expect(out).toContain('A');
    expect(out).toContain('B');
    expect(out.indexOf('A')).toBeLessThan(out.indexOf('B'));
  });

  it('decodes named and numeric entities', () => {
    expect(
      odfXmlToText(wrap('<text:p>a &amp; b &lt;c&gt; &#8212; d</text:p>')),
    ).toBe('a & b <c> — d');
  });

  it('drops annotations, which are not part of the submission', () => {
    const out = odfXmlToText(
      wrap(
        '<office:annotation><text:p>reviewer note</text:p></office:annotation><text:p>real text</text:p>',
      ),
    );
    expect(out).toBe('real text');
    expect(out).not.toContain('reviewer note');
  });

  it('expands tabs and explicit line breaks', () => {
    expect(
      odfXmlToText(wrap('<text:p>a<text:tab/>b<text:line-break/>c</text:p>')),
    ).toBe('a\tb\nc');
  });

  it('collapses runs of blank lines', () => {
    const out = odfXmlToText(
      wrap(
        '<text:p>a</text:p><text:p></text:p><text:p></text:p><text:p>b</text:p>',
      ),
    );
    expect(out).not.toMatch(/\n{3,}/);
  });

  it('returns empty string for a document with no body text', () => {
    expect(odfXmlToText(wrap(''))).toBe('');
  });
});

describe('zip-backed extraction', () => {
  let dir: string;

  async function makeZip(
    name: string,
    entries: Record<string, string | Buffer>,
  ): Promise<Buffer> {
    const src = join(dir, name);
    await execFileP('mkdir', ['-p', src]);
    for (const [entry, body] of Object.entries(entries)) {
      const target = join(src, entry);
      await execFileP('mkdir', ['-p', join(target, '..')]);
      await writeFile(target, body);
    }
    await execFileP('zip', ['-q', '-r', `${src}.zip`, '.'], { cwd: src });
    const { stdout } = await execFileP('cat', [`${src}.zip`], {
      encoding: 'buffer',
      maxBuffer: 32 * 1024 * 1024,
    });
    return Buffer.from(stdout);
  }

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'nanoclaw-att-test-'));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('extracts text from an ODF package', async () => {
    const zip = await makeZip('doc', {
      'content.xml':
        '<office:document-content><office:body><office:text><text:p>Engagement agreement.</text:p></office:text></office:body></office:document-content>',
    });
    await expect(extractOdfText(zip, 'odf1')).resolves.toBe(
      'Engagement agreement.',
    );
  });

  it('accepts a bounded document package before extraction', async () => {
    const zip = await makeZip('bounded', {
      'word/document.xml': '<p>Invoice</p>',
    });
    await expect(validateZipPackage(zip, 'zip-ok')).resolves.toMatchObject({
      ok: true,
      entryCount: 2,
    });
  });

  it('rejects invalid zip bytes before a document parser sees them', async () => {
    await expect(
      validateZipPackage(Buffer.from('not a zip'), 'zip-bad'),
    ).resolves.toMatchObject({
      ok: false,
      errorCode: 'zip_inspection_failed',
    });
  });

  it('returns null when the ODF package has no content.xml', async () => {
    const zip = await makeZip('empty', { 'styles.xml': '<x/>' });
    await expect(extractOdfText(zip, 'odf2')).resolves.toBeNull();
  });

  it('holds an ODF package whose content.xml is not ODF markup', async () => {
    const zip = await makeZip('encrypted-odf', {
      'content.xml': Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x00, 0x01]),
    });
    await expect(extractOdfText(zip, 'odf-invalid')).resolves.toBeNull();
    await expect(
      extractAttachmentText(
        zip,
        'encrypted.odt',
        'application/vnd.oasis.opendocument.text',
        'odf-invalid',
      ),
    ).resolves.toMatchObject({
      state: 'extraction_failed',
      errorCode: 'odf_no_text',
    });
  });

  it('returns null rather than throwing on a non-zip buffer', async () => {
    await expect(
      extractOdfText(Buffer.from('this is not a zip'), 'odf3'),
    ).resolves.toBeNull();
  });

  it('extracts an embedded iWork preview PDF', async () => {
    const zip = await makeZip('pages-old', {
      'QuickLook/Preview.pdf': Buffer.from('%PDF-1.4\nbody\n%%EOF'),
      'index.xml': '<x/>',
    });
    const pdf = await extractIWorkPdf(zip, 'iw1');
    expect(pdf?.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('returns null for a modern iWork file that only ships a jpg preview', async () => {
    // This is the common case — text lives in Snappy protobuf we do not parse.
    const zip = await makeZip('pages-new', {
      'Index/Document.iwa': Buffer.from([0x00, 0x01, 0x02]),
      'preview.jpg': Buffer.from([0xff, 0xd8, 0xff]),
    });
    await expect(extractIWorkPdf(zip, 'iw2')).resolves.toBeNull();
  });

  it('rejects a preview entry that is not actually a PDF', async () => {
    const zip = await makeZip('pages-fake', {
      'QuickLook/Preview.pdf': Buffer.from('<html>not a pdf</html>'),
    });
    await expect(extractIWorkPdf(zip, 'iw3')).resolves.toBeNull();
  });
});
