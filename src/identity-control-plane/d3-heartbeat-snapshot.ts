import { sha256Json } from './canonical.js';

const SHA256 = /^[0-9a-f]{64}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface HeartbeatCensusObservation {
  observedAt: string;
  userCount: number;
  userIdsSha256: string;
  snapshotSha256: string;
  missingEmailCount: number;
  duplicateEmailValuesAcrossUserIds: number;
  zeroGroupUsers: number;
  membershipEdges: number;
  roleMembershipEdges: number;
  accessMembershipEdges: number;
  zeroAccessGroupUsers: number;
  roleCounts: {
    administrator: number;
    instructor: number;
    user: number;
  };
}

export interface HeartbeatAggregateSnapshot {
  schemaVersion: 1;
  kind: 'heartbeat_aggregate_reconciliation_snapshot';
  provider: 'heartbeat';
  environment: 'production';
  sourceScope: 'main';
  collectionMode: 'toolbox_api_census';
  censusObservations: [HeartbeatCensusObservation, HeartbeatCensusObservation];
  groups: Array<{
    groupId: string;
    memberCount: number;
    membershipSha256: string;
  }>;
  webhookInventory: {
    observedAt: string;
    registrationCount: number;
    inventorySha256: string;
  };
  individualIdentityGraphAvailable: false;
  containsNames: false;
  containsEmails: false;
  containsRawPayloads: false;
  containsCredentials: false;
  freshUntil: string;
  artifactSha256: string;
}

type JsonObject = Record<string, unknown>;

function fail(code: string): never {
  throw new Error(`tandem_identity_d3_snapshot:${code}`);
}

function object(value: unknown, code: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value as JsonObject;
}

function exactKeys(
  value: JsonObject,
  expected: readonly string[],
  code: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    fail(code);
  }
}

function nonnegativeInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(code);
  return value as number;
}

function iso(value: unknown, code: string): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    fail(code);
  }
  if (!Number.isFinite(Date.parse(value))) fail(code);
  return value;
}

function hash(value: unknown, code: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) fail(code);
  return value;
}

function parseToolResult(value: unknown, code: string): unknown {
  const root = object(value, code);
  exactKeys(root, ['ok', 'data'], `${code}_shape`);
  if (root.ok !== true) fail(`${code}_not_ok`);
  return root.data;
}

function parseRoleCounts(
  value: unknown,
): HeartbeatCensusObservation['roleCounts'] {
  if (!Array.isArray(value) || value.length !== 3) fail('role_counts_shape');
  const result: Record<string, number> = {};
  for (const entryValue of value) {
    const entry = object(entryValue, 'role_count_invalid');
    exactKeys(entry, ['role', 'count'], 'role_count_shape');
    if (!['Administrator', 'Instructor', 'User'].includes(String(entry.role))) {
      fail('role_count_name');
    }
    if (Object.hasOwn(result, String(entry.role))) fail('role_count_duplicate');
    result[String(entry.role)] = nonnegativeInteger(
      entry.count,
      'role_count_invalid',
    );
  }
  return {
    administrator: result.Administrator,
    instructor: result.Instructor,
    user: result.User,
  };
}

