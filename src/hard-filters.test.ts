import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.mock factories are hoisted — cannot reference local `const` vars.
// Compute a stable path inside the factory using the same modules.
vi.mock('./config.js', async () => {
  const _os = await import('os');
  const _path = await import('path');
  const _fs = await import('fs');
  const dir = _fs.mkdtempSync(_path.join(_os.tmpdir(), 'hf-cfg-'));
  return { HARD_FILTERS_FILE: _path.join(dir, 'hard-filters.json') };
});
vi.mock('./logger.js', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { HARD_FILTERS_FILE } from './config.js';
import {
  loadFilters,
  reloadFilters,
  matchHardFilter,
  incrementDropCount,
  type HardFilter,
} from './hard-filters.js';

function writeFilters(filters: HardFilter[]): void {
  fs.writeFileSync(
    HARD_FILTERS_FILE,
    JSON.stringify({ version: 1, filters }, null, 2),
  );
}

function makeFilter(overrides: Partial<HardFilter> = {}): HardFilter {
  return {
    id: 'f1',
    pattern_type: 'sender_exact',
    pattern_value: 'spam@example.com',
    reason: 'spam',
    enabled: true,
    drop_count: 0,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  reloadFilters();
});

afterEach(() => {
  if (fs.existsSync(HARD_FILTERS_FILE)) fs.unlinkSync(HARD_FILTERS_FILE);
});

describe('loadFilters', () => {
  it('returns empty array for empty filters file', () => {
    writeFilters([]);
    expect(loadFilters()).toEqual([]);
  });

  it('returns empty array on ENOENT', () => {
    expect(loadFilters()).toEqual([]);
  });

  it('caches until reloadFilters is called', () => {
    writeFilters([makeFilter()]);
    const first = loadFilters();
    expect(first).toHaveLength(1);

    writeFilters([makeFilter(), makeFilter({ id: 'f2' })]);
    expect(loadFilters()).toHaveLength(1); // still cached

    reloadFilters();
    expect(loadFilters()).toHaveLength(2); // fresh read
  });
});

describe('matchHardFilter', () => {
  it('matches sender_exact case-insensitively', () => {
    writeFilters([makeFilter({ pattern_value: 'Spam@Example.COM' })]);
    const hit = matchHardFilter({ senderEmail: 'spam@example.com' });
    expect(hit).not.toBeNull();
    expect(hit!.id).toBe('f1');
  });

  it('matches sender_regex', () => {
    writeFilters([
      makeFilter({
        id: 'rx',
        pattern_type: 'sender_regex',
        pattern_value: '@spam\\.example\\.com$',
      }),
    ]);
    const hit = matchHardFilter({ senderEmail: 'news@spam.example.com' });
    expect(hit).not.toBeNull();
    expect(hit!.id).toBe('rx');
  });

  it('matches subject_regex', () => {
    writeFilters([
      makeFilter({
        id: 'subj',
        pattern_type: 'subject_regex',
        pattern_value: '^Unsubscribe',
      }),
    ]);
    const hit = matchHardFilter({
      senderEmail: 'any@x.com',
      subject: 'Unsubscribe confirmation',
    });
    expect(hit).not.toBeNull();
    expect(hit!.id).toBe('subj');
  });

  it('matches header_match', () => {
    writeFilters([
      makeFilter({
        id: 'hdr',
        pattern_type: 'header_match',
        pattern_value: 'List-Unsubscribe: mailto:',
      }),
    ]);
    const hit = matchHardFilter({
      senderEmail: 'news@outlet.com',
      headers: { 'list-unsubscribe': '<mailto:unsub@outlet.com>' },
    });
    expect(hit).not.toBeNull();
    expect(hit!.id).toBe('hdr');
  });

  it('returns null when no filter matches', () => {
    writeFilters([makeFilter({ pattern_value: 'other@x.com' })]);
    const hit = matchHardFilter({ senderEmail: 'nope@y.com' });
    expect(hit).toBeNull();
  });

  it('skips disabled filters', () => {
    writeFilters([makeFilter({ enabled: false })]);
    const hit = matchHardFilter({ senderEmail: 'spam@example.com' });
    expect(hit).toBeNull();
  });

  it('skips bad regex and continues', () => {
    writeFilters([
      makeFilter({
        id: 'bad',
        pattern_type: 'sender_regex',
        pattern_value: '[unclosed',
      }),
      makeFilter({ id: 'good', pattern_value: 'spam@example.com' }),
    ]);
    const hit = matchHardFilter({ senderEmail: 'spam@example.com' });
    expect(hit).not.toBeNull();
    expect(hit!.id).toBe('good');
  });
});

describe('incrementDropCount', () => {
  it('increments drop_count and persists to file', () => {
    writeFilters([makeFilter({ drop_count: 3 })]);
    reloadFilters();
    incrementDropCount('f1');

    const raw = JSON.parse(fs.readFileSync(HARD_FILTERS_FILE, 'utf-8'));
    expect(raw.filters[0].drop_count).toBe(4);
  });

  it('does nothing for unknown id', () => {
    writeFilters([makeFilter()]);
    reloadFilters();
    incrementDropCount('nonexistent');
    const raw = JSON.parse(fs.readFileSync(HARD_FILTERS_FILE, 'utf-8'));
    expect(raw.filters[0].drop_count).toBe(0);
  });
});
