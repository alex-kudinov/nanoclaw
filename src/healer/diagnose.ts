/**
 * Phase 1 — diagnose & propose (design §3.4, §7). For each freshly-collected
 * incident the healer asks the AI Router for a root cause, a remediation_class,
 * and a concrete proposed fix, then routes by class: transient → handed to the
 * auto-rerunner; external_outage → escalate (nothing to fix); everything else →
 * a proposal posted to #gru-incidents. This automates ~80% of the manual
 * "copy the error to Claude, get a fix" workflow that Alex does by hand today.
 */

import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';

import { logger } from '../logger.js';
import { redact } from './incident-store.js';
import { askRouter } from './router.js';
import {
  proposeFix,
  setStatus,
  type OpenIncident,
  type ProposedFix,
  type RemediationClass,
} from './remediation.js';
import type { CauseKind, Confidence, DiagnosisResult } from './trust.js';

const CLASSES: RemediationClass[] = [
  'transient',
  'config',
  'code_bug',
  'external_outage',
  'data',
];
const CONFIDENCES: Confidence[] = ['high', 'medium', 'low'];
const CAUSES: CauseKind[] = ['root_cause', 'symptom', 'unknown'];

export function recentCommits(): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['log', '--oneline', '-12'],
      { cwd: process.cwd(), timeout: 10_000 },
      (err, stdout) => resolve(err ? '(git log unavailable)' : stdout.trim()),
    );
  });
}

/**
 * The identifying token from a source ("minion:main" → "main",
 * "job:plutio-outbox-reaper" → "plutio-outbox-reaper") used to scope the log
 * tail to THIS incident's lines.
 */
export function sourceKey(source: string): string {
  return source.includes(':') ? source.split(':').slice(1).join(':') : source;
}

/**
 * Tail the daemon's JSON log for recent error/warn lines mentioning this
 * incident's source key. Stored raw_context is often just a one-line message
 * (e.g. "Container exited with error"); the real stack/exit detail lives here,
 * so feeding it in is what keeps diagnosis from hallucinating on context-starved
 * incidents. CRITICAL: scope to the source key — an unfiltered global tail lets
 * the loudest crash-looper (e.g. minion:main ×280k) contaminate every other
 * incident's diagnosis. Best-effort: '' if no log or no matching lines.
 */
function daemonLogTail(key: string, maxLines = 25): string {
  const p =
    process.env.HEALER_DAEMON_JSONL ||
    path.join(process.cwd(), 'logs', 'nanoclaw.jsonl');
  try {
    const size = fs.statSync(p).size;
    const start = Math.max(0, size - 65_536);
    const fd = fs.openSync(p, 'r');
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    return buf
      .toString('utf-8')
      .split('\n')
      .filter((l) => /"level":(?:50|40)|error|Error/.test(l))
      .filter((l) => !key || l.includes(key))
      .slice(-maxLines)
      .join('\n');
  } catch {
    return '';
  }
}

async function gatherContext(inc: OpenIncident): Promise<string> {
  const commits = await recentCommits();
  const ctx = JSON.stringify(inc.raw_context, null, 2).slice(0, 4000);
  const tail = daemonLogTail(sourceKey(inc.source)).slice(0, 4000);
  return redact(
    `Recent commits:\n${commits}\n\nIncident context (redacted):\n${ctx}` +
      (tail ? `\n\nRecent daemon error log (redacted):\n${tail}` : ''),
  );
}

const SYSTEM_PROMPT =
  'You are the on-call SRE for NanoClaw, a Node.js/TypeScript personal-assistant ' +
  'daemon that runs Claude agents in containers. You diagnose production incidents ' +
  'from logs and propose the smallest correct fix. Reply with ONLY a JSON object.';

