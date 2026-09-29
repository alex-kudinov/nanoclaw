import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  calls: [] as Array<{ agent: string; sql: string; params: unknown[] }>,
  upgraded: true,
  fail: false,
}));
vi.mock('./business-db.js', () => ({
  withAgentContext: async (
    agent: string,
    fn: (client: unknown) => Promise<unknown>,
  ) =>
    fn({
      query: async (sql: string, params: unknown[]) => {
        if (db.fail) throw Object.assign(new Error('boom'), { code: '40P01' });
        db.calls.push({ agent, sql, params });
        return {
          rows: [{ matches: 1, party_id: '11641', upgraded: db.upgraded }],
        };
      },
    }),
}));
vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { logger } from './logger.js';
import {
  chaosFormNameCandidate,
  fullName,
  upgradeCommerceOrderNames,
  upgradePartyNameByEmail,
} from './party-name-upgrade.js';

beforeEach(() => {
  db.calls = [];
  db.upgraded = true;
  db.fail = false;
  vi.clearAllMocks();
});

describe('fullName', () => {
  it('needs both parts', () => {
    expect(fullName(' Steve ', ' Rivera ')).toBe('Steve Rivera');
    expect(fullName('Steve', '')).toBeNull();
    expect(fullName(undefined, 'Rivera')).toBeNull();
    expect(fullName('x'.repeat(101), 'Rivera')).toBeNull();
  });
});

describe('chaosFormNameCandidate', () => {
  const base = {
    identityStatus: 'verified',
    email: 'Steve@Example.com',
    fields: {
      email: 'steve@example.com',
      first_name: 'Steve',
      last_name: 'Rivera',
    },
  };

  it('pairs the verified email with the same form’s own name fields', () => {
    expect(chaosFormNameCandidate(base)).toEqual({
      email: 'steve@example.com',
      candidate: 'Steve Rivera',
    });
    expect(
      chaosFormNameCandidate({
        ...base,
        fields: {
          email: 'steve@example.com',
          firstName: 'Steve',
          lastName: 'Rivera',
        },
      }),
    ).toEqual({ email: 'steve@example.com', candidate: 'Steve Rivera' });
  });

  it('refuses unverified visitors, other emails and participant-only names', () => {
    expect(
      chaosFormNameCandidate({ ...base, identityStatus: 'observed' }),
    ).toBeNull();
    expect(
      chaosFormNameCandidate({
        ...base,
        fields: { ...base.fields, email: 'x@example.com' },
      }),
    ).toBeNull();
    expect(
      chaosFormNameCandidate({
        ...base,
        fields: {
          email: 'steve@example.com',
          participantFirstName: 'Steve',
          participantLastName: 'Junior',
        },
      }),
    ).toBeNull();
  });
});

describe('upgradePartyNameByEmail', () => {
  it('runs the one-holder email upgrade under the caller agent', async () => {
    await expect(
      upgradePartyNameByEmail({
        email: 'steve@example.com',
        candidate: 'Steve Rivera',
        source: 'chaos-form',
        agent: 'form-submitted',
      }),
    ).resolves.toBe(true);
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0].agent).toBe('form-submitted');
    expect(db.calls[0].sql).toContain('resolve_parties_by_email($1::citext)');
    expect(db.calls[0].sql).toContain('cardinality(m.ids) = 1');
    expect(db.calls[0].params).toEqual([
      'steve@example.com',
      'Steve Rivera',
      'chaos-form',
    ]);
  });

  it('never throws and never logs the name', async () => {
    db.fail = true;
    await expect(
      upgradePartyNameByEmail({
        email: 'steve@example.com',
        candidate: 'Steve Rivera',
        source: 'chaos',
        agent: 'chaos-reconciler',
      }),
    ).resolves.toBe(false);
    const logged = JSON.stringify(vi.mocked(logger.warn).mock.calls);
    expect(logged).toContain('40P01');
    expect(logged).not.toContain('Rivera');
    expect(logged).not.toContain('steve@example.com');
  });
});

describe('upgradeCommerceOrderNames', () => {
  it('gives payer and learner each their own name', async () => {
    await upgradeCommerceOrderNames({
      payer: { firstName: 'Pat', lastName: 'Rivera', email: 'Pat@Example.com' },
      learner: {
        firstName: 'Sam',
        lastName: 'Rivera',
        email: 'sam@example.com',
      },
    });
    expect(db.calls.map((c) => c.params)).toEqual([
      ['pat@example.com', 'Pat Rivera', 'commerce'],
      ['sam@example.com', 'Sam Rivera', 'commerce'],
    ]);
    expect(db.calls.every((c) => c.agent === 'commerce-bookkeeper')).toBe(true);
  });

  it('sends a self purchase once and skips one email carrying two names', async () => {
    await upgradeCommerceOrderNames({
      payer: { firstName: 'Pat', lastName: 'Rivera', email: 'pat@example.com' },
      learner: {
        firstName: 'pat',
        lastName: 'rivera',
        email: 'PAT@example.com',
      },
    });
    expect(db.calls).toHaveLength(1);
    db.calls = [];
    await upgradeCommerceOrderNames({
      payer: { firstName: 'Pat', lastName: 'Rivera', email: 'pat@example.com' },
      learner: {
        firstName: 'Sam',
        lastName: 'Rivera',
        email: 'pat@example.com',
      },
    });
    expect(db.calls).toHaveLength(0);
  });
});