function parseCensus(value: unknown): {
  observation: HeartbeatCensusObservation;
  groups: HeartbeatAggregateSnapshot['groups'];
} {
  const data = object(parseToolResult(value, 'census'), 'census_data');
  const required = [
    'instance',
    'complete',
    'observed_at',
    'user_count',
    'user_ids_sha256',
    'snapshot_sha256',
    'disposition',
    'missing_email_count',
    'duplicate_email_values_across_user_ids',
    'zero_group_users',
    'membership_edges',
    'role_membership_edges',
    'access_membership_edges',
    'zero_access_group_users',
    'role_counts',
    'status_counts',
    'created_at',
    'updated_at',
    'groups',
  ];
  exactKeys(data, required, 'census_data_shape');
  if (data.instance !== 'main' || data.complete !== true)
    fail('census_scope_or_completeness');
  if (!Array.isArray(data.groups) || data.groups.length === 0)
    fail('groups_shape');
  const seen = new Set<string>();
  const groups = data.groups
    .map((groupValue) => {
      const group = object(groupValue, 'group_invalid');
      exactKeys(
        group,
        ['group_id', 'group_name', 'member_count', 'membership_sha256'],
        'group_shape',
      );
      if (typeof group.group_id !== 'string' || !UUID.test(group.group_id))
        fail('group_id');
      if (typeof group.group_name !== 'string' || group.group_name.length === 0)
        fail('group_name');
      if (seen.has(group.group_id)) fail('group_duplicate');
      seen.add(group.group_id);
      return {
        groupId: group.group_id,
        memberCount: nonnegativeInteger(
          group.member_count,
          'group_member_count',
        ),
        membershipSha256: hash(
          group.membership_sha256,
          'group_membership_hash',
        ),
      };
    })
    .sort((left, right) => left.groupId.localeCompare(right.groupId));
  return {
    observation: {
      observedAt: iso(data.observed_at, 'census_observed_at'),
      userCount: nonnegativeInteger(data.user_count, 'user_count'),
      userIdsSha256: hash(data.user_ids_sha256, 'user_ids_hash'),
      snapshotSha256: hash(data.snapshot_sha256, 'snapshot_hash'),
      missingEmailCount: nonnegativeInteger(
        data.missing_email_count,
        'missing_email_count',
      ),
      duplicateEmailValuesAcrossUserIds: nonnegativeInteger(
        data.duplicate_email_values_across_user_ids,
        'duplicate_email_count',
      ),
      zeroGroupUsers: nonnegativeInteger(
        data.zero_group_users,
        'zero_group_users',
      ),
      membershipEdges: nonnegativeInteger(
        data.membership_edges,
        'membership_edges',
      ),
      roleMembershipEdges: nonnegativeInteger(
        data.role_membership_edges,
        'role_membership_edges',
      ),
      accessMembershipEdges: nonnegativeInteger(
        data.access_membership_edges,
        'access_membership_edges',
      ),
      zeroAccessGroupUsers: nonnegativeInteger(
        data.zero_access_group_users,
        'zero_access_group_users',
      ),
      roleCounts: parseRoleCounts(data.role_counts),
    },
    groups,
  };
}

function webhookFingerprint(value: unknown): {
  registrationCount: number;
  inventorySha256: string;
} {
  const data = parseToolResult(value, 'webhooks');
  if (!Array.isArray(data)) fail('webhooks_data_shape');
  const sanitized = data
    .map((itemValue) => {
      const item = object(itemValue, 'webhook_invalid');
      exactKeys(
        item,
        ['id', 'action', 'filter', 'destination_host', 'url_sha256'],
        'webhook_shape',
      );
      if (typeof item.id !== 'string' || !UUID.test(item.id))
        fail('webhook_id');
      if (
        typeof item.action !== 'string' ||
        !/^[A-Z][A-Z0-9_]{1,99}$/.test(item.action)
      )
        fail('webhook_action');
      object(item.filter, 'webhook_filter');
      if (
        typeof item.destination_host !== 'string' ||
        item.destination_host.length === 0
      )
        fail('webhook_host');
      hash(item.url_sha256, 'webhook_url_hash');
      return item;
    })
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  return {
    registrationCount: sanitized.length,
    inventorySha256: sha256Json(sanitized),
  };
}

function comparableObservation(
  observation: HeartbeatCensusObservation,
): Omit<HeartbeatCensusObservation, 'observedAt'> {
  const { observedAt: _ignored, ...rest } = observation;
  return rest;
}

