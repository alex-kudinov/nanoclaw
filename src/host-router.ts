/**
 * Gate 3 — Host-side routing for classified emails.
 * Maps taxonomy labels to IPC handoff messages without entering a container.
 */

import { writeHostMessage } from './ipc-writer.js';
import { matchLead, type PipelineMatch } from './lead-matcher.js';
import { logger } from './logger.js';

export type RouteParams = {
  label: string;
  senderEmail: string;
  senderName: string;
  subject: string;
  body: string;
  threadId: string;
  messageId: string;
};

export type RouteResult = {
  routed: boolean;
  action: 'ipc_written' | 'classify_only' | 'unhandled' | 'error';
  target?: string;
  reason?: string;
};

// ── Formatter helpers ──────────────────────────────────────────────

function fmtLeadSales(p: RouteParams, match: PipelineMatch): string {
  return [
    '[HANDOFF: mailman\u2192sales]',
    '[SOURCE: email-reply]',
    `Entry ID: ${match.pipeline_entry_id}`,
    `Party ID: ${match.party_id}`,
    `Lead: ${match.display_name} (${match.stage})`,
    `Program: ${match.program_slug}`,
    ...((() => {
      const tid = match.thread_id ?? p.threadId;
      return tid ? [`Thread-ID: ${tid}`] : [];
    })()),
    `From: ${p.senderEmail}`,
    `Subject: ${p.subject}`,
    `Body:\n${p.body}`,
  ].join('\n');
}

function fmtInbox(p: RouteParams): string {
  return [
    '[HANDOFF: mailman\u2192inbox]',
    '[SOURCE: email]',
    `From: ${p.senderName} <${p.senderEmail}>`,
    `Subject: ${p.subject}`,
    ...(p.threadId ? [`Thread-ID: ${p.threadId}`] : []),
    `Body:\n${p.body}`,
  ].join('\n');
}

function fmtChiefEscalation(p: RouteParams, reason: string): string {
  return [
    `[ESCALATION] ${p.label}`,
    `From: ${p.senderName} <${p.senderEmail}>`,
    `Subject: ${p.subject}`,
    `Summary: ${p.body.slice(0, 500)}`,
    `Reason: ${reason}`,
  ].join('\n');
}

function fmtContador(p: RouteParams): string {
  return [
    '[HANDOFF: mailman\u2192contador]',
    '[TYPE: invoice]',
    `From: ${p.senderName} <${p.senderEmail}>`,
    `Subject: ${p.subject}`,
    `Body:\n${p.body}`,
  ].join('\n');
}

function fmtArchivarista(p: RouteParams): string {
  return [
    '[HANDOFF: mailman\u2192archivarista]',
    '[TYPE: meeting-assets]',
    `From: ${p.senderName} <${p.senderEmail}>`,
    `Subject: ${p.subject}`,
    `Body:\n${p.body}`,
  ].join('\n');
}

// ── IPC write wrapper ──────────────────────────────────────────────

function safeWrite(group: string, payload: Record<string, unknown>): RouteResult {
  try {
    writeHostMessage(group, payload);
    return { routed: true, action: 'ipc_written', target: group };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, group }, 'host-router: writeHostMessage failed');
    return { routed: false, action: 'error', reason: msg };
  }
}

function writeMailman(text: string): RouteResult {
  return safeWrite('mailman', { type: 'message', chatJid: 'host-router', text });
}

function writeChief(text: string): RouteResult {
  return safeWrite('chief', {
    type: 'message',
    chatJid: 'host-router',
    targetGroupFolder: 'chief',
    text,
  });
}

// ── Main dispatch ──────────────────────────────────────────────────

export async function routeClassifiedEmail(params: RouteParams): Promise<RouteResult> {
  // Strip namespace prefix (e.g. "MrGru/client/active" → "client/active").
  // Taxonomy labels have 2+ slashes when prefixed; bare labels have 0-1.
  const parts = params.label.split('/');
  const bare = parts.length >= 3 ? parts.slice(1).join('/') : params.label;
  const prefix = bare.split('/')[0];

  if (prefix === 'lead') return routeLead(params);
  if (prefix === 'client') return writeChief(fmtChiefEscalation(params, 'host-router escalation'));
  if (prefix === 'procurement') return { routed: true, action: 'classify_only', target: 'none' };
  if (bare === 'financial/bill') return writeMailman(fmtContador(params));
  if (bare === 'financial/refund') return writeChief(fmtChiefEscalation(params, 'refund review'));
  if (prefix === 'meeting-assets') return writeMailman(fmtArchivarista(params));
  if (['legal', 'recruiting', 'internal'].includes(prefix)) return writeChief(fmtChiefEscalation(params, `${bare} review`));
  if (bare === 'personal' || bare === 'other') return writeChief(fmtChiefEscalation(params, `${bare} review`));

  // Unrecognized label — chief fallback
  logger.warn({ label: params.label }, 'host-router: unrecognized label, falling back to chief');
  const result = writeChief(fmtChiefEscalation(params, 'unrecognized label'));
  return { ...result, reason: 'unrecognized label prefix' };
}

// ── Lead sub-route ─────────────────────────────────────────────────

async function routeLead(params: RouteParams): Promise<RouteResult> {
  const lead = await matchLead(params.senderEmail);
  if (lead) return writeMailman(fmtLeadSales(params, lead));
  return writeMailman(fmtInbox(params));
}
