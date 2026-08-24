/**
 * Email body/header parsing for Gmail API messages.
 */

import { gmail_v1 } from 'googleapis';

const MAX_BODY_LENGTH = 10_000;
const MAX_ATTACHMENT_MANIFEST_ITEMS = 20;
const MAX_ATTACHMENT_FIELD_LENGTH = 180;
const MAX_HEADER_LENGTH = 1_000;
const MAX_REPLY_ALL_CANDIDATES = 10;
const EMAIL_ADDRESS_PATTERN =
  /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/gi;
const OWN_DOMAIN_SUFFIXES = [
  'tandemcoach.co',
  'tandemcoaching.academy',
  'tandem.co',
];

export interface EmailAttachmentMeta {
  filename: string;
  mimeType: string;
  sizeBytes: number | null;
  disposition: 'attachment' | 'inline' | 'unknown';
}

export interface EmailAttachmentManifest {
  total: number;
  items: EmailAttachmentMeta[];
  truncated: boolean;
}

export interface ForwardedIdentity {
  email: string;
  name: string;
}

export interface ReplyAllCandidateOptions {
  /** Reply target selected from Reply-To/From; never duplicate it in CC. */
  primaryRecipient?: string;
  /** Host-configured send-as, reply-to, monitored, and BCC mailboxes. */
  excludeAddresses?: Iterable<string>;
  maxCandidates?: number;
}

/**
 * Extract a bounded, normalized address list from a Gmail address header.
 * This deliberately returns bare addresses only: approval cards reject display
 * names and the host must never ask a model to reproduce RFC address syntax.
 */
export function extractHeaderAddresses(value: string): string[] {
  const matches = value.match(EMAIL_ADDRESS_PATTERN) ?? [];
  const seen = new Set<string>();
  const addresses: string[] = [];
  for (const match of matches) {
    const normalized = match.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    addresses.push(normalized);
  }
  return addresses;
}

/**
 * Produce only the visible addresses that a conventional reply-all could copy.
 * BCC cannot appear here because Gmail does not expose it on received mail.
 */
export function deriveReplyAllCandidates(
  headers: Pick<ParsedHeaders, 'from' | 'replyTo' | 'to' | 'cc'>,
  opts: ReplyAllCandidateOptions = {},
): string[] {
  const excluded = new Set<string>();
  for (const value of opts.excludeAddresses ?? []) {
    for (const email of extractHeaderAddresses(value)) excluded.add(email);
  }
  const primary =
    extractHeaderAddresses(
      opts.primaryRecipient || headers.replyTo || headers.from,
    )[0] ?? '';
  if (primary) excluded.add(primary);

  const maxCandidates = Math.max(
    0,
    Math.min(opts.maxCandidates ?? MAX_REPLY_ALL_CANDIDATES, 50),
  );
  if (maxCandidates === 0) return [];

  const result: string[] = [];
  for (const email of [
    ...extractHeaderAddresses(headers.to),
    ...extractHeaderAddresses(headers.cc),
  ]) {
    if (excluded.has(email) || result.includes(email)) continue;
    result.push(email);
    if (result.length >= maxCandidates) {
      break;
    }
  }
  return result;
}

function bareAddress(value: string): string | null {
  const angle = value.match(/<([^>]+)>/);
  const candidate = (angle?.[1] || value).trim().toLowerCase();
  const match = candidate.match(
    /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/i,
  );
  return match?.[0].toLowerCase() || null;
}

function isOwnAddress(email: string): boolean {
  const domain = email.slice(email.lastIndexOf('@') + 1);
  return OWN_DOMAIN_SUFFIXES.some(
    (own) => domain === own || domain.endsWith(`.${own}`),
  );
}

function addressName(value: string, email: string): string {
  const angle = value.match(/^\s*"?([^"<]+?)"?\s*</);
  return angle?.[1].trim() || email.split('@')[0];
}

function dequoteForwardLine(line: string): string {
  return line.replace(/^\s*(?:>\s*)+/, '').trim();
}

function isExplicitForwardMarker(line: string): boolean {
  const dequoted = dequoteForwardLine(line);
  return (
    /^-{5,}\s*Forwarded message/i.test(dequoted) ||
    /^Begin forwarded message\s*:/i.test(dequoted) ||
    /^-{5,}\s*Original Message\s*-{5,}$/i.test(dequoted)
  );
}

