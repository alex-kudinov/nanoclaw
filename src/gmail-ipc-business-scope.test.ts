import { describe, expect, it, vi } from 'vitest';

import { resolveDurableGmailResource } from './gmail-ipc-business-scope.js';

describe('durable Gmail business scope', () => {
  it('restores an active Sales thread grant after a restart', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ allowed: true }] });

    await expect(
      resolveDurableGmailResource(
        'sales',
        { type: 'gmail_get_thread', threadId: 'thread-1' },
        query,
      ),
    ).resolves.toBe(true);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("i.metadata->>'thread_id' = $1"),
      ['thread-1'],
    );
  });

  it('restores only exact Sales addresses with active pipeline work', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ allowed: true }] })
      .mockResolvedValueOnce({ rows: [{ allowed: false }] });

    await expect(
      resolveDurableGmailResource(
        'sales',
        {
          type: 'gmail_search',
          query: 'from:lead@example.co OR to:lead@example.co',
        },
        query,
      ),
    ).resolves.toBe(false);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('restores only Chief reads bound to an exact Company Work source message', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ allowed: true }] });
    const sourceActions = vi.fn().mockReturnValue(['action-1']);

    await expect(
      resolveDurableGmailResource(
        'chief',
        { type: 'gmail_read', messageId: 'message-1' },
        query,
        sourceActions,
      ),
    ).resolves.toBe(true);
    expect(sourceActions).toHaveBeenCalledWith('message-1');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("workflow_type = 'sales_email'"),
      [['action-1']],
    );
    expect(query.mock.calls[0]?.[0]).toContain("c.state <> 'resolved'");
  });

  it('does not turn Chief source binding into search, thread, or arbitrary read access', async () => {
    const query = vi.fn();
    const sourceActions = vi
      .fn()
      .mockReturnValueOnce([])
      .mockReturnValue(['action-1']);

    await expect(
      resolveDurableGmailResource(
        'chief',
        { type: 'gmail_read', messageId: 'unbound-message' },
        query,
        sourceActions,
      ),
    ).resolves.toBe(false);
    await expect(
      resolveDurableGmailResource(
        'chief',
        { type: 'gmail_search', query: 'from:anyone@example.com' },
        query,
        sourceActions,
      ),
    ).resolves.toBe(false);
    await expect(
      resolveDurableGmailResource(
        'chief',
        { type: 'gmail_get_thread', threadId: 'thread-1' },
        query,
        sourceActions,
      ),
    ).resolves.toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  it('cannot authorize other groups, operations, or broad searches', async () => {
    const query = vi.fn();

    await expect(
      resolveDurableGmailResource(
        'mailman',
        { type: 'gmail_get_thread', threadId: 'thread-1' },
        query,
      ),
    ).resolves.toBe(false);
    await expect(
      resolveDurableGmailResource(
        'sales',
        {
          type: 'gmail_search',
          query: 'from:lead@example.co newer_than:100y',
        },
        query,
      ),
    ).resolves.toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  it('fails closed when the business database is unavailable', async () => {
    const query = vi.fn().mockRejectedValue(new Error('offline'));

    await expect(
      resolveDurableGmailResource(
        'sales',
        { type: 'gmail_get_thread', threadId: 'thread-1' },
        query,
      ),
    ).resolves.toBe(false);
  });
});
