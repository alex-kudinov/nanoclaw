import { describe, expect, it } from 'vitest';

import {
  approvalTtlMs,
  configuredOperatorUids,
  currentActionPolicy,
  fixApprovalIsCurrent,
  fixBoundToCurrentEpoch,
  healerImplementationEnabled,
  healerRestartEnabled,
  isNamedOperator,
} from './action-policy.js';

function enabledEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    HEALER_ACTIONS_ENABLED: '1',
    HEALER_ACTION_EPOCH: 'release-7',
    HEALER_OPERATOR_UIDS: 'U12345678',
    ...extra,
  };
}

describe('currentActionPolicy', () => {
  it('defaults every action off', () => {
    expect(currentActionPolicy({})).toMatchObject({
      enabled: false,
      reason: 'disabled',
    });
  });

  it('requires an epoch and at least one named operator', () => {
    expect(
      currentActionPolicy({
        HEALER_ACTIONS_ENABLED: '1',
        HEALER_OPERATOR_UIDS: 'U12345678',
      }).reason,
    ).toBe('missing_epoch');
    expect(
      currentActionPolicy({
        HEALER_ACTIONS_ENABLED: '1',
        HEALER_ACTION_EPOCH: 'release-7',
      }).reason,
    ).toBe('missing_operators');
  });

  it('makes quiet mode a complete action kill switch', () => {
    expect(
      currentActionPolicy(enabledEnv({ HEALER_QUIET: '1' })),
    ).toMatchObject({ enabled: false, reason: 'quiet' });
  });

  it('enables only when every fail-closed control is present', () => {
    expect(currentActionPolicy(enabledEnv())).toMatchObject({
      enabled: true,
      epoch: 'release-7',
      reason: 'enabled',
    });
  });
});

describe('operator and proposal binding', () => {
  it('parses plural and legacy singular operator keys without a broad fallback', () => {
    const env = {
      HEALER_OPERATOR_UIDS: 'U12345678, U87654321',
      HEALER_OPERATOR_UID: 'U11111111',
    };
    expect([...configuredOperatorUids(env)]).toEqual([
      'U12345678',
      'U87654321',
      'U11111111',
    ]);
    expect(isNamedOperator('U87654321', env)).toBe(true);
    expect(isNamedOperator('U99999999', env)).toBe(false);
    expect(isNamedOperator('U99999999', {})).toBe(false);
  });

  it('rejects missing, stale-epoch, and disabled proposal bindings', () => {
    const fix = {
      kind: 'command' as const,
      summary: 'safe action',
      approval_nonce: 'nonce-1',
      action_epoch: 'release-7',
      approval_created_at: '2026-07-30T12:00:00.000Z',
    };
    expect(fixBoundToCurrentEpoch(fix, enabledEnv())).toBe(true);
    expect(
      fixBoundToCurrentEpoch(
        { ...fix, action_epoch: 'release-6' },
        enabledEnv(),
      ),
    ).toBe(false);
    expect(
      fixBoundToCurrentEpoch(
        { ...fix, approval_nonce: undefined },
        enabledEnv(),
      ),
    ).toBe(false);
    expect(fixBoundToCurrentEpoch(fix, {})).toBe(false);
  });

  it('expires an otherwise valid proposal after the bounded TTL', () => {
    const fix = {
      kind: 'command' as const,
      summary: 'safe action',
      approval_nonce: 'nonce-1',
      action_epoch: 'release-7',
      approval_created_at: '2026-07-30T12:00:00.000Z',
    };
    const env = enabledEnv({ HEALER_APPROVAL_TTL_MS: '60000' });
    expect(
      fixApprovalIsCurrent(fix, Date.parse('2026-07-30T12:00:30.000Z'), env),
    ).toBe(true);
    expect(
      fixApprovalIsCurrent(fix, Date.parse('2026-07-30T12:01:01.000Z'), env),
    ).toBe(false);
    expect(
      fixApprovalIsCurrent(fix, Date.parse('2026-07-30T11:59:59.000Z'), env),
    ).toBe(false);
  });
});

describe('secondary controls', () => {
  it('bounds approval lifetime', () => {
    expect(approvalTtlMs({})).toBe(24 * 60 * 60_000);
    expect(approvalTtlMs({ HEALER_APPROVAL_TTL_MS: '' })).toBe(
      24 * 60 * 60_000,
    );
    expect(approvalTtlMs({ HEALER_APPROVAL_TTL_MS: '1' })).toBe(60_000);
    expect(approvalTtlMs({ HEALER_APPROVAL_TTL_MS: '9999999999' })).toBe(
      7 * 24 * 60 * 60_000,
    );
  });

  it('requires both the global and implementation switches', () => {
    expect(
      healerImplementationEnabled(
        enabledEnv({ HEALER_IMPLEMENT_ENABLED: '1' }),
      ),
    ).toBe(true);
    expect(healerImplementationEnabled({ HEALER_IMPLEMENT_ENABLED: '1' })).toBe(
      false,
    );
  });

  it('keeps fixed daemon recovery on by default with explicit and quiet stops', () => {
    expect(healerRestartEnabled({})).toBe(true);
    expect(healerRestartEnabled({ HEALER_RESTART_ENABLED: '0' })).toBe(false);
    expect(
      healerRestartEnabled({
        HEALER_RESTART_ENABLED: '1',
        HEALER_QUIET: '1',
      }),
    ).toBe(false);
  });
});
