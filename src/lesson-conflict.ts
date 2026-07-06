/**
 * lesson-conflict — contradiction check at lesson-write time, with owner
 * routing.
 *
 * The old failure mode: a new lesson silently contradicting existing
 * knowledge got appended anyway, and the conflict surfaced months later as a
 * near-miss with a customer (the 4-contradiction backlog of 2026-07-05).
 * Now every appended lesson is checked (via the Print Bridge) against the
 * agent's existing LEARNED.md; on conflict the lesson is flagged CONTESTED
 * in-file and the domain owner is asked directly in the agent's channel:
 * ICF/program substance → Cherie, business/pricing/process → Alex.
 *
 * Fire-and-forget: the lesson always lands first (capture must never lose
 * data); the check annotates afterwards. Bridge failures degrade to a warn.
 */
import fs from 'fs';
import path from 'path';

import { bridgePrint } from './claude-bridge.js';
import { readEnvFile } from './env.js';
import { logger } from './logger.js';

export interface ConflictVerdict {
  conflicts: Array<{ lesson: number; reason: string }>;
  domain: 'icf-program' | 'business-pricing' | 'process';
}

/** Owner routing: who adjudicates conflicts in each knowledge domain. */
export function ownerUidFor(domain: string): string | undefined {
  const env = readEnvFile(['SLACK_UID_ALEX', 'SLACK_UID_CHERIE']);
  return domain === 'icf-program' ? env.SLACK_UID_CHERIE : env.SLACK_UID_ALEX;
}

function buildPrompt(existing: string, title: string, rule: string): string {
  return [
    'You are auditing a sales-agent lesson file for factual contradictions.',
    'A NEW lesson was just appended. Compare it against the EXISTING lessons',
    'and report only genuine factual conflicts (two rules that cannot both be',
    'true), not stylistic overlap or refinements.',
    '',
    'Respond with STRICT JSON only, no prose, matching:',
    '{"conflicts":[{"lesson":<number>,"reason":"<short>"}],"domain":"icf-program"|"business-pricing"|"process"}',
    '',
    'domain = the subject area of the NEW lesson: "icf-program" for ICF rules,',
    'accreditation, program content/eligibility; "business-pricing" for prices,',
    'discounts, payment, offers; "process" for workflow/communication habits.',
    '',
    `NEW LESSON: ${title}`,
    `RULE: ${rule}`,
    '',
    'EXISTING LESSONS:',
    existing,
  ].join('\n');
}

export function parseVerdict(raw: string): ConflictVerdict | undefined {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return undefined;
    const v = JSON.parse(jsonMatch[0]) as ConflictVerdict;
    if (!Array.isArray(v.conflicts)) return undefined;
    return v;
  } catch {
    return undefined;
  }
}

/** Append a CONTESTED status line under the lesson that was just written. */
function flagContested(
  learnedPath: string,
  lessonNum: number,
  verdict: ConflictVerdict,
): void {
  const refs = verdict.conflicts.map((c) => `Lesson ${c.lesson}`).join(', ');
  const line = `**Status:** CONTESTED — conflicts with ${refs}; pending human adjudication. Do not treat either side as settled.\n`;
  const content = fs.readFileSync(learnedPath, 'utf-8');
  const marker = new RegExp(`(### Lesson ${lessonNum}:[^\\n]*\\n)`);
  const flagged = content.replace(marker, `$1${line}`);
  if (flagged !== content) fs.writeFileSync(learnedPath, flagged, 'utf-8');
}

export interface ConflictNotifier {
  (groupFolder: string, text: string): Promise<void>;
}

/**
 * Check a just-appended lesson for contradictions. Never throws; never
 * blocks the write path (call without await).
 */
export async function checkLessonConflict(
  agent: string,
  lessonNum: number,
  title: string,
  rule: string,
  notify?: ConflictNotifier,
): Promise<void> {
  try {
    const learnedPath = path.resolve('knowledge', 'agents', agent, 'LEARNED.md');
    if (!fs.existsSync(learnedPath)) return;
    const content = fs.readFileSync(learnedPath, 'utf-8');
    // Exclude the lesson under test from its own comparison corpus.
    const existing = content
      .split(new RegExp(`### Lesson ${lessonNum}:`))[0]
      .slice(-24_000); // keep the prompt bounded
    const raw = await bridgePrint({
      prompt: buildPrompt(existing, title, rule),
      model: 'sonnet',
      timeout_ms: 120_000,
      meta: { caller: 'lesson-conflict', minion: agent },
    });
    const verdict = parseVerdict(raw);
    if (!verdict || verdict.conflicts.length === 0) return;

    flagContested(learnedPath, lessonNum, verdict);
    const owner = ownerUidFor(verdict.domain);
    const mention = owner ? `<@${owner}> ` : '';
    const refs = verdict.conflicts
      .map((c) => `Lesson ${c.lesson} (${c.reason})`)
      .join('; ');
    if (notify) {
      await notify(
        agent,
        `⚖️ ${mention}New Lesson ${lessonNum} ("${title}") conflicts with ${refs}. ` +
          `Both are now marked CONTESTED in ${agent}/LEARNED.md — which is correct? ` +
          `Reply here and I'll reconcile the file.`,
      );
    }
    logger.warn(
      { agent, lessonNum, conflicts: verdict.conflicts, domain: verdict.domain },
      'lesson-conflict: contradiction detected',
    );
  } catch (err) {
    logger.warn({ err, agent, lessonNum }, 'lesson-conflict: check failed');
  }
}
