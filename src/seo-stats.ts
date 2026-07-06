/**
 * Host-handled, zero-LLM SEO stats commands for #gru-seo. Reads the SEO data
 * files that the seo-rescue-run / gsc-reindex-drain jobs write under
 * tandemweb/data/seo and formats Slack-ready summaries — no container spawn,
 * no token burn. Mirrors the `status` host command in pipeline-status.ts.
 */
import fs from 'fs';
import path from 'path';

export const SEO_COMMAND_FOLDER = 'gru-seo';

export const SEO_DATA_DIR =
  process.env.SEO_DATA_DIR ||
  path.join(process.env.HOME || '', 'dev/tandemweb/data/seo');

const DAILY_QUOTA = 200;

interface QueueEntry {
  priority: 'high' | 'normal';
  slug: string;
  enqueued_at: string;
  status: 'pending' | 'submitted';
  method?: string;
  submitted_at?: string;
  last_deferred?: string;
}

interface RoleSummary {
  count: number;
  scored: number;
  avg_score: number;
}

interface Scoreboard {
  snapshot_date: string;
  summary: Record<string, RoleSummary>;
  rows: Array<{ metrics?: { clicks?: number; impressions?: number } }>;
}

function readJson<T>(dir: string, file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')) as T;
  } catch {
    return null;
  }
}

/** America/Chicago calendar date — matches the gsc-reindex-drain quota file. */
function ctDate(now: Date): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
}

export function formatGscQueue(dir: string, now: Date): string {
  const queue = readJson<{ urls: Record<string, QueueEntry> }>(
    dir,
    'gsc-reindex-queue.json',
  );
  if (!queue?.urls) return ':mag: *GSC reindex queue* — no queue file found';
  const all = Object.values(queue.urls);
  const pending = all.filter((x) => x.status === 'pending');
  const high = pending.filter((x) => x.priority === 'high').length;
  const used =
    readJson<{ count: number }>(dir, `gsc-quota-${ctDate(now)}.json`)?.count ??
    0;
  const oldest = pending.map((x) => x.enqueued_at).sort()[0];
  const deferred = pending.filter((x) => x.last_deferred).length;
  return [
    ':mag: *GSC reindex queue*',
    `• Pending: *${pending.length}*  (high ${high} · normal ${pending.length - high})`,
    deferred ? `• Deferred (quota overflow): ${deferred}` : '',
    oldest ? `• Oldest pending: ${oldest}` : '',
    `• Submitted today (Indexing API): *${used}/${DAILY_QUOTA}* · ${DAILY_QUOTA - used} left`,
    '• Drain runs daily ~05:00 CT (submitted URLs leave the queue)',
  ]
    .filter(Boolean)
    .join('\n');
}

export function formatScoreboard(dir: string): string {
  const sb = readJson<Scoreboard>(dir, 'scoreboard-latest.json');
  if (!sb?.summary)
    return ':bar_chart: *SEO scoreboard* — no scoreboard file found';
  const lines = Object.entries(sb.summary)
    .sort((a, b) => b[1].avg_score - a[1].avg_score)
    .map(
      ([role, s]) =>
        `• ${role}: ${s.count} pages · avg ${s.avg_score.toFixed(2)} (${s.scored} scored)`,
    );
  const totals = (sb.rows || []).reduce(
    (a, r) => ({
      clicks: a.clicks + (r.metrics?.clicks || 0),
      impr: a.impr + (r.metrics?.impressions || 0),
    }),
    { clicks: 0, impr: 0 },
  );
  return [
    `:bar_chart: *SEO scoreboard* — snapshot ${sb.snapshot_date}`,
    ...lines,
    `• Σ ${sb.rows?.length ?? 0} pages · ${totals.clicks} clicks · ${totals.impr} impressions`,
  ].join('\n');
}

const HELP =
  ':information_source: *#gru-seo commands*\n• `gsc` — reindex queue stats\n• `scoreboard` — SEO performance scoreboard\n• `seo` — both';

const GSC_RE = /^(gsc|gsc queue|gsc status|queue|reindex)$/;
const SB_RE = /^(scoreboard|seo scoreboard)$/;

function normalize(text: string, assistantName?: string): string {
  let t = (text || '').trim().toLowerCase();
  if (assistantName) {
    const mention = `@${assistantName.toLowerCase()}`;
    if (t.startsWith(mention)) t = t.slice(mention.length).trim();
  }
  return t.replace(/[?.!]+$/, '').trim();
}

export function isSeoCommand(text: string, assistantName?: string): boolean {
  const t = normalize(text, assistantName);
  return GSC_RE.test(t) || SB_RE.test(t) || t === 'seo' || t === 'seo help';
}

export function seoCommandReply(
  text: string,
  assistantName?: string,
  dir: string = SEO_DATA_DIR,
  now: Date = new Date(),
): string | null {
  const t = normalize(text, assistantName);
  if (GSC_RE.test(t)) return formatGscQueue(dir, now);
  if (SB_RE.test(t)) return formatScoreboard(dir);
  if (t === 'seo')
    return `${formatGscQueue(dir, now)}\n\n${formatScoreboard(dir)}`;
  if (t === 'seo help') return HELP;
  return null;
}
