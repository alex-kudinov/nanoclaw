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
  return text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
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

  const flushList = () => {
    if (listBuffer.length > 0) {
      result.push(`<ul>${listBuffer.map((item) => `<li>${item}</li>`).join('')}</ul>`);
      listBuffer = [];
    }
  };

  for (const line of lines) {
    if (/^[-•] /.test(line)) {
      listBuffer.push(line.replace(/^[-•] /, ''));
    } else {
      flushList();
      result.push(line);
    }
  }
  flushList();
  return result;
}

function processParagraph(block: string): string {
  const lines = block.split('\n');
  const processed = groupListItems(lines);
  return processed
    .map((chunk) =>
      chunk.startsWith('<ul>') ? chunk : chunk.replace(/\n/g, '<br>'),
    )
    .join('<br>');
}

export function convertMarkdownToEmailHtml(markdown: string): string {
  if (!markdown || typeof markdown !== 'string') return '';
  if (Buffer.byteLength(markdown, 'utf8') > MAX_INPUT_BYTES) {
    logger.warn('convertMarkdownToEmailHtml: input exceeds 100KB limit, returning empty string');
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
