/**
 * Circuit Breaker for container agent spawning.
 *
 * Prevents a broken group from consuming concurrency slots with rapid retries.
 * After FAILURE_THRESHOLD consecutive failures, the circuit opens and blocks
 * new spawns for COOLDOWN_MS. After cooldown, one "half-open" attempt is
 * allowed — if it succeeds the circuit closes, if it fails it re-opens.
 *
 * Keyed by groupFolder (e.g. "inbox", "sales") so all threads for a group
 * share the same circuit state.
 */
import { logger } from './logger.js';

const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 120_000; // 2 minutes

interface CircuitState {
  failures: number;
  openedAt: number | null; // timestamp when circuit opened, null = closed
  halfOpen: boolean;
}

const circuits = new Map<string, CircuitState>();

// T10: cooldown auto-recheck — when a circuit opens, schedule a callback
// to fire when the cooldown expires so messages that arrived during the
// open window get processed without waiting for a NEW inbound message.
let cooldownCallback: ((groupFolder: string) => void) | null = null;
const cooldownTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function setOnCooldownExpiry(fn: (groupFolder: string) => void): void {
  cooldownCallback = fn;
}

function scheduleCooldownExpiry(groupFolder: string): void {
  if (!cooldownCallback) {
    // Callback not registered yet — DB re-query on the next inbound
    // message will still pick up pending work, just less promptly.
    return;
  }
  if (COOLDOWN_MS <= 0) {
    logger.warn({ COOLDOWN_MS }, 'COOLDOWN_MS <= 0, skipping cooldown timer');
    return;
  }
  // Idempotent: replace any existing timer for this group folder so
  // multiple rapid failures don't queue duplicate rechecks.
  const existing = cooldownTimers.get(groupFolder);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    cooldownTimers.delete(groupFolder);
    if (!cooldownCallback) return;
    try {
      cooldownCallback(groupFolder);
    } catch (err) {
      logger.error({ err, groupFolder }, 'Cooldown expiry callback threw');
    }
  }, COOLDOWN_MS);
  cooldownTimers.set(groupFolder, timer);
}

function getState(groupFolder: string): CircuitState {
  let state = circuits.get(groupFolder);
  if (!state) {
    state = { failures: 0, openedAt: null, halfOpen: false };
    circuits.set(groupFolder, state);
  }
  return state;
}

/**
 * Check if the circuit is open (blocking spawns) for a group.
 * Returns true if blocked, false if spawn is allowed.
 */
export function isCircuitOpen(groupFolder: string): boolean {
  const state = getState(groupFolder);

  if (state.openedAt === null) return false;

  const elapsed = Date.now() - state.openedAt;
  if (elapsed >= COOLDOWN_MS) {
    // Cooldown expired — enter half-open: allow one probe attempt
    state.halfOpen = true;
    logger.info(
      { group: groupFolder, cooldownMs: elapsed },
      'Circuit half-open, allowing probe attempt',
    );
    return false;
  }

  return true;
}

/**
 * Record a successful container run. Resets the circuit to closed.
 */
export function recordSuccess(groupFolder: string): void {
  const state = getState(groupFolder);
  if (state.openedAt !== null || state.failures > 0) {
    logger.info(
      { group: groupFolder, previousFailures: state.failures },
      'Circuit closed after success',
    );
  }
  state.failures = 0;
  state.openedAt = null;
  state.halfOpen = false;
  // Cancel any pending cooldown auto-recheck since the circuit closed naturally
  const pending = cooldownTimers.get(groupFolder);
  if (pending) {
    clearTimeout(pending);
    cooldownTimers.delete(groupFolder);
  }
}

/**
 * Record a failed container run. Opens the circuit after threshold.
 */
export function recordFailure(groupFolder: string): void {
  const state = getState(groupFolder);
  state.failures++;

  if (state.halfOpen) {
    // Half-open probe failed — re-open with fresh cooldown
    state.openedAt = Date.now();
    state.halfOpen = false;
    logger.warn(
      { group: groupFolder, failures: state.failures },
      'Circuit re-opened after half-open probe failed',
    );
    scheduleCooldownExpiry(groupFolder);
    return;
  }

  if (state.failures >= FAILURE_THRESHOLD && state.openedAt === null) {
    state.openedAt = Date.now();
    logger.warn(
      { group: groupFolder, failures: state.failures, cooldownMs: COOLDOWN_MS },
      'Circuit opened — group blocked for cooldown period',
    );
    scheduleCooldownExpiry(groupFolder);
  }
}

/** Get current circuit status for diagnostics. */
export function getCircuitStatus(): Record<
  string,
  {
    failures: number;
    open: boolean;
    halfOpen: boolean;
    cooldownRemainingMs: number | null;
  }
> {
  const result: Record<string, any> = {};
  for (const [folder, state] of circuits) {
    const open =
      state.openedAt !== null && Date.now() - state.openedAt < COOLDOWN_MS;
    result[folder] = {
      failures: state.failures,
      open,
      halfOpen: state.halfOpen,
      cooldownRemainingMs: open
        ? COOLDOWN_MS - (Date.now() - state.openedAt!)
        : null,
    };
  }
  return result;
}
