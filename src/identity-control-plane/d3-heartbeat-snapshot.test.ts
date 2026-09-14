import { describe, expect, it } from 'vitest';

import {
  prepareHeartbeatAggregateSnapshot,
  validateHeartbeatAggregateSnapshot,
} from './d3-heartbeat-snapshot.js';

function census(observedAt: string, memberCount = 2): unknown {
  return {
    ok: true,
    data: {
      instance: 'main',
      complete: true,
      observed_at: observedAt,
      user_count: 2,
      user_ids_sha256: 'a'.repeat(64),
      snapshot_sha256: 'b'.repeat(64),
      disposition: 'unchanged',
      missing_email_count: 0,
      duplicate_email_values_across_user_ids: 0,
      zero_group_users: 0,
      membership_edges: 4,
      role_membership_edges: 2,
      access_membership_edges: 2,
      zero_access_group_users: 1,
      role_counts: [
        { role: 'Administrator', count: 0 },
        { role: 'Instructor', count: 0 },
        { role: 'User', count: 2 },
      ],
      status_counts: [{ status: 'active', count: 2 }],
      created_at: {
        minimum: '2020-01-01T00:00:00.000Z',
        maximum: '2020-01-02T00:00:00.000Z',
      },
      updated_at: {
        minimum: '2020-01-01T00:00:00.000Z',
        maximum: '2020-01-02T00:00:00.000Z',
      },
      groups: [
        {
          group_id: '00000000-0000-4000-8000-000000000001',
          group_name: 'Sensitive cohort label',
          member_count: memberCount,
          membership_sha256: 'c'.repeat(64),
        },
      ],
    },
  };
}

function webhooks(): unknown {
  return {
    ok: true,
    data: [
      {
        id: '10000000-0000-4000-8000-000000000001',
        action: 'GROUP_JOIN',
        filter: { groupID: 'private-filter-value' },
        destination_host: 'example.test',
        url_sha256: 'd'.repeat(64),
      },
    ],
  };
}

describe('D3 Heartbeat privacy-minimized aggregate snapshot', () => {
  it('binds two stable censuses and retains no group names, filters, hosts, or URLs', () => {
    const snapshot = prepareHeartbeatAggregateSnapshot({
      firstCensus: census('2026-09-14T03:00:00.000Z'),
      secondCensus: census('2026-09-14T03:01:00.000Z'),
      webhooks: webhooks(),
      webhookObservedAt: '2026-09-14T03:01:30.000Z',
    });
    expect(snapshot).toMatchObject({
      provider: 'heartbeat',
      sourceScope: 'main',
      individualIdentityGraphAvailable: false,
      containsNames: false,
      containsEmails: false,
      containsRawPayloads: false,
      containsCredentials: false,
      groups: [
        {
          groupId: '00000000-0000-4000-8000-000000000001',
          memberCount: 2,
          membershipSha256: 'c'.repeat(64),
        },
      ],
      webhookInventory: { registrationCount: 1 },
    });
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain('Sensitive cohort label');
    expect(serialized).not.toContain('private-filter-value');
    expect(serialized).not.toContain('example.test');
    expect(
      validateHeartbeatAggregateSnapshot(snapshot, '2026-09-14T03:02:00.000Z'),
    ).toEqual(snapshot);
  });

  it('fails closed on changed membership, added fields, privacy claims, and stale input', () => {
    expect(() =>
      prepareHeartbeatAggregateSnapshot({
        firstCensus: census('2026-09-14T03:00:00.000Z'),
        secondCensus: census('2026-09-14T03:01:00.000Z', 3),
        webhooks: webhooks(),
        webhookObservedAt: '2026-09-14T03:01:30.000Z',
      }),
    ).toThrow('tandem_identity_d3_snapshot:group_membership_changed');

    const snapshot = prepareHeartbeatAggregateSnapshot({
      firstCensus: census('2026-09-14T03:00:00.000Z'),
      secondCensus: census('2026-09-14T03:01:00.000Z'),
      webhooks: webhooks(),
      webhookObservedAt: '2026-09-14T03:01:30.000Z',
    });
    expect(() =>
      validateHeartbeatAggregateSnapshot(
        { ...snapshot, unexpected: true },
        '2026-09-14T03:02:00.000Z',
      ),
    ).toThrow('tandem_identity_d3_snapshot:artifact_shape');
    expect(() =>
      validateHeartbeatAggregateSnapshot(
        { ...snapshot, containsNames: true },
        '2026-09-14T03:02:00.000Z',
      ),
    ).toThrow('tandem_identity_d3_snapshot:artifact_privacy_or_authority');
    expect(() =>
      validateHeartbeatAggregateSnapshot(snapshot, '2026-09-15T03:01:00.001Z'),
    ).toThrow('tandem_identity_d3_snapshot:artifact_stale_or_future');
  });
});
