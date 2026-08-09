import { describe, expect, it, vi } from 'vitest';

import { runProcurementReconciler } from './procurement-reconciler.js';

describe('Procurement reconciler', () => {
  it('posts only rows newly claimed by the database ledger', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            alert_id: 10,
            alert_text: '[PROCUREMENT ALERT] Pursuit #91 is overdue.',
            channel_jid: 'slack:C_PROC',
            thread_ts: '123.45',
          },
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [{ count: 4 }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            alert_id: 11,
            alert_text: '[PROCUREMENT ALERT] 4 emails remain unrouted.',
            channel_jid: null,
            thread_ts: null,
          },
        ],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [{ acknowledged: true }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [{ acknowledged: true }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });
    const alert = vi.fn().mockResolvedValue(undefined);

    await expect(
      runProcurementReconciler({
        query,
        alert,
        now: () => new Date('2026-08-09T20:00:00Z'),
      }),
    ).resolves.toEqual({
      alertsPosted: 2,
      alertsFailed: 0,
      unroutedEmailCount: 4,
    });
    expect(alert).toHaveBeenCalledTimes(2);
    expect(alert).toHaveBeenNthCalledWith(
      1,
      '[PROCUREMENT ALERT] Pursuit #91 is overdue.',
      'slack:C_PROC',
      '123.45',
    );
    expect(query.mock.calls[2][0]).toContain('ON CONFLICT DO NOTHING');
    expect(query.mock.calls[3][0]).toContain(
      'fn_ack_procurement_reconciler_alert',
    );
    expect(query.mock.calls[4][0]).toContain(
      'fn_ack_procurement_reconciler_alert',
    );
  });

  it('does not repost when every alert conflicts', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [{ count: 4 }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'INSERT',
        oid: 0,
        fields: [],
      });
    const alert = vi.fn();
    await expect(runProcurementReconciler({ query, alert })).resolves.toEqual({
      alertsPosted: 0,
      alertsFailed: 0,
      unroutedEmailCount: 4,
    });
    expect(alert).not.toHaveBeenCalled();
  });

  it('keeps a failed delivery pending and continues with the remaining alerts', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          { alert_id: 20, alert_text: 'first' },
          { alert_id: 21, alert_text: 'second' },
        ],
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [{ count: 0 }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [{ acknowledged: true }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });
    const alert = vi
      .fn()
      .mockRejectedValueOnce(new Error('Slack unavailable'))
      .mockResolvedValueOnce(undefined);

    await expect(runProcurementReconciler({ query, alert })).resolves.toEqual({
      alertsPosted: 1,
      alertsFailed: 1,
      unroutedEmailCount: 0,
    });
    expect(alert).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[2][1]?.[0]).toBe(21);
  });

  it('does not acknowledge a delivered alert when the receipt write fails', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ alert_id: 30, alert_text: 'retryable' }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [{ count: 0 }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      })
      .mockRejectedValueOnce(new Error('DB receipt failed'));
    const alert = vi.fn().mockResolvedValue(undefined);

    await expect(runProcurementReconciler({ query, alert })).resolves.toEqual({
      alertsPosted: 1,
      alertsFailed: 0,
      unroutedEmailCount: 0,
    });
    expect(alert).toHaveBeenCalledWith('retryable', undefined, undefined);
  });
});
