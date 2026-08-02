import { describe, expect, it, vi } from 'vitest';

import {
  dispatchProcurementIpc,
  isProcurementIpcType,
  type ProcurementIpcDeps,
} from './procurement-ipc-handlers.js';

function deps(rows: Record<string, unknown>[]) {
  const query = vi.fn(async () => ({
    rows,
    rowCount: rows.length,
    command: 'SELECT',
    oid: 0,
    fields: [],
  }));
  return {
    query: query as unknown as ProcurementIpcDeps['query'],
    writeInput: vi.fn(),
  };
}

describe('Procurement IPC queue', () => {
  it('recognizes only the bounded Procurement operations', () => {
    expect(isProcurementIpcType('procurement_queue')).toBe(true);
    expect(isProcurementIpcType('procurement_caleprocure_ingest')).toBe(true);
    expect(isProcurementIpcType('procurement_review_card')).toBe(true);
    expect(isProcurementIpcType('procurement_submit')).toBe(false);
    expect(isProcurementIpcType('procurement_review')).toBe(false);
  });

  it('returns a bounded queue without raw payload or Gmail content', async () => {
    const d = deps([
      {
        opportunity_id: 42,
        source: 'email',
        source_key: 'gmail-message-1',
        title: 'Leadership coaching RFP',
        agency: 'Example Agency',
        close_date: '2026-08-21',
        category: 'RFP',
        review_state: 'unreviewed',
        review_version: 0,
        days_until_close: 22,
      },
    ]);

    await dispatchProcurementIpc(
      'procurement',
      { type: 'procurement_queue', limit: 10 },
      d,
    );

    const [sql, params] = vi.mocked(d.query).mock.calls[0];
    expect(sql).toContain('v_procurement_review_queue');
    expect(params).toEqual([10]);
    const text = vi.mocked(d.writeInput).mock.calls[0][1];
    expect(text).toContain('[PROCUREMENT REVIEW] #42 v0');
    expect(text).toContain('Leadership coaching RFP');
    expect(text).not.toContain('raw_payload');
    expect(text).not.toContain('gmail_thread_id');
  });

  it('rejects every non-Procurement caller', async () => {
    const d = deps([]);
    await expect(
      dispatchProcurementIpc(
        'sales',
        { type: 'procurement_queue', limit: 10 },
        d,
      ),
    ).rejects.toThrow('restricted to the procurement group');
    expect(d.query).not.toHaveBeenCalled();
  });

  it('rejects out-of-range limits before querying', async () => {
    const d = deps([]);
    await expect(
      dispatchProcurementIpc(
        'procurement',
        { type: 'procurement_queue', limit: 500 },
        d,
      ),
    ).rejects.toThrow('integer from 1 to 50');
    expect(d.query).not.toHaveBeenCalled();
  });
});

describe('Procurement IPC writes', () => {
  it('keeps CaleProcure ingestion off by default', async () => {
    const d = deps([]);
    await expect(
      dispatchProcurementIpc(
        'procurement',
        {
          type: 'procurement_caleprocure_ingest',
          runKey: 'cale-20260730-1',
          rows: [],
        },
        d,
      ),
    ).rejects.toThrow('disabled');
    expect(d.query).not.toHaveBeenCalled();
  });

  it('records a bounded empty CaleProcure run only when explicitly enabled', async () => {
    const d = deps([]);
    vi.mocked(d.query)
      .mockResolvedValueOnce({
        rows: [
          {
            run_id: 12,
            status: 'running',
            observations_seen: 0,
            observations_new: 0,
          },
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [{ completed: true }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

    await dispatchProcurementIpc(
      'procurement',
      {
        type: 'procurement_caleprocure_ingest',
        runKey: 'cale-20260730-1',
        rows: [],
      },
      {
        ...d,
        env: { PROCUREMENT_CALEPROCURE_INGEST_ENABLED: '1' },
      },
    );

    expect(d.query).toHaveBeenCalledTimes(2);
    expect(d.writeInput).toHaveBeenCalledWith(
      'procurement',
      expect.stringContaining('Run 12 is complete'),
    );
  });

  it('rejects oversized CaleProcure batches before querying', async () => {
    const d = deps([]);
    await expect(
      dispatchProcurementIpc(
        'procurement',
        {
          type: 'procurement_caleprocure_ingest',
          runKey: 'cale-20260730-1',
          rows: Array.from({ length: 201 }, () => ({
            event_id: '1',
            business_unit: '3900',
            title: 'x',
            agency: 'y',
            search_keyword: 'coaching',
          })),
        },
        {
          ...d,
          env: { PROCUREMENT_CALEPROCURE_INGEST_ENABLED: '1' },
        },
      ),
    ).rejects.toThrow('at most 200 rows');
    expect(d.query).not.toHaveBeenCalled();
  });

  it('requires the host Slack transport for review cards', async () => {
    const d = deps([]);
    await expect(
      dispatchProcurementIpc(
        'procurement',
        {
          type: 'procurement_review_card',
          opportunityId: 42,
          expectedVersion: 0,
          recommendation: 'process',
          reason: 'Good fit',
        },
        {
          ...d,
          env: {
            PROCUREMENT_REVIEW_ENABLED: '1',
            PROCUREMENT_REVIEW_EPOCH: 'epoch-1',
            PROCUREMENT_OPERATOR_UIDS: 'U_ALEX',
          },
        },
      ),
    ).rejects.toThrow('transport is unavailable');
    expect(d.query).not.toHaveBeenCalled();
  });
});
