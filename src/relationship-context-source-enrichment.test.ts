import { describe, expect, it } from 'vitest';

import {
  chaosVerifiedEvidenceTier,
  contactFormEvidenceTier,
  fetchStripeAccountSnapshot,
  normalizeAttributionPage,
  sourceEnrichmentManifests,
  stripeAccountScopeGate,
  stripeCustomerEvidenceTier,
} from './relationship-context-source-enrichment.js';

describe('relationship context Stripe/contact/Chaos source adapters', () => {
  it('registers three provider-neutral manifests with exact source scopes', () => {
    const manifests = sourceEnrichmentManifests();
    expect(
      manifests.map((manifest) => ({
        adapter: manifest.adapterKey,
        source: manifest.sourceSystem,
        scopes: manifest.supportedScopes,
        modes: manifest.collectionModes,
      })),
    ).toEqual([
      {
        adapter: 'stripe_account_snapshot',
        source: 'stripe',
        scopes: ['heartbeat', 'tandem'],
        modes: ['snapshot', 'reconciliation'],
      },
      {
        adapter: 'contact_form_host_ledger',
        source: 'contact_form',
        scopes: ['tandem-web'],
        modes: ['reconciliation'],
      },
      {
        adapter: 'chaos_verified_host_ledger',
        source: 'chaos',
        scopes: ['tandem-web'],
        modes: ['reconciliation'],
      },
    ]);
    expect(JSON.stringify(manifests)).not.toMatch(
      /secret|token|customer record|raw payload/i,
    );
  });

  it('fails closed on duplicate/ambiguous identity and requires Chaos agreement', () => {
    expect(
      stripeCustomerEvidenceTier({
        hasEmail: true,
        providerEmailCount: 1,
        candidatePartyIds: [10],
      }),
    ).toBe('stripe_unique_account_email_to_unique_party_v1');
    expect(
      stripeCustomerEvidenceTier({
        hasEmail: true,
        providerEmailCount: 2,
        candidatePartyIds: [10],
      }),
    ).toBe('stripe_account_email_not_unique');
    expect(
      stripeCustomerEvidenceTier({
        hasEmail: true,
        providerEmailCount: 1,
        candidatePartyIds: [10, 20],
      }),
    ).toBe('stripe_customer_party_ambiguous');
    expect(
      contactFormEvidenceTier({ hasEmail: true, candidatePartyIds: [10] }),
    ).toBe('contact_exact_submission_unique_party_v1');
    expect(
      contactFormEvidenceTier({
        hasEmail: true,
        candidatePartyIds: [10, 20],
      }),
    ).toBe('contact_submission_party_ambiguous');
    expect(
      chaosVerifiedEvidenceTier({
        interactionPartyIds: [10],
        inboxPartyIds: [10],
        verifiedInboxCount: 1,
      }),
    ).toBe('chaos_verified_inbox_interaction_agreement_v1');
    expect(
      chaosVerifiedEvidenceTier({
        interactionPartyIds: [10],
        inboxPartyIds: [20],
        verifiedInboxCount: 1,
      }),
    ).toBe('chaos_verified_party_mismatch');
    expect(
      chaosVerifiedEvidenceTier({
        interactionPartyIds: [10],
        inboxPartyIds: [],
        verifiedInboxCount: 1,
      }),
    ).toBe('chaos_verified_inbox_party_missing');
    expect(stripeAccountScopeGate(['acct_heartbeat', 'acct_tandem'])).toBe(
      'verified',
    );
    expect(stripeAccountScopeGate(['acct_same', 'acct_same'])).toBe(
      'collision',
    );
    expect(stripeAccountScopeGate(['acct_heartbeat', null])).toBe('unverified');
  });

  it('reduces attribution pages to bounded paths or external hostnames', () => {
    expect(
      normalizeAttributionPage(
        'https://tandemcoach.co/training/mentor?email=secret#section',
      ),
    ).toBe('/training/mentor');
    expect(normalizeAttributionPage('/contact-us/?token=secret')).toBe(
      '/contact-us/',
    );
    expect(normalizeAttributionPage('https://example.com/path?q=secret')).toBe(
      'external:example.com',
    );
    expect(normalizeAttributionPage('javascript:alert(1)')).toBeNull();
    expect(normalizeAttributionPage('<script>')).toBeNull();
  });

  it('collects complete paginated Stripe snapshots without provider mutation', async () => {
    const calls: string[] = [];
    const getJson = async (_key: string, path: string) => {
      calls.push(path);
      const url = new URL(path, 'https://api.stripe.test');
      const cursor = url.searchParams.get('starting_after');
      if (url.pathname === '/v1/customers') {
        return cursor
          ? {
              data: [
                {
                  id: 'cus_second',
                  email: 'second@example.test',
                  created: 1_700_000_001,
                  delinquent: true,
                },
              ],
              has_more: false,
            }
          : {
              data: [
                {
                  id: 'cus_first',
                  email: 'First@Example.Test',
                  created: 1_700_000_000,
                  delinquent: false,
                },
              ],
              has_more: true,
            };
      }
      if (url.pathname === '/v1/account') {
        return { id: 'acct_heartbeat_fixture' };
      }
      if (url.pathname === '/v1/payment_intents') {
        return {
          data: [
            {
              id: 'pi_fixture',
              customer: 'cus_first',
              status: 'succeeded',
              created: 1_700_000_002,
              currency: 'usd',
              amount: 99_999,
            },
          ],
          has_more: false,
        };
      }
      if (url.pathname === '/v1/subscriptions') {
        expect(url.searchParams.get('status')).toBe('all');
        return {
          data: [
            {
              id: 'sub_fixture',
              customer: { id: 'cus_first' },
              status: 'active',
              created: 1_700_000_003,
              current_period_end: 1_700_086_400,
              cancel_at_period_end: false,
            },
          ],
          has_more: false,
        };
      }
      throw new Error('unexpected_path');
    };
    const snapshot = await fetchStripeAccountSnapshot(
      'heartbeat',
      '2026-08-26T23:30:00Z',
      { getJson, keyForScope: () => 'test-read-key' },
    );
    expect(snapshot).toMatchObject({
      scope: 'heartbeat',
      accountId: 'acct_heartbeat_fixture',
      complete: true,
      customers: [
        { id: 'cus_first', email: 'first@example.test', delinquent: false },
        { id: 'cus_second', email: 'second@example.test', delinquent: true },
      ],
      paymentIntents: [
        {
          id: 'pi_fixture',
          customerId: 'cus_first',
          status: 'succeeded',
          currency: 'usd',
        },
      ],
      subscriptions: [
        {
          id: 'sub_fixture',
          customerId: 'cus_first',
          status: 'active',
          cancelAtPeriodEnd: false,
        },
      ],
    });
    expect(JSON.stringify(snapshot)).not.toContain('99999');
    expect(calls).toHaveLength(5);
    expect(calls.every((path) => path.startsWith('/v1/'))).toBe(true);
  });

  it('bisects an overflowing Stripe time partition instead of imposing an all-time cap', async () => {
    const calls = new Map<string, number>();
    const getJson = async (_key: string, path: string) => {
      const url = new URL(path, 'https://api.stripe.test');
      const prior = calls.get(url.pathname) ?? 0;
      calls.set(url.pathname, prior + 1);
      if (url.pathname === '/v1/account') {
        return { id: 'acct_partition_fixture' };
      }
      if (url.pathname !== '/v1/customers') {
        return { data: [], has_more: false };
      }
      if (prior === 0) {
        return { data: [{ id: 'cus_parent' }], has_more: true };
      }
      return {
        data: [
          {
            id: prior === 1 ? 'cus_earlier' : 'cus_later',
            email: `${prior}@example.test`,
            created: 1_700_000_000 + prior,
            delinquent: false,
          },
        ],
        has_more: false,
      };
    };
    const snapshot = await fetchStripeAccountSnapshot(
      'tandem',
      '2026-08-26T23:30:00Z',
      {
        getJson,
        keyForScope: () => 'test-read-key',
        maxPagesPerPartition: 1,
      },
    );
    expect(snapshot.complete).toBe(true);
    expect(snapshot.customers.map((customer) => customer.id).sort()).toEqual([
      'cus_earlier',
      'cus_later',
    ]);
    expect(calls.get('/v1/customers')).toBe(3);
  });
});
