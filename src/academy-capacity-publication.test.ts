import crypto from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildCapacityPublicationPayload,
  enqueueAcademyCapacityPublications,
  publicProgramAndDate,
  publicSiteState,
  runAcademyCapacityPublicationBatch,
} from './academy-capacity-publication.js';

const NOW = '2026-09-06T22:30:00.000Z';

afterEach(() => {
  delete process.env.ACADEMY_CAPACITY_PUBLICATION_ENABLED;
  delete process.env.ACADEMY_CAPACITY_SITE_URL;
  delete process.env.TANDEM_API_KEY;
  delete process.env.CF_ZONE_ID;
  delete process.env.CF_MGMT_TOKEN;
});

describe('Academy capacity publication', () => {
  it('maps only supported public delivery blocks into two site states', () => {
    expect(publicProgramAndDate('acc.module-1:2026-09-07')).toEqual({
      program: 'acc',
      cohortStart: '2026-09-07',
    });
    expect(publicProgramAndDate('mcs-practicum:2026-09-25')).toEqual({
      program: 'mcs-practicum',
      cohortStart: '2026-09-25',
    });
    expect(publicProgramAndDate('acc.module-2:2026-10-01')).toBeNull();
    expect(publicSiteState('open')).toBe('available');
    expect(publicSiteState('open', 1)).toBe('sold_out');
    expect(publicSiteState('closed')).toBe('sold_out');
  });

  it('queues only a threshold crossing and makes daily replay idempotent', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes('SELECT p.id::text AS pool_id'))
        return {
          rows: [
            {
              pool_id: '1',
              pool_key: 'pool:acc:sep',
              delivery_block_key: 'acc.module-1:2026-09-07',
              public_state: 'sold_out',
              waitlist_count: 0,
              pool_version: 4,
              last_state: 'available',
            },
          ],
          rowCount: 1,
        } as never;
      if (sql.includes('INSERT INTO business_v2.academy_capacity_publications'))
        return { rows: [{ id: '8' }], rowCount: 1 } as never;
      return { rows: [], rowCount: 1 } as never;
    });
    expect(
      await enqueueAcademyCapacityPublications('threshold', {
        query: query as never,
        now: () => NOW,
      }),
    ).toEqual({ scanned: 1, enqueued: 1, skipped: 0 });
    expect(calls.some((call) => call.sql.includes("'pending'"))).toBe(true);
  });

  it('signs one pending publication and records only a complete cache ack', async () => {
    process.env.ACADEMY_CAPACITY_PUBLICATION_ENABLED = '1';
    process.env.ACADEMY_CAPACITY_SITE_URL = 'https://tandemcoach.co';
    process.env.TANDEM_API_KEY = 'test-capacity-key-long';
    process.env.CF_ZONE_ID = 'test-zone';
    process.env.CF_MGMT_TOKEN = 'test-cloudflare-token';
    const payload = buildCapacityPublicationPayload({
      poolKey: 'pool:acc:sep',
      deliveryBlockKey: 'acc.module-1:2026-09-07',
      publicState: 'sold_out',
      poolVersion: 9,
      generatedAt: NOW,
    })!;
    const queries: string[] = [];
    const query = vi.fn(async (sql: string) => {
      queries.push(sql);
      if (sql.includes('FROM business_v2.academy_capacity_publications x'))
        return {
          rows: [
            {
              id: '9',
              pool_key: payload.pool_key,
              delivery_block_key: 'acc.module-1:2026-09-07',
              public_state: payload.state,
              pool_version: 4,
              payload_sha256: payload.payload_sha256,
              attempt_count: 0,
              created_at: NOW,
            },
          ],
          rowCount: 1,
        } as never;
      return { rows: [], rowCount: 1 } as never;
    });
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (!url.endsWith('/wp-json/tandem/v1/capacity-status'))
        return new Response('{}', { status: 200 });
      const body = String(init?.body ?? '');
      const expected = `sha256=${crypto
        .createHmac('sha256', 'test-capacity-key-long')
        .update(body)
        .digest('hex')}`;
      expect(
        (init?.headers as Record<string, string>)['X-Tandem-Signature'],
      ).toBe(expected);
      return new Response(
        JSON.stringify({
          success: true,
          cache_complete: true,
          ack_sha256: 'b'.repeat(64),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    expect(
      await runAcademyCapacityPublicationBatch({
        query: query as never,
        fetch: fetchMock as never,
        now: () => '2026-09-06T22:31:00.000Z',
      }),
    ).toEqual({ attempted: 1, delivered: 1, failed: 0 });
    expect(queries.some((sql) => sql.includes("SET state='delivered'"))).toBe(
      true,
    );
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