function authenticatedOwnFrom(
  from: string,
  rawHeaders: gmail_v1.Schema$MessagePartHeader[],
): boolean {
  const email = bareAddress(from);
  if (!email || !isOwnAddress(email)) return false;
  const fromDomain = email.slice(email.lastIndexOf('@') + 1);

  // Gmail prepends its own Authentication-Results field. Use only the first
  // such field and require Google's authserv-id so a sender-supplied field
  // farther down the message cannot manufacture this trust decision.
  const authenticationResults = rawHeaders.find(
    (header) => header.name?.toLowerCase() === 'authentication-results',
  )?.value;
  if (!authenticationResults) return false;
  const normalized = authenticationResults.replace(/[\r\n]+/g, ' ').trim();
  if (!/^mx\.google\.com\s*;/i.test(normalized)) return false;

  const dmarcFrom = normalized.match(
    /\bdmarc\s*=\s*pass\b[^;]*\bheader\.from\s*=\s*([^\s;]+)/i,
  )?.[1];
  if (dmarcFrom?.toLowerCase().replace(/^@/, '') === fromDomain) return true;

  const dkimIdentity = normalized.match(
    /\bdkim\s*=\s*pass\b[^;]*\bheader\.i\s*=\s*([^\s;]+)/i,
  )?.[1];
  const dkimDomain = dkimIdentity
    ?.toLowerCase()
    .replace(/^.*@/, '')
    .replace(/^@/, '');
  return dkimDomain === fromDomain && isOwnAddress(`sender@${dkimDomain}`);
}

function forwardedHeaderBlocks(lines: string[]): string[][] {
  const blocks: string[][] = [];
  for (let markerIndex = 0; markerIndex < lines.length; markerIndex += 1) {
    if (!isExplicitForwardMarker(lines[markerIndex])) continue;
    const block: string[] = [];
    let started = false;
    for (const sourceLine of lines.slice(markerIndex + 1)) {
      if (isExplicitForwardMarker(sourceLine)) break;
      const line = dequoteForwardLine(sourceLine);
      if (!line) {
        if (started) break;
        continue;
      }
      if (!/^(?:From|Reply-To|Date|Sent|To|Cc|Subject)\s*:/i.test(line)) {
        if (started) break;
        continue;
      }
      started = true;
      block.push(line);
    }
    if (block.length > 0) blocks.push(block);
  }
  return blocks;
}

/**
 * Resolve the external author of an explicit forward from a Tandem-owned
 * mailbox. Body headers are untrusted for ordinary external mail; this helper
 * returns an identity only when Gmail reports aligned authentication for the
 * internal From domain, the subject is an explicit forward, and a recognized
 * forward marker exists.
 */
export function resolveForwardedIdentity(
  headers: ParsedHeaders,
  body: string,
  rawHeaders: gmail_v1.Schema$MessagePartHeader[] = [],
): ForwardedIdentity | null {
  if (!authenticatedOwnFrom(headers.from, rawHeaders)) return null;
  if (
    !/^\s*(?:\[[^\]\r\n]{1,80}\]\s*)*(?:fwd?)\s*:\s*/i.test(headers.subject)
  ) {
    return null;
  }

  for (const block of forwardedHeaderBlocks(body.split('\n'))) {
    const fromCandidates: ForwardedIdentity[] = [];
    const replyToCandidates: ForwardedIdentity[] = [];
    for (const line of block) {
      const match = line.match(/^(From|Reply-To)\s*:\s*(.+)$/i);
      if (!match) continue;
      const email = bareAddress(match[2]);
      if (!email || isOwnAddress(email)) continue;
      const identity = { email, name: addressName(match[2], email) };
      if (match[1].toLowerCase() === 'reply-to') {
        replyToCandidates.push(identity);
      } else {
        fromCandidates.push(identity);
      }
    }
    const identity = replyToCandidates[0] || fromCandidates[0];
    if (identity) return identity;
  }
  return null;
}

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

