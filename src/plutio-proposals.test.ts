import { describe, it, expect } from 'vitest';

import {
  parseProposals,
  parseRecipient,
  resolveProposalUrl,
  resolveProposalEditUrl,
} from './plutio-proposals.js';

describe('resolveProposalUrl', () => {
  it('builds the client-facing public link from the Plutio id', () => {
    expect(resolveProposalUrl('utM46gYDbbbhrWWD2')).toBe(
      'https://business.tandemcoaching.academy/p/proposal/utM46gYDbbbhrWWD2',
    );
  });

  it('builds the internal edit link from the same origin', () => {
    expect(resolveProposalEditUrl('utM46gYDbbbhrWWD2')).toBe(
      'https://business.tandemcoaching.academy/proposals/utM46gYDbbbhrWWD2/edit',
    );
  });
});

describe('parseProposals', () => {
  const sample = JSON.stringify([
    {
      _id: 'wjrxJqgN4fo333Duw',
      proposalId: 'tca-089-prop',
      name: '6-session executive coaching',
      status: 'pending',
      pendingAt: '2026-03-12T00:38:14.642Z',
      client: { _id: 'ytiwPPoSj2E7J88sB', entityType: 'person' },
    },
  ]);

  it('maps the core fields', () => {
    const [p] = parseProposals(sample);
    expect(p.id).toBe('wjrxJqgN4fo333Duw');
    expect(p.number).toBe('tca-089-prop');
    expect(p.title).toBe('6-session executive coaching');
    expect(p.clientId).toBe('ytiwPPoSj2E7J88sB');
    expect(p.pendingAt.toISOString()).toBe('2026-03-12T00:38:14.642Z');
  });

  it('accepts a { data: [...] } envelope', () => {
    const out = parseProposals(JSON.stringify({ data: JSON.parse(sample) }));
    expect(out).toHaveLength(1);
  });

  it('falls back to createdAt when pendingAt is absent', () => {
    const raw = JSON.stringify([
      { _id: 'x', createdAt: '2026-01-01T00:00:00.000Z' },
    ]);
    expect(parseProposals(raw)[0].pendingAt.getUTCFullYear()).toBe(2026);
  });

  it('drops records with no _id or no usable date', () => {
    const raw = JSON.stringify([
      { proposalId: 'no-id' },
      { _id: 'y', pendingAt: 'not-a-date' },
      { _id: 'z', pendingAt: '2026-02-02T00:00:00.000Z' },
    ]);
    const out = parseProposals(raw);
    expect(out.map((p) => p.id)).toEqual(['z']);
  });

  it('strips the toolbox "OK " status prefix before parsing', () => {
    const [p] = parseProposals(`OK ${sample}`);
    expect(p.id).toBe('wjrxJqgN4fo333Duw');
  });

  it('returns [] on malformed JSON', () => {
    expect(parseProposals('not json')).toEqual([]);
  });

  it('returns [] on an ERR status line with no JSON', () => {
    expect(parseProposals('ERR upstream 500')).toEqual([]);
  });
});

describe('parseRecipient', () => {
  it('pulls email + name from the first person in an array', () => {
    const raw = JSON.stringify([
      {
        _id: 'p1',
        name: { first: 'Katie', last: 'Doe' },
        contactEmails: [{ address: 'katie@example.com' }],
      },
    ]);
    expect(parseRecipient(raw)).toEqual({
      email: 'katie@example.com',
      firstName: 'Katie',
      lastName: 'Doe',
    });
  });

  it('accepts a single object too', () => {
    const raw = JSON.stringify({
      name: { first: 'Sam' },
      contactEmails: [{ address: 'sam@example.com' }],
    });
    expect(parseRecipient(raw)?.firstName).toBe('Sam');
  });

  it('returns null when no email is present', () => {
    const raw = JSON.stringify([{ name: { first: 'NoEmail' } }]);
    expect(parseRecipient(raw)).toBeNull();
  });

  it('strips the toolbox "OK " status prefix', () => {
    const raw = `OK [{"name":{"first":"Sam"},"contactEmails":[{"address":"sam@example.com"}]}]`;
    expect(parseRecipient(raw)?.firstName).toBe('Sam');
  });

  it('returns null on malformed JSON', () => {
    expect(parseRecipient('{')).toBeNull();
  });
});
