#!/usr/bin/env tsx
/**
 * email-ops filter — manage hard-filters.json (host-level drop rules).
 *
 *   list                             Show all hard filters
 *   add --type TYPE --value VALUE --reason REASON
 *   disable ID
 *   enable ID
 *   stats                            Drop counts + recent drop log
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { HARD_FILTERS_FILE, DATA_DIR } from '../src/config.js';
import type { HardFilter } from '../src/hard-filters.js';

interface FiltersFile {
  version?: number;
  filters: HardFilter[];
  [key: string]: unknown;
}

const DROPS_LOG = path.join(DATA_DIR, 'hard-filter-drops.log');

function loadFiltersFile(): FiltersFile {
  try {
    return JSON.parse(fs.readFileSync(HARD_FILTERS_FILE, 'utf-8'));
  } catch {
    return { version: 1, filters: [] };
  }
}

function saveFiltersFile(file: FiltersFile): void {
  fs.writeFileSync(HARD_FILTERS_FILE, JSON.stringify(file, null, 2) + '\n');
}

interface Args {
  action: string | null;
  type?: string;
  value?: string;
  reason?: string;
  id?: string;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { action: argv[0] || null };
  if (out.action === 'disable' || out.action === 'enable') out.id = argv[1];
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--type': out.type = next(); break;
      case '--value': out.value = next(); break;
      case '--reason': out.reason = next(); break;
    }
  }
  return out;
}

function usage(): void {
  console.error(`email-ops filter <action>

Actions:
  list                                   Show all hard filters
  add --type TYPE --value VALUE --reason REASON
  disable ID                             Disable a filter
  enable ID                              Enable a filter
  stats                                  Drop counts + recent log`);
}

function cmdList(): void {
  const file = loadFiltersFile();
  if (!file.filters.length) { console.log('No hard filters defined.'); return; }
  console.log('id                                    en  type           drops  reason');
  for (const f of file.filters) {
    const en = f.enabled ? ' Y' : ' N';
    const type = f.pattern_type.padEnd(13);
    const drops = f.drop_count.toString().padStart(5);
    const reason = (f.reason || '').slice(0, 40);
    console.log(`${f.id}  ${en}  ${type}  ${drops}  ${reason}`);
    console.log(`  pattern: ${f.pattern_value}`);
  }
}

function cmdAdd(args: Args): void {
  if (!args.type || !args.value || !args.reason) {
    console.error('email-ops filter add: --type, --value, and --reason required');
    process.exit(1);
  }
  const file = loadFiltersFile();
  const filter: HardFilter = {
    id: crypto.randomUUID(),
    pattern_type: args.type as HardFilter['pattern_type'],
    pattern_value: args.value,
    reason: args.reason,
    enabled: true,
    drop_count: 0,
    created_at: new Date().toISOString(),
  };
  file.filters.push(filter);
  saveFiltersFile(file);
  console.log(`Filter ${filter.id} added: ${args.type} "${args.value}"`);
}

function cmdToggle(id: string | undefined, enable: boolean): void {
  if (!id) { console.error('email-ops filter: ID required'); process.exit(1); }
  const file = loadFiltersFile();
  const f = file.filters.find((x) => x.id === id);
  if (!f) { console.error(`No filter with id ${id}`); process.exit(1); }
  f.enabled = enable;
  saveFiltersFile(file);
  console.log(`Filter ${id} → ${enable ? 'enabled' : 'disabled'}`);
}

function cmdStats(): void {
  const file = loadFiltersFile();
  if (file.filters.length) {
    console.log('Filter drop counts:');
    for (const f of file.filters) {
      console.log(`  ${f.id}  ${f.drop_count.toString().padStart(5)} drops  ${f.reason}`);
    }
  } else {
    console.log('No hard filters defined.');
  }
  console.log('');
  if (fs.existsSync(DROPS_LOG)) {
    const lines = fs.readFileSync(DROPS_LOG, 'utf-8').trim().split('\n');
    const tail = lines.slice(-20);
    console.log(`Recent drops (last ${tail.length} of ${lines.length}):`);
    for (const l of tail) console.log(`  ${l}`);
  } else {
    console.log('No drops log found.');
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(3));
  if (!args.action || args.action === '--help') { usage(); process.exit(args.action ? 0 : 1); }
  switch (args.action) {
    case 'list': cmdList(); break;
    case 'add': cmdAdd(args); break;
    case 'disable': cmdToggle(args.id, false); break;
    case 'enable': cmdToggle(args.id, true); break;
    case 'stats': cmdStats(); break;
    default:
      console.error(`email-ops filter: unknown action "${args.action}"`);
      usage();
      process.exit(1);
  }
}

main();