function buildPrompt(inc: OpenIncident, ctx: string): string {
  return (
    `Incident source: ${inc.source}\nSeverity: ${inc.severity}\n` +
    `Occurrences: ${inc.occurrences}\n\n${ctx}\n\n` +
    `Classify and propose a fix. remediation_class is one of: ` +
    `${CLASSES.join(', ')}. Use "rerun"/"command" kind ONLY for a safe, ` +
    `idempotent shell command that resolves it; use "diff" for a code change ` +
    `(describe the file + change in summary, optional unified diff); "none" if ` +
    `nothing is actionable.\n\n` +
    `TRUST: you are reasoning from a log snapshot only — you CANNOT open files, ` +
    `grep, or run anything. Claim "high"/"medium" confidence and ` +
    `cause_or_symptom="root_cause" ONLY when the context already proves the root ` +
    `cause; otherwise be honest: "low" confidence, cause_or_symptom="symptom" or ` +
    `"unknown". List the concrete log lines / facts your conclusion rests on in ` +
    `evidence (empty if you are guessing). Return JSON exactly:\n` +
    `{"root_cause": "...", "remediation_class": "...", ` +
    `"fix": {"kind": "rerun|command|diff|none", "summary": "...", ` +
    `"command": "optional shell", "diff": "optional patch"}, ` +
    `"confidence": "high|medium|low", ` +
    `"cause_or_symptom": "root_cause|symptom|unknown", ` +
    `"evidence": ["concrete finding", "..."]}`
  );
}

/**
 * Extract + validate the model's JSON into a DiagnosisResult. Unknown/missing
 * trust fields default to low/unknown/[] so an un-investigated one-shot lands
 * UNtrustworthy by construction (design §5). Returns null if unusable.
 */
export function parseDiagnosis(text: string): DiagnosisResult | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const klass = obj.remediation_class as RemediationClass;
  const fix = (obj.fix ?? {}) as ProposedFix;
  if (!CLASSES.includes(klass) || typeof obj.root_cause !== 'string')
    return null;
  if (!['rerun', 'command', 'diff', 'none'].includes(fix.kind))
    fix.kind = 'none';
  return {
    root_cause: String(obj.root_cause),
    klass,
    fix,
    confidence: CONFIDENCES.includes(obj.confidence as Confidence)
      ? (obj.confidence as Confidence)
      : 'low',
    cause_or_symptom: CAUSES.includes(obj.cause_or_symptom as CauseKind)
      ? (obj.cause_or_symptom as CauseKind)
      : 'unknown',
    evidence: Array.isArray(obj.evidence)
      ? obj.evidence.filter((e): e is string => typeof e === 'string')
      : [],
  };
}

/** Route a parsed verdict by class, carrying its trust fields onto the incident. */
export async function route(
  inc: OpenIncident,
  p: DiagnosisResult,
): Promise<void> {
  if (p.klass === 'transient') return; // remediate.ts auto-handles 'diagnosed'
  if (p.klass === 'external_outage') {
    await setStatus(inc.id, 'wont_fix', 'escalated');
    return;
  }
  const enriched: OpenIncident = {
    ...inc,
    diagnosis: p.root_cause,
    remediation_class: p.klass,
    proposed_fix: p.fix,
    confidence: p.confidence ?? 'low',
    cause_or_symptom: p.cause_or_symptom ?? 'unknown',
    evidence: p.evidence ?? [],
  };
  await proposeFix(enriched);
}

/**
 * Cheap one-shot triage over a log snapshot — the orchestrator's FALLBACK brain
 * when the agentic investigator is unavailable (no token / timeout). It cannot
 * open files, so parseDiagnosis defaults its trust fields to low/unknown unless
 * the model self-reports concrete evidence — i.e. triage rarely earns the 👍.
 */
export async function triage(
  inc: OpenIncident,
): Promise<DiagnosisResult | null> {
  const ctx = await gatherContext(inc);
  const reply = await askRouter(buildPrompt(inc, ctx), {
    systemPrompt: SYSTEM_PROMPT,
  });
  if (!reply) return null;
  const parsed = parseDiagnosis(reply);
  if (!parsed) logger.warn({ id: inc.id }, 'healer: diagnosis unparseable');
  return parsed;
}
