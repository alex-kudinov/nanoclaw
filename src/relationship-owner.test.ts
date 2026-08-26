import type { QueryResult, QueryResultRow } from 'pg';
import { describe, expect, it } from 'vitest';

import {
  RELATIONSHIP_OWNER_ASSIGNMENTS_SQL,
  resolveRelationshipOwners,
  type RelationshipOwnerQueryPort,
} from './relationship-owner.js';

function result<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return {
    command: 'SELECT',
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows,
  };
}

const DECISION =
  '.program/decisions/decision-relationship-owner-tandem-team-2026-08-26.json';

function row(scopeKey: string, assignmentId: string) {
  return {
    scope_key: scopeKey,
    assignment_id: assignmentId,
    principal_key: 'team:tandem',
    decision_ref: DECISION,
    managing_system: 'tandem_os',
    action_authority: 'none',
  };
}

describe('Tandem OS relationship-owner resolution', () => {
  it('returns the explicit generic Tandem Team assignment for every lane', async () => {
    let sql = '';
    let params: unknown[] | undefined;
    const query: RelationshipOwnerQueryPort = async <T extends QueryResultRow>(
      text: string,
      values?: unknown[],
    ): Promise<QueryResult<T>> => {
      sql = text;
      params = values;
      return result([
        row('proposal_signature', '2'),
        row('receivable', '3'),
        row('sales_conversation', '1'),
      ] as unknown as T[]);
    };

    const owners = await resolveRelationshipOwners(
      '2026-08-26T14:00:00.000Z',
      query,
    );

    expect(sql).toBe(RELATIONSHIP_OWNER_ASSIGNMENTS_SQL);
    expect(params).toEqual(['2026-08-26T14:00:00.000Z']);
    expect([...owners.entries()]).toEqual([
      [
        'proposal_signature',
        {
          principalKey: 'team:tandem',
          assignmentId: '2',
          decisionRef: DECISION,
          managingSystem: 'tandem_os',
          actionAuthority: 'none',
        },
      ],
      [
        'receivable',
        {
          principalKey: 'team:tandem',
          assignmentId: '3',
          decisionRef: DECISION,
          managingSystem: 'tandem_os',
          actionAuthority: 'none',
        },
      ],
      [
        'sales_conversation',
        {
          principalKey: 'team:tandem',
          assignmentId: '1',
          decisionRef: DECISION,
          managingSystem: 'tandem_os',
          actionAuthority: 'none',
        },
      ],
    ]);
  });

  it('returns no fallback when an exact lane assignment is absent', async () => {
    const query: RelationshipOwnerQueryPort = async <
      T extends QueryResultRow,
    >(): Promise<QueryResult<T>> =>
      result([row('proposal_signature', '2')] as unknown as T[]);

    const owners = await resolveRelationshipOwners(
      '2026-08-26T14:00:00.000Z',
      query,
    );

    expect(owners.get('proposal_signature')?.principalKey).toBe('team:tandem');
    expect(owners.has('sales_conversation')).toBe(false);
    expect(owners.has('receivable')).toBe(false);
  });

  it('rejects malformed, action-authorizing, and duplicate evidence', async () => {
    const malformed: RelationshipOwnerQueryPort = async <
      T extends QueryResultRow,
    >(): Promise<QueryResult<T>> =>
      result([
        { ...row('receivable', '3'), action_authority: 'send' },
      ] as unknown as T[]);
    await expect(
      resolveRelationshipOwners('2026-08-26T14:00:00.000Z', malformed),
    ).rejects.toThrow('malformed authoritative assignment');

    const duplicate: RelationshipOwnerQueryPort = async <
      T extends QueryResultRow,
    >(): Promise<QueryResult<T>> =>
      result([
        row('receivable', '3'),
        row('receivable', '4'),
      ] as unknown as T[]);
    await expect(
      resolveRelationshipOwners('2026-08-26T14:00:00.000Z', duplicate),
    ).rejects.toThrow('duplicate authoritative assignment scope');
  });

  it('rejects a malformed observation clock before querying', async () => {
    let called = false;
    const query: RelationshipOwnerQueryPort = async <
      T extends QueryResultRow,
    >(): Promise<QueryResult<T>> => {
      called = true;
      return result([] as T[]);
    };
    await expect(
      resolveRelationshipOwners('not-a-date', query),
    ).rejects.toThrow('observedAt must be ISO-8601');
    expect(called).toBe(false);
  });
});