export function prepareHeartbeatAggregateSnapshot(input: {
  firstCensus: unknown;
  secondCensus: unknown;
  webhooks: unknown;
  webhookObservedAt: string;
}): HeartbeatAggregateSnapshot {
  const first = parseCensus(input.firstCensus);
  const second = parseCensus(input.secondCensus);
  if (first.observation.observedAt >= second.observation.observedAt)
    fail('census_order');
  if (
    Date.parse(second.observation.observedAt) -
      Date.parse(first.observation.observedAt) >
    15 * 60 * 1000
  ) {
    fail('census_observation_gap');
  }
  if (
    sha256Json(comparableObservation(first.observation)) !==
    sha256Json(comparableObservation(second.observation))
  ) {
    fail('census_changed');
  }
  if (sha256Json(first.groups) !== sha256Json(second.groups))
    fail('group_membership_changed');
  if (
    second.observation.missingEmailCount !== 0 ||
    second.observation.duplicateEmailValuesAcrossUserIds !== 0 ||
    second.observation.zeroGroupUsers !== 0
  ) {
    fail('census_identity_quality');
  }
  if (
    second.observation.roleMembershipEdges +
      second.observation.accessMembershipEdges !==
    second.observation.membershipEdges
  ) {
    fail('membership_edge_totals');
  }
  const webhookObservedAt = iso(input.webhookObservedAt, 'webhook_observed_at');
  if (
    Math.abs(
      Date.parse(webhookObservedAt) - Date.parse(second.observation.observedAt),
    ) >
    15 * 60 * 1000
  ) {
    fail('webhook_census_gap');
  }
  const fingerprint = webhookFingerprint(input.webhooks);
  const freshUntil = new Date(
    Date.parse(second.observation.observedAt) + DAY_MS,
  ).toISOString();
  const unsigned = {
    schemaVersion: 1 as const,
    kind: 'heartbeat_aggregate_reconciliation_snapshot' as const,
    provider: 'heartbeat' as const,
    environment: 'production' as const,
    sourceScope: 'main' as const,
    collectionMode: 'toolbox_api_census' as const,
    censusObservations: [first.observation, second.observation] as [
      HeartbeatCensusObservation,
      HeartbeatCensusObservation,
    ],
    groups: second.groups,
    webhookInventory: { observedAt: webhookObservedAt, ...fingerprint },
    individualIdentityGraphAvailable: false as const,
    containsNames: false as const,
    containsEmails: false as const,
    containsRawPayloads: false as const,
    containsCredentials: false as const,
    freshUntil,
  };
  return { ...unsigned, artifactSha256: sha256Json(unsigned) };
}

