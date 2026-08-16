import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./env.js', () => ({ readEnvFile: vi.fn(() => ({})) }));

import {
  assertExternalWriteAllowed,
  buildActionEnvelope,
  evaluateExternalWrite,
  ExternalWriteDeniedError,
  fingerprintActionEnvelope,
  getActionSafetyStatus,
  resetActionSafetyDiagnosticsForTest,
  resolveActionSafetyConfig,
  sha256,
  type ActionEnvelopeV1,
} from './action-safety.js';

const OFF = resolveActionSafetyConfig({});
const ON = resolveActionSafetyConfig({
  ACTION_SAFETY_ENFORCEMENT_ENABLED: '1',
});

function envelope(overrides: Partial<ActionEnvelopeV1> = {}): ActionEnvelopeV1 {
  const built = buildActionEnvelope({
    actionId: 'NC-ACTION-001',
    idempotencyKey: 'email:NC-ACTION-001',
    nonce: 'nonce-12345678',
    system: 'gmail',
    actionClass: 'c3_external_communication',
    source: 'host:gmail-ipc',
    workItemId: 'NC-20260816-002',
    target: { recipient: 'person@example.test' },
    payload: { subject: 'Hello', body: 'Private content' },
    policyVersion: 'action-safety-v1',
    createdAt: '2026-08-16T12:00:00.000Z',
    expiresAt: '2026-08-16T12:10:00.000Z',
    approval: {
      approvalId: 'approval-123',
      operatorId: 'U12345678',
      occurredAt: '2026-08-16T12:01:00.000Z',
    },
  });
  const changed = { ...built, ...overrides };
  return overrides.fingerprint
    ? changed
    : { ...changed, fingerprint: fingerprintActionEnvelope(changed) };
}

function verifiedRequest(env = envelope()) {
  return {
    system: 'gmail',
    actionClass: 'c3_external_communication',
    source: 'host:gmail-ipc',
    envelope: env,
    binding: {
      targetSha256: sha256({ recipient: 'person@example.test' }),
      payloadSha256: sha256({ subject: 'Hello', body: 'Private content' }),
      policyVersion: 'action-safety-v1',
      approvalId: 'approval-123',
      operatorIdSha256: sha256('U12345678'),
    },
    claim: {
      state: 'unclaimed' as const,
      actionId: env.actionId,
      idempotencyKey: env.idempotencyKey,
      fingerprint: env.fingerprint,
    },
    now: new Date('2026-08-16T12:02:00.000Z'),
  };
}

beforeEach(() => resetActionSafetyDiagnosticsForTest());

describe('action safety configuration', () => {
  it('preserves current behavior by default', () => {
    const { envelope: _envelope, claim: _claim, ...legacy } = verifiedRequest();
    expect(evaluateExternalWrite(legacy, OFF)).toMatchObject({
      allowed: true,
      code: 'allowed_compatibility_mode',
    });
  });

  it('applies misconfiguration, global, then per-system brakes', () => {
    expect(
      evaluateExternalWrite(
        verifiedRequest(),
        resolveActionSafetyConfig({ EXTERNAL_WRITE_SAFE_MODE: 'maybe' }),
      ).code,
    ).toBe('misconfigured');
    expect(
      evaluateExternalWrite(
        verifiedRequest(),
        resolveActionSafetyConfig({ EXTERNAL_WRITE_SAFE_MODE: '1' }),
      ).code,
    ).toBe('global_safe_mode');
    expect(
      evaluateExternalWrite(
        verifiedRequest(),
        resolveActionSafetyConfig({
          EXTERNAL_WRITE_DISABLED_SYSTEMS: 'gmail,slack',
        }),
      ).code,
    ).toBe('system_safe_mode');
  });

  it('fails closed for unknown systems and classes', () => {
    expect(
      evaluateExternalWrite({ ...verifiedRequest(), system: 'invented' }, ON)
        .code,
    ).toBe('unknown_system');
    expect(
      evaluateExternalWrite(
        { ...verifiedRequest(), actionClass: 'c99_magic' },
        ON,
      ).code,
    ).toBe('unknown_action_class');
  });
});

