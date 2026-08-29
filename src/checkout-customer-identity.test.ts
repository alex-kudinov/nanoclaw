import { describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';

import {
  CheckoutCustomerIdentityError,
  bindCheckoutCustomerIdentityWithClient,
  issueCheckoutIdentityBindingToken,
  prepareCheckoutCustomerIdentityRequest,
  resolveCheckoutCustomerIdentityWithClient,
  verifyCheckoutIdentityBindingToken,
  type CheckoutIdentityResolveRequest,
} from './checkout-customer-identity.js';

const secret = 'i'.repeat(64);
const resolvePayload = {
  schema_version: 1,
  request_kind: 'checkout.identity.resolve',
  source_request_key: 'tw:v1:abc:identity_resolve',
  observed_at: '2026-08-29T17:30:00Z',
  checkout_token: 'a'.repeat(32),
  email: 'Buyer@Example.com',
  first_name: ' Buyer ',
  last_name: ' Example ',
  product_slug: 'acc-module-1',
};

function fakeClient(
  responder: (sql: string, params: unknown[]) => { rows: unknown[] },
): PoolClient {
  return {
    query: vi.fn((sql: string, params: unknown[] = []) =>
      Promise.resolve(responder(sql, params)),
    ),
  } as unknown as PoolClient;
}

function preparedResolve(): CheckoutIdentityResolveRequest {
  return prepareCheckoutCustomerIdentityRequest(
    resolvePayload,
    secret,
  ) as CheckoutIdentityResolveRequest;
}

describe('checkout customer identity preparation', () => {
  it('normalizes resolve identity and produces only keyed fingerprints', () => {
    const result = preparedResolve();
    expect(result).toMatchObject({
      kind: 'checkout.identity.resolve',
      email: 'buyer@example.com',
      displayName: 'Buyer Example',
      productSlug: 'acc-module-1',
    });
    expect(result.emailSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.checkoutTokenSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.emailSha256).not.toContain('buyer');
  });

  it('validates bind shape and rejects unsupported operations', () => {
    const token = issueCheckoutIdentityBindingToken(
      {
        party_id: 42,
        interaction_id: 9,
        checkout_token_sha256: 'a'.repeat(64),
        email_sha256: 'b'.repeat(64),
      },
      secret,
      100,
    );
    expect(
      prepareCheckoutCustomerIdentityRequest(
        {
          schema_version: 1,
          request_kind: 'checkout.identity.bind',
          source_request_key: 'tw:v1:abc:identity_bind',
          observed_at: '2026-08-29T17:31:00Z',
          stripe_customer_id: 'cus_1234567890abc',
          binding_token: token,
        },
        secret,
      ),
    ).toMatchObject({ kind: 'checkout.identity.bind' });
    expect(() =>
      prepareCheckoutCustomerIdentityRequest(
        { ...resolvePayload, request_kind: 'checkout.identity.guess' },
        secret,
      ),
    ).toThrow('unsupported_request_kind');
  });

  it('rejects tampered and expired binding tokens', () => {
    const token = issueCheckoutIdentityBindingToken(
      {
        party_id: 42,
        interaction_id: 9,
        checkout_token_sha256: 'a'.repeat(64),
        email_sha256: 'b'.repeat(64),
      },
      secret,
      100,
    );
    expect(
      verifyCheckoutIdentityBindingToken(token, secret, 200),
    ).toMatchObject({
      party_id: 42,
    });
    expect(() =>
      verifyCheckoutIdentityBindingToken(`${token.slice(0, -1)}0`, secret, 200),
    ).toThrow('invalid_binding_token');
    expect(() =>
      verifyCheckoutIdentityBindingToken(token, secret, 1001),
    ).toThrow('invalid_binding_token');
  });
});

describe('checkout customer identity store', () => {
  it('reuses one exact Party without adding a role', async () => {
    const calls: string[] = [];
    const client = fakeClient((sql) => {
      calls.push(sql);
      if (sql.includes("metadata->>'email_sha256'")) return { rows: [] };
      if (sql.includes('WITH candidates AS'))
        return { rows: [{ party_id: '42' }] };
      if (sql.includes('fn_log_interaction_dedup'))
        return { rows: [{ id: '9' }] };
      return { rows: [] };
    });
    const result = await resolveCheckoutCustomerIdentityWithClient({
      client,
      request: preparedResolve(),
      identitySecret: secret,
    });
    expect(result).toMatchObject({ partyId: 42, resolution: 'existing' });
    expect(calls.some((sql) => sql.includes('fn_create_party'))).toBe(false);
    expect(calls.some((sql) => sql.includes('fn_add_party_role'))).toBe(false);
  });

  it('creates one prospect Party only when no candidate exists', async () => {
    const calls: string[] = [];
    const client = fakeClient((sql) => {
      calls.push(sql);
      if (sql.includes("metadata->>'email_sha256'")) return { rows: [] };
      if (sql.includes('WITH candidates AS')) return { rows: [] };
      if (sql.includes('fn_create_party')) return { rows: [{ id: '43' }] };
      if (sql.includes('fn_log_interaction_dedup'))
        return { rows: [{ id: '10' }] };
      return { rows: [] };
    });
    const result = await resolveCheckoutCustomerIdentityWithClient({
      client,
      request: preparedResolve(),
      identitySecret: secret,
    });
    expect(result).toMatchObject({ partyId: 43, resolution: 'created' });
    expect(calls.some((sql) => sql.includes('fn_add_party_role'))).toBe(true);
  });

  it('holds ambiguous email ownership and token identity conflicts', async () => {
    const ambiguous = fakeClient((sql) => {
      if (sql.includes("metadata->>'email_sha256'")) return { rows: [] };
      if (sql.includes('WITH candidates AS')) {
        return { rows: [{ party_id: '42' }, { party_id: '43' }] };
      }
      return { rows: [] };
    });
    await expect(
      resolveCheckoutCustomerIdentityWithClient({
        client: ambiguous,
        request: preparedResolve(),
        identitySecret: secret,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    const conflict = fakeClient((sql) => {
      if (sql.includes("metadata->>'email_sha256'")) {
        return {
          rows: [{ id: '9', party_id: '42', email_sha256: 'f'.repeat(64) }],
        };
      }
      return { rows: [] };
    });
    await expect(
      resolveCheckoutCustomerIdentityWithClient({
        client: conflict,
        request: preparedResolve(),
        identitySecret: secret,
      }),
    ).rejects.toBeInstanceOf(CheckoutCustomerIdentityError);
  });

  it('binds and replays one exact Stripe Customer reference', async () => {
    const request = preparedResolve();
    const bindingToken = issueCheckoutIdentityBindingToken(
      {
        party_id: 42,
        interaction_id: 9,
        checkout_token_sha256: request.checkoutTokenSha256,
        email_sha256: request.emailSha256,
      },
      secret,
    );
    let existing = false;
    const calls: string[] = [];
    const client = fakeClient((sql) => {
      calls.push(sql);
      if (sql.includes('FROM business_v2.interactions')) {
        return {
          rows: [{ party_id: '42', email_sha256: request.emailSha256 }],
        };
      }
      if (sql.includes('FROM business_v2.party_external_refs')) {
        return { rows: existing ? [{ party_id: '42' }] : [] };
      }
      if (sql.includes('INSERT INTO business_v2.party_external_refs'))
        existing = true;
      return { rows: [] };
    });
    const input = {
      client,
      identitySecret: secret,
      request: {
        kind: 'checkout.identity.bind' as const,
        sourceRequestKey: 'tw:v1:abc:identity_bind',
        observedAt: '2026-08-29T17:31:00.000Z',
        stripeCustomerId: 'cus_1234567890abc',
        bindingToken,
      },
    };
    expect(await bindCheckoutCustomerIdentityWithClient(input)).toMatchObject({
      bound: true,
      duplicate: false,
    });
    expect(await bindCheckoutCustomerIdentityWithClient(input)).toMatchObject({
      bound: true,
      duplicate: true,
    });
    expect(
      calls.filter((sql) =>
        sql.includes('INSERT INTO business_v2.party_external_refs'),
      ),
    ).toHaveLength(1);
  });

  it('refuses a Stripe Customer already owned by another Party', async () => {
    const request = preparedResolve();
    const bindingToken = issueCheckoutIdentityBindingToken(
      {
        party_id: 42,
        interaction_id: 9,
        checkout_token_sha256: request.checkoutTokenSha256,
        email_sha256: request.emailSha256,
      },
      secret,
    );
    const client = fakeClient((sql) => {
      if (sql.includes('FROM business_v2.interactions')) {
        return {
          rows: [{ party_id: '42', email_sha256: request.emailSha256 }],
        };
      }
      if (sql.includes('FROM business_v2.party_external_refs')) {
        return { rows: [{ party_id: '99' }] };
      }
      return { rows: [] };
    });
    await expect(
      bindCheckoutCustomerIdentityWithClient({
        client,
        identitySecret: secret,
        request: {
          kind: 'checkout.identity.bind',
          sourceRequestKey: 'tw:v1:abc:identity_bind',
          observedAt: '2026-08-29T17:31:00.000Z',
          stripeCustomerId: 'cus_1234567890abc',
          bindingToken,
        },
      }),
    ).rejects.toMatchObject({
      message: 'stripe_customer_party_conflict',
      statusCode: 409,
    });
  });
});