export function validateHeartbeatAggregateSnapshot(
  value: unknown,
  importedAt: string,
): HeartbeatAggregateSnapshot {
  const snapshot = object(value, 'artifact');
  exactKeys(
    snapshot,
    [
      'schemaVersion',
      'kind',
      'provider',
      'environment',
      'sourceScope',
      'collectionMode',
      'censusObservations',
      'groups',
      'webhookInventory',
      'individualIdentityGraphAvailable',
      'containsNames',
      'containsEmails',
      'containsRawPayloads',
      'containsCredentials',
      'freshUntil',
      'artifactSha256',
    ],
    'artifact_shape',
  );
  if (
    snapshot.schemaVersion !== 1 ||
    snapshot.kind !== 'heartbeat_aggregate_reconciliation_snapshot' ||
    snapshot.provider !== 'heartbeat' ||
    snapshot.environment !== 'production' ||
    snapshot.sourceScope !== 'main' ||
    snapshot.collectionMode !== 'toolbox_api_census'
  ) {
    fail('artifact_contract');
  }
  if (
    snapshot.individualIdentityGraphAvailable !== false ||
    snapshot.containsNames !== false ||
    snapshot.containsEmails !== false ||
    snapshot.containsRawPayloads !== false ||
    snapshot.containsCredentials !== false
  ) {
    fail('artifact_privacy_or_authority');
  }
  if (
    !Array.isArray(snapshot.censusObservations) ||
    snapshot.censusObservations.length !== 2 ||
    !Array.isArray(snapshot.groups)
  ) {
    fail('artifact_collections');
  }
  const webhook = object(snapshot.webhookInventory, 'artifact_webhook');
  exactKeys(
    webhook,
    ['observedAt', 'registrationCount', 'inventorySha256'],
    'artifact_webhook_shape',
  );
  iso(webhook.observedAt, 'artifact_webhook_time');
  nonnegativeInteger(webhook.registrationCount, 'artifact_webhook_count');
  hash(webhook.inventorySha256, 'artifact_webhook_hash');
  const observations = snapshot.censusObservations.map((entry, index) => {
    const observation = object(entry, `artifact_census_${index}`);
    exactKeys(
      observation,
      [
        'observedAt',
        'userCount',
        'userIdsSha256',
        'snapshotSha256',
        'missingEmailCount',
        'duplicateEmailValuesAcrossUserIds',
        'zeroGroupUsers',
        'membershipEdges',
        'roleMembershipEdges',
        'accessMembershipEdges',
        'zeroAccessGroupUsers',
        'roleCounts',
      ],
      `artifact_census_${index}_shape`,
    );
    const roles = object(observation.roleCounts, 'artifact_roles');
    exactKeys(
      roles,
      ['administrator', 'instructor', 'user'],
      'artifact_roles_shape',
    );
    return {
      observedAt: iso(observation.observedAt, 'artifact_observed_at'),
      userCount: nonnegativeInteger(
        observation.userCount,
        'artifact_user_count',
      ),
      userIdsSha256: hash(observation.userIdsSha256, 'artifact_user_hash'),
      snapshotSha256: hash(
        observation.snapshotSha256,
        'artifact_snapshot_hash',
      ),
      missingEmailCount: nonnegativeInteger(
        observation.missingEmailCount,
        'artifact_missing_email',
      ),
      duplicateEmailValuesAcrossUserIds: nonnegativeInteger(
        observation.duplicateEmailValuesAcrossUserIds,
        'artifact_duplicate_email',
      ),
      zeroGroupUsers: nonnegativeInteger(
        observation.zeroGroupUsers,
        'artifact_zero_groups',
      ),
      membershipEdges: nonnegativeInteger(
        observation.membershipEdges,
        'artifact_edges',
      ),
      roleMembershipEdges: nonnegativeInteger(
        observation.roleMembershipEdges,
        'artifact_role_edges',
      ),
      accessMembershipEdges: nonnegativeInteger(
        observation.accessMembershipEdges,
        'artifact_access_edges',
      ),
      zeroAccessGroupUsers: nonnegativeInteger(
        observation.zeroAccessGroupUsers,
        'artifact_zero_access',
      ),
      roleCounts: {
        administrator: nonnegativeInteger(
          roles.administrator,
          'artifact_admin_roles',
        ),
        instructor: nonnegativeInteger(
          roles.instructor,
          'artifact_instructor_roles',
        ),
        user: nonnegativeInteger(roles.user, 'artifact_user_roles'),
      },
    } satisfies HeartbeatCensusObservation;
  }) as [HeartbeatCensusObservation, HeartbeatCensusObservation];
  if (
    observations[0].observedAt >= observations[1].observedAt ||
    Date.parse(observations[1].observedAt) -
      Date.parse(observations[0].observedAt) >
      15 * 60 * 1000 ||
    sha256Json(comparableObservation(observations[0])) !==
      sha256Json(comparableObservation(observations[1]))
  ) {
    fail('artifact_census_stability');
  }
  const groups = snapshot.groups.map((entry, index) => {
    const group = object(entry, `artifact_group_${index}`);
    exactKeys(
      group,
      ['groupId', 'memberCount', 'membershipSha256'],
      'artifact_group_shape',
    );
    if (typeof group.groupId !== 'string' || !UUID.test(group.groupId))
      fail('artifact_group_id');
    return {
      groupId: group.groupId,
      memberCount: nonnegativeInteger(
        group.memberCount,
        'artifact_group_count',
      ),
      membershipSha256: hash(group.membershipSha256, 'artifact_group_hash'),
    };
  });
  if (
    groups.length === 0 ||
    groups.some(
      (group, index) => index > 0 && groups[index - 1].groupId >= group.groupId,
    )
  )
    fail('artifact_group_order');
  if (
    observations[1].missingEmailCount !== 0 ||
    observations[1].duplicateEmailValuesAcrossUserIds !== 0 ||
    observations[1].zeroGroupUsers !== 0
  ) {
    fail('artifact_census_identity_quality');
  }
  if (
    observations[1].roleMembershipEdges +
      observations[1].accessMembershipEdges !==
    observations[1].membershipEdges
  ) {
    fail('artifact_membership_edge_totals');
  }
  if (
    Math.abs(
      Date.parse(String(webhook.observedAt)) -
        Date.parse(observations[1].observedAt),
    ) >
    15 * 60 * 1000
  ) {
    fail('artifact_webhook_census_gap');
  }
  const freshUntil = iso(snapshot.freshUntil, 'artifact_fresh_until');
  if (
    Date.parse(freshUntil) !==
    Date.parse(observations[1].observedAt) + DAY_MS
  )
    fail('artifact_freshness_contract');
  const importTime = Date.parse(iso(importedAt, 'imported_at'));
  if (
    importTime < Date.parse(observations[1].observedAt) ||
    importTime > Date.parse(freshUntil)
  )
    fail('artifact_stale_or_future');
  const artifactSha256 = hash(snapshot.artifactSha256, 'artifact_hash');
  const { artifactSha256: _ignored, ...unsigned } = snapshot;
  if (sha256Json(unsigned) !== artifactSha256) fail('artifact_hash_mismatch');
  return value as HeartbeatAggregateSnapshot;
}