describe('canonical action envelope', () => {
  it('contains hashes, not raw target or payload content', () => {
    const value = envelope();
    const serialized = JSON.stringify(value);
    expect(serialized).not.toContain('person@example.test');
    expect(serialized).not.toContain('Private content');
    expect(value.targetSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(value.payloadSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(evaluateExternalWrite(verifiedRequest(value), ON).allowed).toBe(
      true,
    );
  });

  it('rejects mutation, request mismatch, expiry, and missing approval', () => {
    const original = envelope();
    const mutated = { ...original, payloadSha256: 'f'.repeat(64) };
    expect(evaluateExternalWrite(verifiedRequest(mutated), ON).code).toBe(
      'envelope_mutated',
    );
    expect(
      evaluateExternalWrite(
        { ...verifiedRequest(original), source: 'other' },
        ON,
      ).code,
    ).toBe('envelope_mismatch');
    expect(
      evaluateExternalWrite(
        { ...verifiedRequest(original), now: new Date('2026-08-16T11:59:00Z') },
        ON,
      ).code,
    ).toBe('envelope_not_yet_valid');
    expect(
      evaluateExternalWrite(
        { ...verifiedRequest(original), now: new Date('2026-08-16T12:11:00Z') },
        ON,
      ).code,
    ).toBe('envelope_expired');
    const noApproval = envelope({ approval: undefined });
    expect(evaluateExternalWrite(verifiedRequest(noApproval), ON).code).toBe(
      'approval_required',
    );
    expect(
      evaluateExternalWrite(
        { ...verifiedRequest(original), binding: undefined },
        ON,
      ).code,
    ).toBe('request_binding_required');
    expect(
      evaluateExternalWrite(
        {
          ...verifiedRequest(original),
          binding: {
            ...verifiedRequest(original).binding,
            operatorIdSha256: sha256('different-operator'),
          },
        },
        ON,
      ).code,
    ).toBe('approval_mismatch');
  });

  it('rejects all prior durable claim states as replays', () => {
    const value = envelope();
    for (const state of ['claimed', 'confirmed', 'failed'] as const) {
      expect(
        evaluateExternalWrite(
          {
            ...verifiedRequest(value),
            claim: {
              state,
              actionId: value.actionId,
              idempotencyKey: value.idempotencyKey,
              fingerprint: value.fingerprint,
            },
          },
          ON,
        ).code,
      ).toBe('claim_replay');
    }
  });

  it('requires the durable claim to name the exact action and fingerprint', () => {
    const request = verifiedRequest();
    expect(
      evaluateExternalWrite(
        {
          ...request,
          claim: { ...request.claim, actionId: 'NC-ACTION-OTHER' },
        },
        ON,
      ).code,
    ).toBe('claim_mismatch');
  });
});

describe('diagnostics', () => {
  it('records only aggregate codes and systems', () => {
    expect(() =>
      assertExternalWriteAllowed({
        system: 'gmail',
        actionClass: 'c3_external_communication',
        source: 'host:gmail-api',
      }),
    ).not.toThrow();
    process.env.EXTERNAL_WRITE_SAFE_MODE = '1';
    try {
      expect(() =>
        assertExternalWriteAllowed({
          system: 'slack',
          actionClass: 'c3_external_communication',
          source: 'host:slack-channel',
        }),
      ).toThrow(ExternalWriteDeniedError);
      const status = getActionSafetyStatus();
      expect(status.counters).toMatchObject({ allowed: 1, denied: 1 });
      expect(JSON.stringify(status)).not.toContain('person@example.test');
    } finally {
      delete process.env.EXTERNAL_WRITE_SAFE_MODE;
    }
  });
});
