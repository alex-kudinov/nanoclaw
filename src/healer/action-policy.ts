/**
 * One fail-closed policy for model-authored healer actions.
 *
 * Collection, heartbeat, digest, and read-only diagnosis do not consult this
 * policy. Anything that can execute a model-proposed host command,
 * automatically rerun model-selected work, or dispatch the code-implementation
 * pipeline must pass this boundary.
 *
 * The fixed, host-authored launchctl daemon recovery has a separate default-on
 * switch so a dark deployment does not remove the existing availability
 * safeguard. HEALER_QUIET remains the common emergency stop.
 *
 * Enabling actions requires all three:
 *   1. HEALER_ACTIONS_ENABLED=1
 *   2. at least one explicitly named Slack operator
 *   3. a non-empty action epoch
 *
 * The epoch is copied onto each newly posted proposal. Rotating it invalidates
 * every older Slack reaction/reply without deleting the incident audit record.
 */

import type { ProposedFix } from './remediation.js';

const DEFAULT_APPROVAL_TTL_MS = 24 * 60 * 60_000;
const MIN_APPROVAL_TTL_MS = 60_000;
const MAX_APPROVAL_TTL_MS = 7 * 24 * 60 * 60_000;

export interface HealerActionPolicy {
  enabled: boolean;
  epoch: string | null;
  operatorUids: ReadonlySet<string>;
  reason:
    | 'enabled'
    | 'quiet'
    | 'disabled'
    | 'missing_epoch'
    | 'missing_operators';
}

/** Comma/space-separated operator UIDs; singular key remains a compatibility alias. */
export function configuredOperatorUids(
  env: NodeJS.ProcessEnv = process.env,
): ReadonlySet<string> {
  const raw = [env.HEALER_OPERATOR_UIDS, env.HEALER_OPERATOR_UID]
    .filter(Boolean)
    .join(',');
  return new Set(
    raw
      .split(/[\s,]+/)
      .map((x) => x.trim())
      .filter(Boolean),
  );
}

/** Effective action policy. Missing controls always fail closed. */
export function currentActionPolicy(
  env: NodeJS.ProcessEnv = process.env,
): HealerActionPolicy {
  const operatorUids = configuredOperatorUids(env);
  const epoch = env.HEALER_ACTION_EPOCH?.trim() || null;
  if (env.HEALER_QUIET === '1') {
    return { enabled: false, epoch, operatorUids, reason: 'quiet' };
  }
  if (env.HEALER_ACTIONS_ENABLED !== '1') {
    return { enabled: false, epoch, operatorUids, reason: 'disabled' };
  }
  if (!epoch) {
    return { enabled: false, epoch, operatorUids, reason: 'missing_epoch' };
  }
  if (operatorUids.size === 0) {
    return { enabled: false, epoch, operatorUids, reason: 'missing_operators' };
  }
  return { enabled: true, epoch, operatorUids, reason: 'enabled' };
}

export function healerActionsEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return currentActionPolicy(env).enabled;
}

/**
 * Fixed daemon recovery is enabled by default to preserve current availability.
 * It accepts no model input and remains capped and idempotent in the collector.
 */
export function healerRestartEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.HEALER_QUIET !== '1' && env.HEALER_RESTART_ENABLED !== '0';
}

/** Exact named-human authorization. There is deliberately no "any non-bot" fallback. */
export function isNamedOperator(
  uid: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return !!uid && configuredOperatorUids(env).has(uid);
}

/** A proposal is executable only in the exact action epoch that created it. */
export function fixBoundToCurrentEpoch(
  fix: ProposedFix | null,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const policy = currentActionPolicy(env);
  return (
    policy.enabled && !!fix?.approval_nonce && fix.action_epoch === policy.epoch
  );
}

/** Epoch/nonce plus a fresh host timestamp. Old Slack signals cannot replay. */
export function fixApprovalIsCurrent(
  fix: ProposedFix | null,
  now = Date.now(),
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!fixBoundToCurrentEpoch(fix, env)) return false;
  const created = Date.parse(fix?.approval_created_at ?? '');
  const age = now - created;
  return Number.isFinite(created) && age >= 0 && age <= approvalTtlMs(env);
}

/** Approval lifetime, bounded so a typo cannot create permanent or instant approvals. */
export function approvalTtlMs(env: NodeJS.ProcessEnv = process.env): number {
  if (!env.HEALER_APPROVAL_TTL_MS?.trim()) return DEFAULT_APPROVAL_TTL_MS;
  const parsed = Number(env.HEALER_APPROVAL_TTL_MS);
  if (!Number.isFinite(parsed)) return DEFAULT_APPROVAL_TTL_MS;
  return Math.min(
    MAX_APPROVAL_TTL_MS,
    Math.max(MIN_APPROVAL_TTL_MS, Math.floor(parsed)),
  );
}

/** Phase-3 implementation has its own secondary switch under the global gate. */
export function healerImplementationEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return healerActionsEnabled(env) && env.HEALER_IMPLEMENT_ENABLED === '1';
}
