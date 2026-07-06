import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  formatGscQueue,
  formatScoreboard,
  isSeoCommand,
  seoCommandReply,
} from './seo-stats.js';

let dir: string;
const NOW = new Date('2026-06-26T18:00:00-05:00'); // CT date = 2026-06-26

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-stats-'));
  fs.writeFileSync(
    path.join(dir, 'gsc-reindex-queue.json'),
    JSON.stringify({
      urls: {
        'https://x/a/': {
          priority: 'high',
          slug: 'a',
          enqueued_at: '2026-06-20',
          status: 'pending',
        },
        'https://x/b/': {
          priority: 'normal',
          slug: 'b',
          enqueued_at: '2026-06-25',
          status: 'pending',
          last_deferred: '2026-06-25',
        },
        'https://x/c/': {
          priority: 'high',
          slug: 'c',
          enqueued_at: '2026-06-24',
          status: 'submitted',
          method: 'indexing-api',
        },
      },
    }),
  );
  fs.writeFileSync(
    path.join(dir, 'gsc-quota-2026-06-26.json'),
    JSON.stringify({ count: 7 }),
  );
  fs.writeFileSync(
    path.join(dir, 'scoreboard-latest.json'),
    JSON.stringify({
      snapshot_date: '2026-06-25',
      summary: {
        authority: { count: 19, scored: 18, avg_score: 0.9022 },
        reach: { count: 40, scored: 34, avg_score: 0.0432 },
      },
      rows: [
        { metrics: { clicks: 3, impressions: 100 } },
        { metrics: { clicks: 1, impressions: 50 } },
      ],
    }),
  );
});

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('formatGscQueue', () => {
  it('counts pending by priority and reads quota for the CT date', () => {
    const out = formatGscQueue(dir, NOW);
    expect(out).toContain('Pending: *2*  (high 1 · normal 1)');
    expect(out).toContain('Deferred (quota overflow): 1');
    expect(out).toContain('Oldest pending: 2026-06-20');
    expect(out).toContain('Submitted today (Indexing API): *7/200* · 193 left');
  });

  it('handles a missing queue file', () => {
    expect(formatGscQueue(path.join(dir, 'nope'), NOW)).toContain(
      'no queue file found',
    );
  });
});

describe('formatScoreboard', () => {
  it('sorts roles by avg_score and sums GSC totals', () => {
    const out = formatScoreboard(dir);
    const authIdx = out.indexOf('authority');
    const reachIdx = out.indexOf('reach');
    expect(authIdx).toBeGreaterThan(-1);
    expect(authIdx).toBeLessThan(reachIdx); // higher score sorts first
    expect(out).toContain('authority: 19 pages · avg 0.90 (18 scored)');
    expect(out).toContain('Σ 2 pages · 4 clicks · 150 impressions');
  });
});

describe('command matching', () => {
  it('recognizes commands with and without an @mention', () => {
    expect(isSeoCommand('gsc')).toBe(true);
    expect(isSeoCommand('@Mr Gru scoreboard', 'Mr Gru')).toBe(true);
    expect(isSeoCommand('queue?')).toBe(true);
    expect(isSeoCommand('hello there')).toBe(false);
  });

  it('routes each keyword to the right report', () => {
    expect(seoCommandReply('gsc', undefined, dir, NOW)).toContain(
      'GSC reindex queue',
    );
    expect(seoCommandReply('scoreboard', undefined, dir, NOW)).toContain(
      'SEO scoreboard',
    );
    const both = seoCommandReply('seo', undefined, dir, NOW)!;
    expect(both).toContain('GSC reindex queue');
    expect(both).toContain('SEO scoreboard');
    expect(seoCommandReply('nope', undefined, dir, NOW)).toBeNull();
  });
});
