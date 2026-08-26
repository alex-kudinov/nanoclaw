/**
 * Host-only Tandem OS relationship-owner resolution.
 *
 * The database registry is the sole authority. Missing, malformed, or
 * unavailable assignment evidence returns no owner or throws; callers must
 * never fall back to a creator, sender, execution group, or recent activity.
 */

import type { QueryResult, QueryResultRow } from 'pg';

import { query } from './business-db.js';
import type { FollowupLane } from './followup-policy.js';

const POSITIVE_ID_RE = /^[1-9][0-9]*$/;
const PRINCIPAL_KEY_RE = /^[a-z][a-z0-9._:-]{0,127}$/;
const DECISION_REF_RE = /^\.program\/decisions\/[a-z0-9._-]+\.json$/;

export interface RelationshipOwnerEvidence {
  principalKey: string;
  assignmentId: string;
  decisionRef: string;
  managingSystem: 'tandem_os';
  actionAuthority: 'none';
}

interface RelationshipOwnerRow extends QueryResultRow {
  scope_key: FollowupLane;
  assignment_id: string;
  principal_key: string;
  decision_ref: string;
  managing_system: string;
  action_authority: string;
}

export interface RelationshipOwnerQueryPort {
  <T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
}

export const RELATIONSHIP_OWNER_ASSIGNMENTS_SQL = `
WITH ranked AS (
  SELECT a.scope_key,
         a.id,
         a.principal_key,
         a.decision_ref,
         p.managing_system,
         p.action_authority,
         row_number() OVER (
           PARTITION BY a.scope_type, a.scope_key
           ORDER BY a.effective_from DESC, a.id DESC
         ) AS assignment_rank
    FROM business_v2.relationship_owner_assignments a
    JOIN business_v2.relationship_owner_principals p
      ON p.principal_key = a.principal_key
   WHERE a.scope_type = 'followup_lane'
     AND a.effective_from <= $1::timestamptz
)
SELECT scope_key,
       id::text AS assignment_id,
       principal_key,
       decision_ref,
       managing_system,
       action_authority
  FROM ranked
 WHERE assignment_rank = 1
 ORDER BY scope_key
`;

const FOLLOWUP_LANES = new Set<FollowupLane>([
  'sales_conversation',
  'proposal_signature',
  'receivable',
]);

function evidence(row: RelationshipOwnerRow): RelationshipOwnerEvidence {
  if (
    !FOLLOWUP_LANES.has(row.scope_key) ||
    !POSITIVE_ID_RE.test(row.assignment_id) ||
    !PRINCIPAL_KEY_RE.test(row.principal_key) ||
    !DECISION_REF_RE.test(row.decision_ref) ||
    row.managing_system !== 'tandem_os' ||
    row.action_authority !== 'none'
  ) {
    throw new Error('relationship-owner: malformed authoritative assignment');
  }
  return {
    principalKey: row.principal_key,
    assignmentId: row.assignment_id,
    decisionRef: row.decision_ref,
    managingSystem: 'tandem_os',
    actionAuthority: 'none',
  };
}

export async function resolveRelationshipOwners(
  observedAt: string,
  queryPort: RelationshipOwnerQueryPort = query,
): Promise<Map<FollowupLane, RelationshipOwnerEvidence>> {
  if (!Number.isFinite(Date.parse(observedAt))) {
    throw new Error('relationship-owner: observedAt must be ISO-8601');
  }
  const result = await queryPort<RelationshipOwnerRow>(
    RELATIONSHIP_OWNER_ASSIGNMENTS_SQL,
    [observedAt],
  );
  const owners = new Map<FollowupLane, RelationshipOwnerEvidence>();
  for (const row of result.rows) {
    if (owners.has(row.scope_key)) {
      throw new Error(
        'relationship-owner: duplicate authoritative assignment scope',
      );
    }
    owners.set(row.scope_key, evidence(row));
  }
  return owners;
}
