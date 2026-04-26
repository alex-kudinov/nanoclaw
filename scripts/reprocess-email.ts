#!/usr/bin/env tsx
/**
 * Re-run the classification + routing pipeline on specific Gmail messages.
 *
 * Usage:
 *   reprocess-email MSG_ID [MSG_ID ...]
 *   reprocess-email --classify-as MrGru/lead/warm MSG_ID
 *   reprocess-email --route sales MSG_ID
 *   reprocess-email --dry-run MSG_ID MSG_ID
 */

import { getGmailClient } from '../src/gmail-auth.js';
import { parseEmailHeaders, parseEmailBody } from '../src/gmail-parser.js';
import { handleClassifyLabelWrite } from '../src/classify-ipc-handlers.js';
import { matchRule, extractSenderEmail } from '../src/classify-rules-runner.js';
import { routeClassifiedEmail, type RouteParams } from '../src/host-router.js';
import { writeHostMessage } from '../src/ipc-writer.js';

// ── Args ──────────────────────────────────────────────────────────

interface Args {
  messageIds: string[];
  classifyAs: string | null;
  route: string | null;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { messageIds: [], classifyAs: null, route: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--classify-as':
        out.classifyAs = argv[++i] || null;
        break;
      case '--route':
        out.route = argv[++i] || null;
        break;
      case '--dry-run':
        out.dryRun = true;
        break;
      default:
        if (a.startsWith('--')) {
          console.error(`reprocess-email: unknown flag ${a}`);
          process.exit(2);
        }
        out.messageIds.push(a);
    }
  }
  return out;
}

// ── Gmail fetch with retry ────────────────────────────────────────

async function fetchMessage(gmail: ReturnType<typeof getGmailClient>, msgId: string) {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await gmail.users.messages.get({
        userId: 'me',
        id: msgId,
        format: 'full',
      });
      return res.data;
    } catch (err) {
      lastErr = err;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw lastErr;
}

// ── Build header map from raw headers ─────────────────────────────

function buildHeaderMap(rawHeaders: Array<{ name?: string | null; value?: string | null }>): Record<string, string> {
  const map: Record<string, string> = {};
  for (const h of rawHeaders) {
    if (h.name && h.value) map[h.name.toLowerCase()] = h.value;
  }
  return map;
}

// ── Route params from parsed message ──────────────────────────────

function toRouteParams(
  msgId: string,
  threadId: string,
  label: string,
  senderEmail: string,
  senderName: string,
  subject: string,
  body: string,
): RouteParams {
  return { label, senderEmail, senderName, subject, body, threadId, messageId: msgId };
}

// ── Process one message ───────────────────────────────────────────

async function processMessage(
  gmail: ReturnType<typeof getGmailClient>,
  msgId: string,
  args: Args,
): Promise<void> {
  console.log(`\n--- ${msgId} ---`);

  const msg = await fetchMessage(gmail, msgId);
  if (!msg.payload || !msg.id) {
    console.error(`  [skip] no payload for ${msgId}`);
    return;
  }

  const rawHeaders = msg.payload.headers || [];
  const headers = parseEmailHeaders(rawHeaders);
  const body = parseEmailBody(msg.payload);
  const senderEmail = extractSenderEmail(headers.from) || '';
  const threadId = msg.threadId || msg.id;
  const headerMap = buildHeaderMap(rawHeaders);

  console.log(`  From:    ${headers.from}`);
  console.log(`  Subject: ${headers.subject}`);
  console.log(`  Thread:  ${threadId}`);

  // --route override: write IPC directly to the target group
  if (args.route) {
    console.log(`  [route-override] → ${args.route}`);
    if (!args.dryRun) {
      writeHostMessage(args.route, {
        type: 'message',
        chatJid: 'reprocess-email',
        text: `[REPROCESS]\nFrom: ${headers.fromName} <${senderEmail}>\nSubject: ${headers.subject}\nBody:\n${body}`,
      });
    }
    console.log(`  ${args.dryRun ? '[dry-run]' : '[done]'} IPC → ${args.route}`);
    return;
  }

  // --classify-as: forced label
  if (args.classifyAs) {
    console.log(`  [classify-override] label=${args.classifyAs}`);
    if (!args.dryRun) {
      await handleClassifyLabelWrite({
        type: 'classify_label_write',
        gmail_message_id: msg.id,
        gmail_thread_id: threadId,
        sender_email: senderEmail || null,
        subject: headers.subject || null,
        label: args.classifyAs,
        confidence: 1.0,
        reasoning: 'reprocess-email: operator override',
        classifier_version: 'manual-v1',
      });
      const params = toRouteParams(msg.id, threadId, args.classifyAs, senderEmail, headers.fromName, headers.subject, body);
      const result = await routeClassifiedEmail(params);
      console.log(`  [routed] action=${result.action} target=${result.target ?? 'none'}`);
    } else {
      console.log('  [dry-run] would classify + route');
    }
    return;
  }

  // Default: run rules engine
  const rule = await matchRule({ sender_email: senderEmail || null, subject: headers.subject || null, headers: headerMap });
  if (rule) {
    console.log(`  [rule #${rule.rule_id}] ${rule.pattern_type}: ${rule.pattern_value} → ${rule.target_label}`);
    if (!args.dryRun) {
      await handleClassifyLabelWrite({
        type: 'classify_label_write',
        gmail_message_id: msg.id,
        gmail_thread_id: threadId,
        sender_email: senderEmail || null,
        subject: headers.subject || null,
        label: rule.target_label,
        confidence: 0.95,
        reasoning: `reprocess-email: matched rule #${rule.rule_id} (${rule.pattern_type})`,
        classifier_version: 'rules-runner-v1',
      });
      const params = toRouteParams(msg.id, threadId, rule.target_label, senderEmail, headers.fromName, headers.subject, body);
      const result = await routeClassifiedEmail(params);
      console.log(`  [routed] action=${result.action} target=${result.target ?? 'none'}`);
    } else {
      console.log(`  [dry-run] would classify as ${rule.target_label} + route`);
    }
  } else {
    console.log('  [no-rule] needs LLM classification — use --classify-as to force');
  }
}

// ── Main ──────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.messageIds.length === 0) {
    console.error('Usage: reprocess-email [--classify-as LABEL] [--route GROUP] [--dry-run] MSG_ID [MSG_ID ...]');
    process.exit(2);
  }

  const gmail = getGmailClient();
  for (const msgId of args.messageIds) {
    await processMessage(gmail, msgId, args);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('reprocess-email failed:', err);
  process.exit(1);
});
