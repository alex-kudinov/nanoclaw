import { createHash } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

const SCHEMA = 'executive-search-linkedin-alert-v1';
const SENDER = 'jobalerts-noreply@linkedin.com';
const MAX_HTML_BYTES = 250_000;
const MAX_TITLE_LENGTH = 300;
const MAX_CONTEXT_LENGTH = 600;

export interface LinkedInAlertLead {
  linkedinJobId: string;
  linkedinUrl: string;
  title: string | null;
  context: string | null;
}

export interface LinkedInAlertEnvelope {
  schema: typeof SCHEMA;
  envelopeId: string;
  gmailMessageId: string;
  gmailThreadId: string;
  observedAt: string;
  sender: typeof SENDER;
  subject: string;
  sourceEvidenceSha256: string;
  leads: LinkedInAlertLead[];
}

export interface LinkedInAlertCaptureInput {
  gmailMessageId: string;
  gmailThreadId: string;
  observedAt: string;
  senderEmail: string;
  subject: string;
  body: string;
  html: string;
  rawHeaders: Array<{ name?: string | null; value?: string | null }>;
  outboxDir: string;
}

export interface LinkedInAlertCaptureResult {
  matched: boolean;
  captured: boolean;
  duplicate: boolean;
  envelope?: LinkedInAlertEnvelope;
  path?: string;
}

export class LinkedInAlertCaptureError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LinkedInAlertCaptureError';
  }
}

const sha256 = (value: string | Buffer): string =>
  createHash('sha256').update(value).digest('hex');

function cleanText(value: string, limit: number): string {
  const decoded = value
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x2F;/gi, '/')
    .replace(/\s+/g, ' ')
    .trim();
  return decoded.slice(0, limit);
}

