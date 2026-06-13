import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  selectTokenOrder,
  applyTokenEvents,
  isParked,
  readCooldowns,
  writeCooldowns,
  COOLDOWN_MS,
  type CooldownMap,
  type PoolToken,
} from './token-cooldown.js';

const POOL: PoolToken[] = [
  { name: 'alex', token: 'tok-a' },
  { name: 'info', token: 'tok-i' },
  { name: 'cnpc', token: 'tok-c' },
];
const NOW = 1_000_000_000_000;

describe('isParked', () => {
  it('is parked while until is in the future', () => {
    expect(isParked({ until: NOW + 1000, reason: 'credit' }, NOW)).toBe(true);
  });
  it('is not parked once until has passed', () => {
    expect(isParked({ until: NOW - 1, reason: 'credit' }, NOW)).toBe(false);
  });
  it('is not parked when undefined', () => {
    expect(isParked(undefined, NOW)).toBe(false);
  });
});

describe('selectTokenOrder', () => {
  it('lazy: returns only live tokens, skipping parked ones', () => {
    const cd: CooldownMap = { info: { until: NOW + 10_000, reason: 'credit' } };
    const sel = selectTokenOrder(POOL, cd, 'lazy', NOW);
    expect(sel.ordered.map((t) => t.name)).toEqual(['alex', 'cnpc']);
    expect(sel.primary?.name).toBe('alex');
    expect(sel.allParked).toBe(false);
  });

  it('lazy: hands nothing when every token is parked (→ API key)', () => {
    const cd: CooldownMap = {
      alex: { until: NOW + 1, reason: 'credit' },
      info: { until: NOW + 1, reason: 'credit' },
      cnpc: { until: NOW + 1, reason: 'credit' },
    };
    const sel = selectTokenOrder(POOL, cd, 'lazy', NOW);
    expect(sel.ordered).toEqual([]);
    expect(sel.primary).toBeNull();
    expect(sel.allParked).toBe(true);
  });

  it('eager: tries every token, live ones first then parked (free probe)', () => {
    const cd: CooldownMap = { alex: { until: NOW + 10_000, reason: 'credit' } };
    const sel = selectTokenOrder(POOL, cd, 'eager', NOW);
    expect(sel.ordered.map((t) => t.name)).toEqual(['info', 'cnpc', 'alex']);
    expect(sel.primary?.name).toBe('info');
    expect(sel.allParked).toBe(false);
  });

  it('eager: still tries all tokens even when all are parked', () => {
    const cd: CooldownMap = {
      alex: { until: NOW + 1, reason: 'credit' },
      info: { until: NOW + 1, reason: 'credit' },
      cnpc: { until: NOW + 1, reason: 'credit' },
    };
    const sel = selectTokenOrder(POOL, cd, 'eager', NOW);
    expect(sel.ordered.map((t) => t.name)).toEqual(['alex', 'info', 'cnpc']);
    expect(sel.allParked).toBe(true); // host still stages the key as last resort
  });

  it('expired cooldown makes a token live again (renewal auto-probe)', () => {
    const cd: CooldownMap = { info: { until: NOW - 1, reason: 'credit' } };
    const sel = selectTokenOrder(POOL, cd, 'lazy', NOW);
    expect(sel.ordered.map((t) => t.name)).toEqual(['alex', 'info', 'cnpc']);
  });
});

describe('applyTokenEvents', () => {
  it('parks a failed token for the reason-appropriate duration', () => {
    const out = applyTokenEvents({}, [{ name: 'alex', reason: 'credit' }], NOW);
    expect(out.alex).toEqual({ until: NOW + COOLDOWN_MS.credit, reason: 'credit' });
  });

  it('clears a token cooldown on success (renewal propagates to lazy minions)', () => {
    const cd: CooldownMap = { alex: { until: NOW + 10_000, reason: 'credit' } };
    const out = applyTokenEvents(cd, [{ name: 'alex', ok: true }], NOW);
    expect(out.alex).toBeUndefined();
  });

  it('latest event wins: failure then success un-parks', () => {
    const out = applyTokenEvents(
      {},
      [{ name: 'alex', reason: 'rate' }, { name: 'alex', ok: true }],
      NOW,
    );
    expect(out.alex).toBeUndefined();
  });

  it('never parks the api-key sentinel', () => {
    const out = applyTokenEvents({}, [{ name: 'api-key', reason: 'auth' }], NOW);
    expect(out['api-key']).toBeUndefined();
  });

  it('different reasons get different durations', () => {
    const out = applyTokenEvents(
      {},
      [{ name: 'alex', reason: 'rate' }, { name: 'info', reason: 'auth' }],
      NOW,
    );
    expect(out.alex.until).toBe(NOW + COOLDOWN_MS.rate);
    expect(out.info.until).toBe(NOW + COOLDOWN_MS.auth);
  });
});

describe('readCooldowns / writeCooldowns', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  it('round-trips a cooldown map', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-'));
    dirs.push(dir);
    const map: CooldownMap = { alex: { until: NOW, reason: 'credit' } };
    writeCooldowns(dir, map);
    expect(readCooldowns(dir)).toEqual(map);
  });

  it('returns {} when the file is missing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-'));
    dirs.push(dir);
    expect(readCooldowns(dir)).toEqual({});
  });

  it('returns {} when the file is corrupt', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-'));
    dirs.push(dir);
    fs.writeFileSync(cooldownFile(dir), 'not json{');
    expect(readCooldowns(dir)).toEqual({});
  });
});

function cooldownFile(dir: string): string {
  return path.join(dir, '.token-cooldowns.json');
}
