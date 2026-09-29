/**
 * NC-20260929-001 — one-time backfill of full names for parties still named
 * by a first name only. Reads the owner's candidate file (psql unaligned
 * output: `pid cur variants names sources`, tab-separated, `(N rows)` footer)
 * and offers each name to the same migration-173 rule the intake paths use,
 * guarded on the party's display_name still being `cur`.
 *
 *   node dist/party-name-backfill.js --file <tsv>           # dry run
 *   node dist/party-name-backfill.js --file <tsv> --apply   # write
 *
 * The dry run runs in a READ ONLY transaction. Output is counts only: names
 * are personal data and are never printed or logged.
 */

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { PoolClient } from 'pg';

import { withAgentContext, withTransaction } from './business-db.js';

export const BACKFILL_SOURCE = 'backfill-nc-20260929-001';
const HEADER = 'pid\tcur\tvariants\tnames\tsources';

export interface CandidateRow {
  pid: number;
  cur: string;
  candidate: string | null;
}

export interface BackfillReport {
  mode: 'dry_run' | 'apply';
  file_rows: number;
  would_upgrade: number;
  upgraded: number;
  skipped: Record<string, number>;
}

/**
 * One name, or the same name in several capitalisations joined by " | ":
 * take the one variant that is not all lowercase. Anything else is ambiguous.
 */
export function pickCandidate(names: string): string | null {
  const variants = [
    ...new Set(
      names
        .split(' | ')
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  ];
  if (variants.length === 1) return variants[0];
  const folded = new Set(variants.map((v) => v.toLowerCase()));
  if (variants.length === 0 || folded.size !== 1) return null;
  const cased = variants.filter((v) => v !== v.toLowerCase());
  return cased.length === 1 ? cased[0] : null;
}

export function parseCandidateFile(text: string): CandidateRow[] {
  const lines = text.split('\n').map((l) => l.replace(/\r$/, ''));
  if (lines[0] !== HEADER) throw new Error('candidate file: unexpected header');
  const rows: CandidateRow[] = [];
  const seen = new Set<number>();
  let footer: number | null = null;
  for (const line of lines.slice(1)) {
    if (line === '') continue;
    const end = /^\((\d+) rows?\)$/.exec(line);
    if (end) {
      if (footer !== null) throw new Error('candidate file: two footers');
      footer = Number(end[1]);
      continue;
    }
    if (footer !== null) throw new Error('candidate file: row after footer');
    const f = line.split('\t');
    if (f.length !== 5 || !/^[1-9][0-9]*$/.test(f[0]))
      throw new Error(`candidate file: malformed row ${rows.length + 1}`);
    const pid = Number(f[0]);
    if (seen.has(pid)) throw new Error('candidate file: duplicate pid');
    seen.add(pid);
    rows.push({ pid, cur: f[1], candidate: pickCandidate(f[3]) });
  }
  if (footer !== rows.length)
    throw new Error('candidate file: footer count does not match rows');
  return rows;
}

const PLAN_SQL = `SELECT t.pid::text AS pid,
        p.id IS NULL AS missing,
        p.merged_into IS NOT NULL AS merged,
        p.party_type,
        p.display_name IS NOT DISTINCT FROM t.cur AS unchanged,
        business_v2.fn_display_name_upgrade_verdict(p.display_name, t.cand) AS verdict
   FROM unnest($1::bigint[], $2::text[], $3::text[]) AS t(pid, cur, cand)
   LEFT JOIN business_v2.parties p ON p.id = t.pid`;

interface PlanRow {
  pid: string;
  missing: boolean;
  merged: boolean;
  party_type: string | null;
  unchanged: boolean;
  verdict: string;
}

function classify(row: PlanRow): string {
  if (row.missing) return 'party_not_found';
  if (row.merged) return 'party_merged';
  if (row.party_type !== 'person') return 'not_a_person';
  if (!row.unchanged) return 'name_changed_since_file';
  return row.verdict;
}

/** Decide every row read-only; returns the rows the rule would upgrade. */
export async function planBackfill(
  client: PoolClient,
  rows: CandidateRow[],
  report: BackfillReport,
): Promise<CandidateRow[]> {
  const usable = rows.filter((r) => r.candidate !== null);
  const bump = (reason: string) =>
    (report.skipped[reason] = (report.skipped[reason] ?? 0) + 1);
  rows
    .filter((r) => r.candidate === null)
    .forEach(() => bump('ambiguous_candidate'));
  const r = await client.query<PlanRow>(PLAN_SQL, [
    usable.map((u) => u.pid),
    usable.map((u) => u.cur),
    usable.map((u) => u.candidate),
  ]);
  const verdicts = new Map(r.rows.map((p) => [Number(p.pid), classify(p)]));
  const eligible = usable.filter((u) => verdicts.get(u.pid) === 'upgrade');
  usable
    .filter((u) => verdicts.get(u.pid) !== 'upgrade')
    .forEach((u) => bump(verdicts.get(u.pid) ?? 'party_not_found'));
  report.would_upgrade = eligible.length;
  return eligible;
}

export async function runBackfill(
  rows: CandidateRow[],
  apply: boolean,
): Promise<BackfillReport> {
  const report: BackfillReport = {
    mode: apply ? 'apply' : 'dry_run',
    file_rows: rows.length,
    would_upgrade: 0,
    upgraded: 0,
    skipped: {},
  };
  if (!apply) {
    await withTransaction(async (client) => {
      await client.query('SET TRANSACTION READ ONLY');
      await planBackfill(client, rows, report);
    });
    return report;
  }
  await withAgentContext('party-name-backfill', async (client) => {
    for (const row of await planBackfill(client, rows, report)) {
      const r = await client.query<{ upgraded: boolean }>(
        `SELECT business_v2.fn_upgrade_party_display_name($1::bigint, $2, $3, $4) AS upgraded`,
        [row.pid, row.candidate, BACKFILL_SOURCE, row.cur],
      );
      if (r.rows[0]?.upgraded === true) report.upgraded += 1;
      else
        report.skipped.refused_at_apply =
          (report.skipped.refused_at_apply ?? 0) + 1;
    }
  });
  return report;
}

export async function main(argv: string[]): Promise<void> {
  const at = argv.indexOf('--file');
  const file = at >= 0 ? argv[at + 1] : undefined;
  if (!file)
    throw new Error('usage: party-name-backfill --file <tsv> [--apply]');
  const rows = parseCandidateFile(fs.readFileSync(file, 'utf8'));
  const report = await runBackfill(rows, argv.includes('--apply'));
  console.log(JSON.stringify(report));
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main(process.argv.slice(2))
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