function decodeHref(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&#x2F;/gi, '/')
    .replace(/&#47;/g, '/')
    .trim();
}

function trustedLinkedInSender(
  senderEmail: string,
  rawHeaders: LinkedInAlertCaptureInput['rawHeaders'],
): boolean {
  if (senderEmail.trim().toLowerCase() !== SENDER) return false;
  const authentication = rawHeaders.find(
    (header) => header.name?.toLowerCase() === 'authentication-results',
  )?.value;
  if (!authentication) return false;
  const normalized = authentication.replace(/[\r\n]+/g, ' ').trim();
  if (!/^mx\.google\.com\s*;/i.test(normalized)) return false;
  const dmarcDomain = normalized.match(
    /\bdmarc\s*=\s*pass\b[^;]*\bheader\.from\s*=\s*([^\s;]+)/i,
  )?.[1];
  if (dmarcDomain?.toLowerCase().replace(/^@/, '') === 'linkedin.com') {
    return true;
  }
  const dkimIdentity = normalized.match(
    /\bdkim\s*=\s*pass\b[^;]*\bheader\.i\s*=\s*([^\s;]+)/i,
  )?.[1];
  return (
    dkimIdentity?.toLowerCase().replace(/^.*@/, '').replace(/^@/, '') ===
    'linkedin.com'
  );
}

function normalizeLinkedInJobUrl(value: string): {
  jobId: string;
  url: string;
} | null {
  try {
    const parsed = new URL(decodeHref(value));
    if (!['linkedin.com', 'www.linkedin.com'].includes(parsed.hostname)) {
      return null;
    }
    const match = parsed.pathname.match(
      /^\/(?:comm\/)?jobs\/view\/(?:[^/]*-)?(\d+)(?:\/|$)/i,
    );
    if (!match) return null;
    return {
      jobId: match[1],
      url: `https://www.linkedin.com/jobs/view/${match[1]}`,
    };
  } catch {
    return null;
  }
}

export function extractLinkedInAlertLeads(
  html: string,
  body = '',
): LinkedInAlertLead[] {
  const source = html.slice(0, MAX_HTML_BYTES);
  const leads = new Map<string, LinkedInAlertLead>();
  const anchor = /<a\b([^>]*?)\bhref\s*=\s*(["'])(.*?)\2([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const match of source.matchAll(anchor)) {
    const normalized = normalizeLinkedInJobUrl(match[3]);
    if (!normalized) continue;
    const title = cleanText(match[5], MAX_TITLE_LENGTH);
    const afterSource = source.slice(
      (match.index ?? 0) + match[0].length,
      (match.index ?? 0) + match[0].length + 1800,
    );
    const nextJob = afterSource.search(
      /<a\b[^>]*\bhref\s*=\s*["'][^"']*(?:\/comm)?\/jobs\/view\//i,
    );
    const after = nextJob >= 0 ? afterSource.slice(0, nextJob) : afterSource;
    const context = cleanText(after, MAX_CONTEXT_LENGTH);
    const usableTitle =
      title && !/^(?:view|see|apply|open)\s+(?:this\s+)?job$/i.test(title)
        ? title
        : null;
    const prior = leads.get(normalized.jobId);
    leads.set(normalized.jobId, {
      linkedinJobId: normalized.jobId,
      linkedinUrl: normalized.url,
      title: prior?.title ?? usableTitle,
      context: prior?.context ?? (context || null),
    });
  }

  const combined = `${source}\n${body}`;
  const urls = combined.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
  for (const value of urls) {
    const normalized = normalizeLinkedInJobUrl(value);
    if (!normalized || leads.has(normalized.jobId)) continue;
    leads.set(normalized.jobId, {
      linkedinJobId: normalized.jobId,
      linkedinUrl: normalized.url,
      title: null,
      context: null,
    });
  }
  return [...leads.values()].sort((left, right) =>
    left.linkedinJobId.localeCompare(right.linkedinJobId),
  );
}

function ensurePrivateDirectory(outboxDir: string): string {
  mkdirSync(outboxDir, { recursive: true, mode: 0o700 });
  const stat = lstatSync(outboxDir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new LinkedInAlertCaptureError('LinkedIn alert outbox is not a private directory');
  }
  chmodSync(outboxDir, 0o700);
  return realpathSync(outboxDir);
}

export function ensureLinkedInJobAlertOutbox(outboxDir: string): string {
  return ensurePrivateDirectory(outboxDir);
}

export function captureLinkedInJobAlert(
  input: LinkedInAlertCaptureInput,
): LinkedInAlertCaptureResult {
  if (input.senderEmail.trim().toLowerCase() !== SENDER) {
    return { matched: false, captured: false, duplicate: false };
  }
  if (!trustedLinkedInSender(input.senderEmail, input.rawHeaders)) {
    return { matched: true, captured: false, duplicate: false };
  }
  if (!/^[a-zA-Z0-9_-]{4,200}$/.test(input.gmailMessageId)) {
    throw new LinkedInAlertCaptureError('LinkedIn alert Gmail message ID is invalid');
  }
  if (!/^[a-zA-Z0-9_-]{4,200}$/.test(input.gmailThreadId)) {
    throw new LinkedInAlertCaptureError('LinkedIn alert Gmail thread ID is invalid');
  }
  const leads = extractLinkedInAlertLeads(input.html, input.body);
  if (leads.length === 0) {
    throw new LinkedInAlertCaptureError(
      'Trusted LinkedIn job alert contained no recognized job links',
    );
  }
  const subject = cleanText(input.subject, 500);
  const sourceEvidenceSha256 = sha256(
    JSON.stringify({
      gmailMessageId: input.gmailMessageId,
      gmailThreadId: input.gmailThreadId,
      observedAt: input.observedAt,
      sender: SENDER,
      subject,
      bodySha256: sha256(input.body),
      htmlSha256: sha256(input.html),
      leads,
    }),
  );
  const envelopeId = sha256(`${SCHEMA}\0${input.gmailMessageId}`);
  const envelope: LinkedInAlertEnvelope = {
    schema: SCHEMA,
    envelopeId,
    gmailMessageId: input.gmailMessageId,
    gmailThreadId: input.gmailThreadId,
    observedAt: input.observedAt,
    sender: SENDER,
    subject,
    sourceEvidenceSha256,
    leads,
  };
  const outbox = ensurePrivateDirectory(input.outboxDir);
  const outputPath = path.join(outbox, `${envelopeId}.json`);
  const serialized = `${JSON.stringify(envelope, null, 2)}\n`;
  if (existsSync(outputPath)) {
    const current = readFileSync(outputPath, 'utf8');
    if (current !== serialized) {
      throw new LinkedInAlertCaptureError(
        'LinkedIn alert replay conflicts with the existing envelope',
      );
    }
    return {
      matched: true,
      captured: true,
      duplicate: true,
      envelope,
      path: outputPath,
    };
  }
  const temporary = path.join(outbox, `.${envelopeId}.${process.pid}.tmp`);
  let descriptor: number | null = null;
  try {
    descriptor = openSync(temporary, 'wx', 0o600);
    writeFileSync(descriptor, serialized);
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
  chmodSync(temporary, 0o600);
  renameSync(temporary, outputPath);
  chmodSync(outputPath, 0o600);
  return {
    matched: true,
    captured: true,
    duplicate: false,
    envelope,
    path: outputPath,
  };
}

export const LINKEDIN_JOB_ALERT_OUTBOX_SCHEMA = SCHEMA;
export const LINKEDIN_JOB_ALERT_SENDER = SENDER;
