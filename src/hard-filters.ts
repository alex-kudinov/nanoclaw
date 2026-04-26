/**
 * Hard filters — host-level drop rules that reject inbound emails before
 * any container or LLM is invoked. Rules are stored in a JSON file and
 * cached in memory. Pattern matching mirrors classify-rules-runner.ts
 * evalRule() for consistency.
 */

import fs from 'fs';

import { HARD_FILTERS_FILE } from './config.js';
import { logger } from './logger.js';

export type HardFilterInput = {
  senderEmail: string;
  subject?: string;
  headers?: Record<string, string>;
};

export interface HardFilter {
  id: string;
  pattern_type:
    | 'sender_exact'
    | 'sender_regex'
    | 'subject_regex'
    | 'header_match';
  pattern_value: string;
  reason: string;
  enabled: boolean;
  drop_count: number;
  created_at: string;
}

interface HardFiltersFile {
  version?: number;
  filters: HardFilter[];
}

// --------------- cache ---------------

let cached: HardFilter[] | null = null;

function parseFiltersFile(raw: string): HardFilter[] {
  const parsed: HardFiltersFile = JSON.parse(raw);
  if (!Array.isArray(parsed.filters)) return [];
  return parsed.filters;
}

export function loadFilters(): HardFilter[] {
  if (cached) return cached;
  try {
    const raw = fs.readFileSync(HARD_FILTERS_FILE, 'utf-8');
    cached = parseFiltersFile(raw);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      cached = [];
    } else {
      logger.error({ err }, 'hard-filters: failed to load');
      cached = [];
    }
  }
  return cached;
}

export function reloadFilters(): void {
  cached = null;
}

// --------------- matching ---------------

function evalFilter(
  f: HardFilter,
  input: HardFilterInput,
  senderLower: string,
): boolean {
  switch (f.pattern_type) {
    case 'sender_exact':
      return senderLower === f.pattern_value.toLowerCase();
    case 'sender_regex':
      return new RegExp(f.pattern_value, 'i').test(senderLower);
    case 'subject_regex':
      if (!input.subject) return false;
      return new RegExp(f.pattern_value, 'i').test(input.subject);
    case 'header_match': {
      if (!input.headers) return false;
      const colonIdx = f.pattern_value.indexOf(':');
      if (colonIdx <= 0) return false;
      const hname = f.pattern_value.slice(0, colonIdx).trim().toLowerCase();
      const hvalue = f.pattern_value
        .slice(colonIdx + 1)
        .trim()
        .toLowerCase();
      const actual = input.headers[hname];
      if (!actual) return false;
      return actual.toLowerCase().includes(hvalue);
    }
  }
}

export function matchHardFilter(input: HardFilterInput): HardFilter | null {
  const filters = loadFilters();
  const senderLower = input.senderEmail.toLowerCase();
  for (const f of filters) {
    if (!f.enabled) continue;
    try {
      if (evalFilter(f, input, senderLower)) return f;
    } catch (err) {
      logger.warn(
        { filterId: f.id, err },
        'hard-filters: eval failed, skipping',
      );
    }
  }
  return null;
}

// --------------- persistence ---------------

export function incrementDropCount(id: string): void {
  const filters = loadFilters();
  const target = filters.find((f) => f.id === id);
  if (!target) return;
  target.drop_count += 1;
  const file: HardFiltersFile = { version: 1, filters };
  fs.writeFileSync(HARD_FILTERS_FILE, JSON.stringify(file, null, 2) + '\n');
}
