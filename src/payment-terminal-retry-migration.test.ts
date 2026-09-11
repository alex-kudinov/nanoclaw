import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'data/business/migrations/nanoclaw-v2/159_payment_terminal_card_retry.sql',
  'utf8',
);
const rollback = readFileSync(
  'data/business/migrations/nanoclaw-v2/rollback_159_payment_terminal_card_retry.sql',
  'utf8',
);

describe('migration159 terminal card retry contract', () => {
  it('pins a three-Session chain and exact operation/attempt/sequence lineage', () => {
    expect(migration).toContain('session_sequence BETWEEN 1 AND 3');
    expect(migration).toContain(
      'UNIQUE(operation_id,attempt_id,session_sequence)',
    );
    expect(migration).toContain(
      'FOREIGN KEY(payment_operation_id,attempt_id,session_sequence)',
    );
    expect(migration).toContain(
      'FOREIGN KEY(predecessor_operation_id,attempt_id,predecessor_session_sequence)',
    );
    expect(migration).toContain('retry_terminal_receipt_sha256,attempt_id,');
    expect(migration).toContain(
      'receipt_sha256,attempt_id,payment_operation_id,session_sequence',
    );
    expect(migration).toContain(
      'predecessor_session_sequence=session_sequence-1',
    );
    expect(migration).toContain(
      "'lease_token','lease_until','predecessor_session_sequence'",
    );
    expect(rollback).toContain("'lease_token','lease_until'])");
    expect(migration).toContain('UNIQUE(retry_terminal_receipt_sha256)');
    expect(migration).toContain('payment_operations_retry_lineage_check');
  });

  it('makes terminal proof and late-positive exceptions immutable and rollback refusing', () => {
    expect(migration).toContain("source='authenticated_session_result'");
    expect(migration).toContain(
      "OLD.state IN ('verified','conflict','terminal_nonpayment')",
    );
    expect(migration).toContain("'late_positive_after_terminal'");
    expect(migration).toContain('payment_session_terminal_receipt_immutable');
    expect(rollback).toContain(
      'rollback refused: terminal retry evidence exists',
    );
  });
});
