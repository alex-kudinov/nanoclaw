// Persistent per-token cooldown for the minion OAuth pool.
//
// Each Claude account's Agent SDK credit pool is prepaid and monthly; we want to
// exhaust all of it across every account before spending a cent on the metered
// API key. A token that fails is parked in a cooldown so subsequent minion calls
// skip it instantly (no per-call retry-through) — and the cooldown EXPIRES, so a
// renewed account is automatically re-probed and preferred over the API key again.
//
// Two consumption policies (per minion, see config.EAGER_TOKEN_PROBE_GROUPS):
//   - lazy  (default): trust the cooldown — skip parked tokens, fall to the key
//                      only when every token is parked. Fast; cheap minions.
//   - eager (heavy):   ignore the cooldown — try every token before the key, so a
//                      quietly-renewed account is found before a costly API call.
//
// A 402 credit-exhausted probe is rejected before inference (unbilled), so eager
// probing is free; its only cost is a little latency on the heavy job.

import fs from 'fs';
import path from 'path';

export type CooldownReason = 'rate' | 'credit' | 'auth';

export interface TokenCooldown {
  until: number; // epoch ms; token is parked until this instant
  reason: CooldownReason;
}

export interface PoolToken {
  name: string;
  token: string;
}

export interface TokenEvent {
  name: string;
  ok?: boolean; // credential served a request — clear any cooldown
  reason?: CooldownReason; // credential failed — park it
}

export type CooldownMap = Record<string, TokenCooldown>;

const COOLDOWN_FILE = '.token-cooldowns.json';

// Re-probe cadence by failure reason. Credit = the user-approved 6h lazy cadence
// (monthly renewal, re-checked every 6h). Rate = the interactive window resets
// within hours. Auth = token rejected/invalid, likely needs attention, parked
// longer. All are just *re-probe* intervals — a renewed token clears immediately.
export const COOLDOWN_MS: Record<CooldownReason, number> = {
  rate: 60 * 60 * 1000, // 1h
  credit: 6 * 60 * 60 * 1000, // 6h
  auth: 12 * 60 * 60 * 1000, // 12h
};

export function cooldownPath(dataDir: string): string {
  return path.join(dataDir, COOLDOWN_FILE);
}

export function readCooldowns(dataDir: string): CooldownMap {
  try {
    const raw = fs.readFileSync(cooldownPath(dataDir), 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as CooldownMap) : {};
  } catch {
    return {}; // missing/corrupt → treat every token as available
  }
}

export function writeCooldowns(dataDir: string, map: CooldownMap): void {
  const tmp = `${cooldownPath(dataDir)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(map, null, 2));
  fs.renameSync(tmp, cooldownPath(dataDir)); // atomic swap
}

export function isParked(
  cd: TokenCooldown | undefined,
  now: number,
): boolean {
  return cd !== undefined && cd.until > now;
}

export interface TokenSelection {
  ordered: PoolToken[]; // order the container should try tokens in
  primary: PoolToken | null; // first credential to use (null → go straight to key)
  allParked: boolean; // every token is currently cooled down
}

// Decide which tokens a container should be handed, and in what order.
//   eager: every token, live ones first then parked (parked = free renewal probe)
//   lazy : only live tokens; if none, hand nothing (container uses the API key)
export function selectTokenOrder(
  pool: PoolToken[],
  cooldowns: CooldownMap,
  policy: 'eager' | 'lazy',
  now: number,
): TokenSelection {
  const live = pool.filter((t) => !isParked(cooldowns[t.name], now));
  const parked = pool.filter((t) => isParked(cooldowns[t.name], now));
  const allParked = pool.length > 0 && live.length === 0;

  const ordered = policy === 'eager' ? [...live, ...parked] : live;
  return { ordered, primary: ordered[0] ?? null, allParked };
}

// Fold the container's reported token outcomes into the cooldown map.
// A success clears that token (renewal/health); a failure parks it by reason.
// The latest event for a token wins, so an ok after a failure un-parks it.
export function applyTokenEvents(
  cooldowns: CooldownMap,
  events: TokenEvent[],
  now: number,
): CooldownMap {
  const next: CooldownMap = { ...cooldowns };
  for (const ev of events) {
    if (!ev.name || ev.name === 'api-key') continue; // never park the API key
    if (ev.ok) {
      delete next[ev.name];
    } else if (ev.reason) {
      next[ev.name] = { until: now + COOLDOWN_MS[ev.reason], reason: ev.reason };
    }
  }
  return next;
}
