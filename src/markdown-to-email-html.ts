import { logger } from './logger.js';

const MAX_INPUT_BYTES = 100 * 1024; // 100KB

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function convertMarkdownLinks(text: string): string {
  // By this point the text has already been HTML-escaped, so & in URLs is &amp;
  // No additional escaping needed — use the URL as-is from the escaped text.
  return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    return `<a href="${url}">${label}</a>`;
  });
}

function convertBold(text: string): string {
  // Agents draft in Slack markup, where *bold* (single asterisk) means bold —
  // and Gmail's own plain-text renderer treated it the same. Since plain-text
  // bodies now route through this HTML converter (commit 63e294d), a single
  // asterisk pair left untouched renders as a literal "*" in the email. Handle
  // both forms: **bold** first, then the remaining *bold* pairs. The content
  // class excludes newlines so emphasis never spans a line break.
  return text
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>');
}

function urlAnchorText(url: string): string {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    return segments.length > 0
      ? `${parsed.hostname}/${segments[0]}`
      : parsed.hostname;
  } catch {
    return url;
  }
}

function convertBareUrls(text: string): string {
  // By this point text is already HTML-escaped; & appears as &amp; in URLs.
  // Un-escape to get the real URL for anchor text calculation, but keep the
  // escaped form for the href since the surrounding text is already escaped.
  return text.replace(/(?<!href=")https:\/\/[^\s<>"]+/g, (escapedUrl) => {
    const rawUrl = escapedUrl.replace(/&amp;/g, '&');
    const anchor = urlAnchorText(rawUrl);
    return `<a href="${escapedUrl}">${anchor}</a>`;
  });
}

function sanitizeText(text: string): string {
  return text
    .replace(/\u2014/g, '-')
    .replace(/\u2013/g, '-')
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
}

function groupListItems(lines: string[]): string[] {
  const result: string[] = [];
  let listBuffer: string[] = [];
  let listType: 'ul' | 'ol' | null = null;

  const flushList = () => {
    if (listBuffer.length > 0 && listType) {
      const tag = listType;
      result.push(
        `<${tag}>${listBuffer.map((item) => `<li>${item}</li>`).join('')}</${tag}>`,
      );
      listBuffer = [];
      listType = null;
    }
  };

  for (const line of lines) {
    if (/^[-•] /.test(line)) {
      if (listType !== 'ul') flushList();
      listType = 'ul';
      listBuffer.push(line.replace(/^[-•] /, ''));
    } else if (/^\d+\.\s+/.test(line)) {
      if (listType !== 'ol') flushList();
      listType = 'ol';
      listBuffer.push(line.replace(/^\d+\.\s+/, ''));
    } else {
      flushList();
      result.push(line);
    }
  }
  flushList();
  return result;
}

// Lines this short are almost always intentional hard breaks (signature blocks,
// addresses, contact lines) — not wrapped prose. Above this threshold, treat
// adjacent lines as soft-wrapped prose and fold with spaces.
const SIG_LINE_LENGTH_THRESHOLD = 40;

function processParagraph(block: string): string {
  const lines = block.split('\n');
  const processed = groupListItems(lines);
  // Heuristic: if every text line in the paragraph is short (≤40 chars), this
  // is a signature/address block where each newline IS intentional — keep as
  // <br>. Otherwise, single newlines are soft wraps from word-wrapping; fold
  // into a single space (CommonMark behavior). Use \n\n for new paragraphs.
  const textLines = processed.filter(
    (c) => !c.startsWith('<ul>') && !c.startsWith('<ol>'),
  );
  const isSigBlock =
    textLines.length > 0 &&
    textLines.every((l) => l.length <= SIG_LINE_LENGTH_THRESHOLD);
  const joiner = isSigBlock ? '<br>' : ' ';

  const parts: string[] = [];
  let textBuffer: string[] = [];
  const flushText = () => {
    if (textBuffer.length > 0) {
      parts.push(textBuffer.join(joiner));
      textBuffer = [];
    }
  };
  for (const chunk of processed) {
    if (chunk.startsWith('<ul>') || chunk.startsWith('<ol>')) {
      flushText();
      parts.push(chunk);
    } else {
      textBuffer.push(chunk);
    }
  }
  flushText();
  return parts.join('');
}

export function convertMarkdownToEmailHtml(markdown: string): string {
  if (!markdown || typeof markdown !== 'string') return '';
  if (Buffer.byteLength(markdown, 'utf8') > MAX_INPUT_BYTES) {
    logger.warn(
      'convertMarkdownToEmailHtml: input exceeds 100KB limit, returning empty string',
    );
    return '';
  }

  let text = sanitizeText(markdown);
  text = escapeHtml(text);
  text = convertMarkdownLinks(text);
  text = convertBold(text);
  text = convertBareUrls(text);

  const paragraphs = text.split(/\n\n+/);
  return paragraphs
    .map((block) => `<p>${processParagraph(block)}</p>`)
    .join('');
}