function boundedAttachmentField(value: string, fallback: string): string {
  const clean = (value || '')
    .replace(/[\r\n\t\0-\x1f\x7f]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const selected = clean || fallback;
  return selected.length > MAX_ATTACHMENT_FIELD_LENGTH
    ? `${selected.slice(0, MAX_ATTACHMENT_FIELD_LENGTH - 1)}…`
    : selected;
}

/** Return a bounded metadata-only manifest without exposing attachment IDs. */
export function parseEmailAttachments(
  payload: gmail_v1.Schema$MessagePart,
): EmailAttachmentManifest {
  const attachments = flattenParts(payload)
    .filter((part) => {
      if (part.parts?.length) return false;
      if (!part.filename && !part.body?.attachmentId) return false;
      if (
        !part.filename &&
        (part.mimeType === 'text/plain' || part.mimeType === 'text/html')
      ) {
        return false;
      }
      return true;
    })
    .map((part): EmailAttachmentMeta => {
      const dispositionHeader = (part.headers || []).find(
        (header) => header.name?.toLowerCase() === 'content-disposition',
      )?.value;
      const disposition = /^inline\b/i.test(dispositionHeader || '')
        ? 'inline'
        : /^attachment\b/i.test(dispositionHeader || '')
          ? 'attachment'
          : 'unknown';
      const size = part.body?.size;
      return {
        filename: boundedAttachmentField(
          part.filename || '',
          '(unnamed attachment)',
        ),
        mimeType: boundedAttachmentField(
          part.mimeType || '',
          'application/octet-stream',
        ),
        sizeBytes:
          typeof size === 'number' && Number.isFinite(size) && size >= 0
            ? size
            : null,
        disposition,
      };
    });

  return {
    total: attachments.length,
    items: attachments.slice(0, MAX_ATTACHMENT_MANIFEST_ITEMS),
    truncated: attachments.length > MAX_ATTACHMENT_MANIFEST_ITEMS,
  };
}

function formatAttachmentManifest(
  manifest: EmailAttachmentManifest | undefined,
  processed = false,
): string {
  if (!manifest || manifest.total === 0) return '';
  const lines = [`Attachments: ${manifest.total}`];
  for (const item of manifest.items) {
    const size =
      item.sizeBytes === null ? 'size unknown' : `${item.sizeBytes} bytes`;
    lines.push(
      `- ${item.filename} | ${item.mimeType} | ${size} | ${item.disposition}`,
    );
  }
  if (manifest.truncated) {
    lines.push(
      `- [${manifest.total - manifest.items.length} additional attachment(s) omitted from manifest]`,
    );
  }
  lines.push(
    processed
      ? '[Attachment content was processed by the host; use the receipts below as the result.]'
      : '[Attachment content is not included in this view. Use gmail_read with the exact Message-ID to process it; do not claim it was processed yet.]',
  );
  return lines.join('\n');
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

/** Strip quoted reply history while preserving intentionally forwarded mail. */
function cleanBody(text: string): string {
  const lines = text.split('\n');
  const cleaned: string[] = [];
  let inForwardedMessage = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    // Outside a deliberate forward, stop at ordinary reply history. Inside a
    // forward, that same marker may introduce the ORIGINAL customer's message
    // (for example when somebody forwards an already-replied-to thread). Keep
    // it and the quoted lines beneath it or the actual inquiry disappears. A
    // marker can itself be quoted below an On-wrote line, so look ahead before
    // deciding that the remaining history is disposable.
    if (!inForwardedMessage && /^On .+ wrote:$/.test(line.trim())) {
      const containsExplicitForward = lines
        .slice(index + 1)
        .some(isExplicitForwardMarker);
      if (!containsExplicitForward) break;
    }
    // A forwarded-message marker begins the content the sender intentionally
    // asked us to process. Preserve Gmail, Apple Mail, and Outlook forms and
    // the forwarded text beneath them.
    if (isExplicitForwardMarker(line)) {
      inForwardedMessage = true;
    }
    // Skip ordinary reply quotes, but retain quoted lines inside an explicit
    // forward so relayed inquiries cannot become an empty signature/snippet.
    if (!inForwardedMessage && line.trimStart().startsWith('>')) continue;
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
  replyTo: string;
  to: string;
  cc: string;
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
    replyTo: get('Reply-To'),
    to: get('To'),
    cc: get('Cc'),
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
  forwardedIdentity?: ForwardedIdentity | null,
  recipientContext: { replyAllCandidates?: readonly string[] } = {},
  attachments?: EmailAttachmentManifest,
  attachmentsProcessed = false,
): string {
  const oneLine = (value: string) =>
    value
      .replace(/[\r\n]+/g, ' ')
      .trim()
      .slice(0, MAX_HEADER_LENGTH);
  const envelopeEmail = bareAddress(headers.from) || headers.from;
  const ordinaryFrom = /<[^>]+>/.test(headers.from)
    ? oneLine(headers.from)
    : `${oneLine(headers.fromName)} <${oneLine(headers.from)}>`;
  const headerLines = [
    forwardedIdentity
      ? `From: ${oneLine(forwardedIdentity.name)} <${oneLine(forwardedIdentity.email)}>`
      : `From: ${ordinaryFrom}`,
    ...(forwardedIdentity
      ? [
          'Forwarded-Inquiry: yes',
          `Forwarded-By: ${oneLine(headers.fromName)} <${oneLine(envelopeEmail)}>`,
        ]
      : headers.replyTo
        ? [`Reply-To: ${oneLine(headers.replyTo)}`]
        : []),
    ...(!forwardedIdentity && headers.to
      ? [`Visible-To: ${oneLine(headers.to)}`]
      : []),
    ...(!forwardedIdentity && headers.cc
      ? [`Visible-Cc: ${oneLine(headers.cc)}`]
      : []),
    ...(!forwardedIdentity && recipientContext.replyAllCandidates?.length
      ? [
          `Reply-All-Candidates: ${recipientContext.replyAllCandidates.join(', ')}`,
        ]
      : []),
    `Subject: ${oneLine(headers.subject)}`,
    `Date: ${oneLine(headers.date)}`,
  ];
  if (threadId) headerLines.push(`Thread-ID: ${threadId}`);
  if (messageId) headerLines.push(`Message-ID: ${messageId}`);
  const sections = [
    body,
    formatAttachmentManifest(attachments, attachmentsProcessed),
  ].filter((section) => section.length > 0);
  return headerLines.join('\n') + '\n\n' + sections.join('\n\n');
}
