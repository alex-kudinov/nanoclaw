/**
 * Email body/header parsing for Gmail API messages.
 */

import { gmail_v1 } from 'googleapis';

const MAX_BODY_LENGTH = 10_000;

/** Walk MIME tree, prefer text/plain, fall back to stripped HTML. */
export function parseEmailBody(payload: gmail_v1.Schema$MessagePart): string {
  const parts = flattenParts(payload);

  // Prefer text/plain
  const plain = parts.find((p) => p.mimeType === 'text/plain');
  if (plain?.body?.data) {
    return cleanBody(decodeBase64Url(plain.body.data));
  }

  // Fall back to HTML → stripped
  const html = parts.find((p) => p.mimeType === 'text/html');
  if (html?.body?.data) {
    const raw = decodeBase64Url(html.body.data);
    return cleanBody(stripHtml(raw));
  }

  return '';
}

function flattenParts(
  part: gmail_v1.Schema$MessagePart,
): gmail_v1.Schema$MessagePart[] {
  const result: gmail_v1.Schema$MessagePart[] = [part];
  if (part.parts) {
    for (const child of part.parts) {
      result.push(...flattenParts(child));
    }
  }
  return result;
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

function stripHtml(html: string): string {
  return (
    html
      // Remove style/script blocks (content + tags)
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      // Remove HTML comments (including Outlook conditionals)
      .replace(/<!--[\s\S]*?-->/g, '')
      // Structural → whitespace
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/tr>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      // Strip remaining tags
      .replace(/<[^>]+>/g, '')
      // Decode entities
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&rsquo;/g, '\u2019')
      .replace(/&lsquo;/g, '\u2018')
      .replace(/&rdquo;/g, '\u201C')
      .replace(/&ldquo;/g, '\u201D')
      .replace(/&mdash;/g, '\u2014')
      .replace(/&ndash;/g, '\u2013')
      .replace(/&#\d{1,5};/g, (m) =>
        String.fromCharCode(parseInt(m.slice(2, -1))),
      )
      // Collapse excessive whitespace left by removed blocks
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
  );
}

/** Strip quoted replies and truncate. */
function cleanBody(text: string): string {
  const lines = text.split('\n');
  const cleaned: string[] = [];
  for (const line of lines) {
    // Stop at "On ... wrote:" quote markers
    if (/^On .+ wrote:$/.test(line.trim())) break;
    // Stop at "---------- Forwarded message" markers
    if (/^-{5,}\s*Forwarded message/.test(line.trim())) break;
    // Skip lines starting with >
    if (line.trimStart().startsWith('>')) continue;
    cleaned.push(line);
  }
  const result = cleaned.join('\n').trim();
  return result.length > MAX_BODY_LENGTH
    ? result.slice(0, MAX_BODY_LENGTH) + '\n[truncated]'
    : result;
}

export interface ParsedHeaders {
  from: string;
  fromName: string;
  to: string;
  subject: string;
  date: string;
  messageId: string;
  inReplyTo: string;
}

/** Extract standard headers from Gmail header array. */
export function parseEmailHeaders(
  headers: gmail_v1.Schema$MessagePartHeader[],
): ParsedHeaders {
  const get = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ||
    '';

  const from = get('From');
  // Extract display name: "John Smith <john@example.com>" → "John Smith"
  const nameMatch = from.match(/^"?([^"<]+)"?\s*</);
  const fromName = nameMatch ? nameMatch[1].trim() : from.split('@')[0];

  return {
    from,
    fromName,
    to: get('To'),
    subject: get('Subject'),
    date: get('Date'),
    messageId: get('Message-ID'),
    inReplyTo: get('In-Reply-To'),
  };
}

/** Format email content for delivery to agent. */
export function formatEmailForAgent(
  headers: ParsedHeaders,
  body: string,
  threadId?: string,
  messageId?: string,
): string {
  const headerLines = [
    `From: ${headers.fromName} <${headers.from}>`,
    `Subject: ${headers.subject}`,
    `Date: ${headers.date}`,
  ];
  if (threadId) headerLines.push(`Thread-ID: ${threadId}`);
  if (messageId) headerLines.push(`Message-ID: ${messageId}`);
  return headerLines.join('\n') + '\n\n' + body;
}
