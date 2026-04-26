/**
 * Daily per-recipient email digest generator.
 *
 * Pulls classified, hive-targeted emails for the recipient, groups them by
 * taxonomy category, asks Claude (via Print Bridge) for a terse prose summary,
 * and returns markdown + HTML ready for email delivery.
 *
 * Fallback path: if bridgePrint times out, return a raw bulleted list.
 */

import { query } from './business-db.js';
import { bridgePrint } from './claude-bridge.js';
import { logger } from './logger.js';

const MAX_ROWS = 100;
const MAX_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Digest options.
 *
 * Deep-linking to specific Gmail threads was explored (T20) and dropped
 * for V1. Gmail's API hex thread IDs (`19d7720b...`) don't navigate in the
 * web SPA's `#all/...` URLs, `?authuser=EMAIL` drops the fragment on
 * redirect, `u/{email}/` is not a supported URL form, and our classified
 * emails live in the info@ mailbox (not the recipient's personal inbox)
 * — so `rfc822msgid:` search won't find the forwarded copy. We emit
 * plain-text entries and let the reader find the email in their own
 * mailbox by sender/subject.
 */
export interface DigestOptions {
  recipientName: 'alex' | 'cherie';
  sinceISO: string;
}

export interface DigestResult {
  markdown: string;
  html: string;
  itemCount: number;
}

interface DigestRow {
  gmail_message_id: string;
  gmail_thread_id: string;
  label: string;
  subject: string | null;
  sender_email: string | null;
  classified_at: string;
  digest_priority: number;
  category: string;
}

function clampSinceISO(sinceISO: string): string {
  const since = new Date(sinceISO);
  const floor = new Date(Date.now() - MAX_WINDOW_MS);
  return (since < floor ? floor : since).toISOString();
}

async function fetchDigestRows(
  recipientName: string,
  sinceISO: string,
): Promise<DigestRow[]> {
  const res = await query<DigestRow>(
    `SELECT ec.gmail_message_id, ec.gmail_thread_id, ec.label, ec.subject,
            ec.sender_email, ec.classified_at, ct.digest_priority,
            SPLIT_PART(ec.label, '/', 2) AS category
       FROM email_classifications ec
       JOIN classification_taxonomy ct ON ec.label = ct.label
      WHERE ec.classified_at >= $1
        AND ct.hive_share_target IS NOT NULL
        AND ct.hive_share_target @> ARRAY[$2]::text[]
        AND ct.digest_priority >= 1
      ORDER BY category, ct.digest_priority DESC, ec.classified_at DESC
      LIMIT ${MAX_ROWS}`,
    [sinceISO, recipientName],
  );
  return res.rows;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface CategoryGroup {
  category: string;
  rows: DigestRow[];
}

function groupByCategory(rows: DigestRow[]): CategoryGroup[] {
  const groups: CategoryGroup[] = [];
  const byCat = new Map<string, DigestRow[]>();
  for (const r of rows) {
    if (!byCat.has(r.category)) byCat.set(r.category, []);
    byCat.get(r.category)!.push(r);
  }
  for (const [category, rs] of byCat) groups.push({ category, rows: rs });
  return groups;
}

function renderMarkdown(groups: CategoryGroup[]): string {
  const lines: string[] = [];
  for (const g of groups) {
    lines.push(`## ${g.category || 'other'}`);
    for (const r of g.rows) {
      const subject = r.subject || '(no subject)';
      const sender = r.sender_email || 'unknown';
      lines.push(`- ${subject} — ${sender}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function renderHtml(groups: CategoryGroup[]): string {
  const out: string[] = ['<div>'];
  for (const g of groups) {
    out.push(`<h2>${escapeHtml(g.category || 'other')}</h2>`);
    out.push('<ul>');
    for (const r of g.rows) {
      const subject = escapeHtml(r.subject || '(no subject)');
      const sender = escapeHtml(r.sender_email || 'unknown');
      out.push(`<li>${subject} — ${sender}</li>`);
    }
    out.push('</ul>');
  }
  out.push('</div>');
  return out.join('\n');
}

function generateFallbackDigest(groups: CategoryGroup[]): {
  markdown: string;
  html: string;
} {
  return {
    markdown: renderMarkdown(groups),
    html: renderHtml(groups),
  };
}

async function addProseSummary(base: string): Promise<string> {
  const prompt =
    'Write a 3-sentence prose summary highlighting the most important items in ' +
    'this email digest, then leave the bulleted list as-is. Do NOT invent items ' +
    'or URLs. The digest is in markdown below.\n\n---\n' +
    base;
  try {
    const summary = await bridgePrint({
      prompt,
      model: 'haiku',
      timeout_ms: 60_000,
    });
    return summary;
  } catch (err) {
    logger.warn(
      { err },
      'digest-generator: bridgePrint failed, using raw list',
    );
    return base;
  }
}

export async function generateDigest(
  opts: DigestOptions,
): Promise<DigestResult> {
  const sinceISO = clampSinceISO(opts.sinceISO);
  const rows = await fetchDigestRows(opts.recipientName, sinceISO);

  if (rows.length === 0) {
    return { markdown: '', html: '', itemCount: 0 };
  }

  const groups = groupByCategory(rows);
  const baseMarkdown = renderMarkdown(groups);
  const html = renderHtml(groups);

  let finalMarkdown: string;
  try {
    finalMarkdown = await addProseSummary(baseMarkdown);
  } catch (err) {
    logger.error({ err }, 'digest-generator: fallback generator failed');
    const fallback = generateFallbackDigest(groups);
    return {
      markdown: fallback.markdown,
      html: fallback.html,
      itemCount: rows.length,
    };
  }

  return { markdown: finalMarkdown, html, itemCount: rows.length };
}
