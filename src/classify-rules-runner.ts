/**
 * Pre-LLM classification rules runner.
 *
 * Runs against `classification_rules` on the inbound Gmail hot path BEFORE
 * the mailman agent container is spawned. When a rule matches, the host
 * applies the classification directly — no LLM call, no container, no IPC
 * round-trip. Messages that don't match any rule fall through to mailman
 * as today.
 *
 * Rules are populated by:
 *   - chief's `route_lesson` backfill (source='lesson')
 *   - operator CLI seeds (source='seed')
 *   - manual additions (source='manual')
 *
 * In-memory cache with 60s TTL keeps per-message overhead at one SELECT
 * per minute under steady state.
 */

import { query } from './business-db.js';
import { logger } from './logger.js';

const CACHE_TTL_MS = 60_000;

export interface ClassificationRule {
  id: number;
  pattern_type:
    | 'sender_exact'
    | 'sender_regex'
    | 'subject_regex'
    | 'header_match';
  pattern_value: string;
  target_label: string;
  source: string;
}

export interface ClassificationMatch {
  rule_id: number;
  target_label: string;
  pattern_type: ClassificationRule['pattern_type'];
  pattern_value: string;
}

export interface RuleRunnerInput {
  sender_email: string | null;
  subject: string | null;
  headers?: Record<string, string>;
}

let cachedRules: ClassificationRule[] | null = null;
let cacheExpiresAt = 0;

async function loadEnabledRules(): Promise<ClassificationRule[]> {
  const now = Date.now();
  if (cachedRules && now < cacheExpiresAt) return cachedRules;
  const res = await query<ClassificationRule>(
    `SELECT id, pattern_type, pattern_value, target_label, source
       FROM classification_rules
      WHERE enabled = TRUE
      ORDER BY
        CASE pattern_type
          WHEN 'sender_exact'  THEN 1
          WHEN 'header_match'  THEN 2
          WHEN 'sender_regex'  THEN 3
          WHEN 'subject_regex' THEN 4
          ELSE 5
        END,
        id ASC`,
  );
  cachedRules = res.rows;
  cacheExpiresAt = now + CACHE_TTL_MS;
  return cachedRules;
}

export function resetRulesCache(): void {
  cachedRules = null;
  cacheExpiresAt = 0;
}

/**
 * Extract the bare email address from a From header like
 * `"John Smith <john@example.com>"` → `"john@example.com"`.
 * Returns the input lowercased if no angle brackets are present.
 */
export function extractSenderEmail(from: string | null): string | null {
  if (!from) return null;
  const m = from.match(/<([^>]+)>/);
  const email = (m ? m[1] : from).trim().toLowerCase();
  return email || null;
}

/**
 * A `Re:`-prefixed subject signals a human reply. Sender rules (sender_exact /
 * sender_regex) are blind to content, so a sender that BOTH sends automated
 * mail and relays human replies — Encharge's `no-reply@encharge.io` is the
 * canonical trap — would auto-archive a real lead. When the subject looks like
 * a human reply, sender rules are skipped so the message falls through to the
 * mailman LLM classifier, which reads the body. Subject/header rules are
 * unaffected: they already match on content the operator chose deliberately.
 */
export function isHumanReplySubject(subject: string | null): boolean {
  return subject != null && /^\s*re:\s/i.test(subject);
}

function isSenderRule(rule: ClassificationRule): boolean {
  return (
    rule.pattern_type === 'sender_exact' || rule.pattern_type === 'sender_regex'
  );
}

function toMatch(rule: ClassificationRule): ClassificationMatch {
  return {
    rule_id: rule.id,
    target_label: rule.target_label,
    pattern_type: rule.pattern_type,
    pattern_value: rule.pattern_value,
  };
}

function evalRule(
  rule: ClassificationRule,
  input: RuleRunnerInput,
  senderLower: string | null,
): boolean {
  switch (rule.pattern_type) {
    case 'sender_exact':
      return (
        senderLower !== null && senderLower === rule.pattern_value.toLowerCase()
      );

    case 'sender_regex':
      if (!senderLower) return false;
      return new RegExp(rule.pattern_value, 'i').test(senderLower);

    case 'subject_regex':
      if (!input.subject) return false;
      return new RegExp(rule.pattern_value, 'i').test(input.subject);

    case 'header_match': {
      if (!input.headers) return false;
      const colonIdx = rule.pattern_value.indexOf(':');
      if (colonIdx <= 0) return false;
      const hname = rule.pattern_value.slice(0, colonIdx).trim().toLowerCase();
      const hvalue = rule.pattern_value
        .slice(colonIdx + 1)
        .trim()
        .toLowerCase();
      const actual = input.headers[hname];
      if (!actual) return false;
      return actual.toLowerCase().includes(hvalue);
    }
  }
}

/** Match an inbound message against enabled rules. Returns first match, or null. */
export async function matchRule(
  input: RuleRunnerInput,
): Promise<ClassificationMatch | null> {
  const rules = await loadEnabledRules();
  const senderLower = extractSenderEmail(input.sender_email);

  const humanReply = isHumanReplySubject(input.subject);

  for (const rule of rules) {
    try {
      if (evalRule(rule, input, senderLower)) {
        if (humanReply && isSenderRule(rule)) {
          logger.info(
            {
              ruleId: rule.id,
              patternType: rule.pattern_type,
              subject: input.subject,
            },
            'classify-rules: sender rule suppressed — human reply (Re:) subject; routing to mailman',
          );
          continue;
        }
        return toMatch(rule);
      }
    } catch (err) {
      logger.warn(
        { ruleId: rule.id, patternType: rule.pattern_type, err },
        'classify-rules: rule eval failed (bad regex?), skipping',
      );
    }
  }
  return null;
}

/** Increment hit counters on a matched rule. Swallows errors — non-critical. */
export async function recordRuleHit(ruleId: number): Promise<void> {
  try {
    await query(
      `UPDATE classification_rules
          SET hit_count = hit_count + 1, last_hit_at = NOW()
        WHERE id = $1`,
      [ruleId],
    );
  } catch (err) {
    logger.warn({ ruleId, err }, 'classify-rules: recordRuleHit failed');
  }
}
