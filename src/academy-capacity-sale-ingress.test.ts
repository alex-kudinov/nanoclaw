import { describe, expect, it, vi } from 'vitest';

import { recordAcademyCapacityWebsiteSale } from './academy-capacity-sale-ingress.js';

describe('Academy capacity website-sale ingress', () => {
  it('maps one exact PaymentIntent and cohort to one idempotent commitment', async () => {
    const query = vi.fn(async () => ({
      rows: [
        {
          pool_key: 'pool:acc:sep',
          pool_version: 7,
          ends_at: '2026-09-28T17:00:00.000Z',
          catalog_revision: 1,
        },
      ],
      rowCount: 1,
    }));
    const execute = vi.fn(async (_group, command) => ({
      caseKey: command.caseKey,
      commandType: command.type,
      state: 'applied' as const,
      code: 'command_applied',
      replayed: false,
      resultSha256: 'f'.repeat(64),
      summary: {},
    }));
    await recordAcademyCapacityWebsiteSale(
      {
        version: 1,
        eligible: true,
        payment_intent_id: 'pi_123',
        product_slug: 'acc-full',
        cohort_program: 'acc',
        cohort_start: '2026-09-07T11:00:00-04:00',
      },
      { query: query as never, execute: execute as never },
    );
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][0]).toBe('capacity');
    expect(execute.mock.calls[0][1]).toMatchObject({
      type: 'commit_seat',
      poolKey: 'pool:acc:sep',
      expectedPoolVersion: 7,
      sourceScope: 'website_stripe_sale',
      idempotencyKey: 'pi_123',
      offerKey: 'acc-full',
      expiresAt: '2026-09-28T17:00:00.000Z',
    });
  });

  it('ignores ineligible facts and refuses ambiguous mappings', async () => {
    const execute = vi.fn();
    expect(
      await recordAcademyCapacityWebsiteSale(
        {
          version: 1,
          eligible: false,
          payment_intent_id: 'pi_123',
          product_slug: null,
          cohort_program: null,
          cohort_start: null,
        },
        { execute: execute as never },
      ),
    ).toBeNull();
    expect(execute).not.toHaveBeenCalled();
    await expect(
      recordAcademyCapacityWebsiteSale(
        {
          version: 1,
          eligible: true,
          payment_intent_id: 'pi_123',
          product_slug: 'acc-full',
          cohort_program: 'acc',
          cohort_start: '2026-09-07',
        },
        {
          query: vi.fn(async () => ({ rows: [], rowCount: 0 })) as never,
          execute: execute as never,
        },
      ),
    ).rejects.toThrow('exact pool/offer mapping not found');
  });

  it('refreshes the pool and retries a paid sale after a version race', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            pool_key: 'pool:acc:sep',
            pool_version: 7,
            ends_at: '2026-09-28T17:00:00.000Z',
            catalog_revision: 1,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            pool_key: 'pool:acc:sep',
            pool_version: 8,
            ends_at: '2026-09-28T17:00:00.000Z',
            catalog_revision: 1,
          },
        ],
        rowCount: 1,
      });
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        caseKey: 'first',
        commandType: 'commit_seat',
        state: 'needs_review',
        code: 'stale_version',
        replayed: false,
        resultSha256: 'a'.repeat(64),
        summary: {},
      })
      .mockResolvedValueOnce({
        caseKey: 'second',
        commandType: 'commit_seat',
        state: 'applied',
        code: 'command_applied',
        replayed: false,
        resultSha256: 'b'.repeat(64),
        summary: {},
      });

    const result = await recordAcademyCapacityWebsiteSale(
      {
        version: 1,
        eligible: true,
        payment_intent_id: 'pi_race',
        product_slug: 'acc-full',
        cohort_program: 'acc',
        cohort_start: '2026-09-07T11:00:00-04:00',
      },
      { query: query as never, execute: execute as never },
    );

    expect(result?.state).toBe('applied');
    expect(query).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[0][1]).toMatchObject({
      expectedPoolVersion: 7,
    });
    expect(execute.mock.calls[1][1]).toMatchObject({
      expectedPoolVersion: 8,
    });
    expect(execute.mock.calls[0][1].caseKey).not.toBe(
      execute.mock.calls[1][1].caseKey,
    );
  });
});
