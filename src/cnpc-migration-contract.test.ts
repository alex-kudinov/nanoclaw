import fs from 'fs';
import { describe, expect, it } from 'vitest';

const sql = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/116_cnpc_intake_control_plane.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('migration 116 CNPC control-plane contract', () => {
  it('creates the intake, roster, capacity, match, chemistry, engagement, and action ledgers', () => {
    for (const table of [
      'cnpc_intakes',
      'cnpc_coaches',
      'cnpc_coach_capacity_snapshots',
      'cnpc_match_runs',
      'cnpc_match_candidates',
      'cnpc_chemistry_calls',
      'cnpc_engagements',
      'cnpc_action_outbox',
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS business_v2.${table}`);
    }
  });

  it('binds retries and match results to stable source and roster versions', () => {
    expect(sql).toContain('submission_id            text NOT NULL UNIQUE');
    expect(sql).toContain('UNIQUE (intake_id, roster_version, prompt_version)');
    expect(sql).toContain('result_sha256');
    expect(sql).toContain('UNIQUE (match_run_id, coach_id)');
    expect(sql).toContain('UNIQUE (match_run_id, rank)');
  });

  it('does not consume a coach slot until signed and paid evidence exists', () => {
    expect(sql).toContain('cnpc_ready_requires_signed_and_paid');
    expect(sql).toMatch(
      /ready_to_begin_at IS NULL OR\s+\(contract_signed_at IS NOT NULL AND payment_confirmed_at IS NOT NULL\)/,
    );
    expect(sql).toContain("h.status IN ('invited', 'scheduled')");
    expect(sql).toContain('h.soft_hold_expires_at > now()');
  });

  it('keeps base tables host-admin only', () => {
    expect(sql).toContain('REVOKE ALL ON business_v2.cnpc_intakes,');
    expect(sql).toMatch(
      /GRANT ALL ON business_v2\.cnpc_intakes,[\s\S]*?TO nanoclaw_admin;/,
    );
    expect(sql).not.toMatch(/TO nanoclaw_cnpc/);
  });

  it('requires an exact approved payload hash and durable action receipt', () => {
    expect(sql).toContain('approved_payload_sha256');
    expect(sql).toContain('external_receipt');
    expect(sql).toContain('idempotency_key          text NOT NULL UNIQUE');
  });
});
