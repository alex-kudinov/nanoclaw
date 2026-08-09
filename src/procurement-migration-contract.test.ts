import fs from 'fs';
import { describe, expect, it } from 'vitest';

const sql = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/114_procurement_control_plane.sql',
    import.meta.url,
  ),
  'utf8',
);
const pursuitSql = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/115_procurement_pursuit.sql',
    import.meta.url,
  ),
  'utf8',
);
const rollbackSql = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/rollback_115_procurement_pursuit.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('migration 114 Procurement review contract', () => {
  it('binds cards to opportunity version, Slack message, and action epoch', () => {
    expect(sql).toContain(
      'CREATE TABLE IF NOT EXISTS public.procurement_review_cards',
    );
    expect(sql).toContain(
      'UNIQUE (opportunity_id, review_version, action_epoch)',
    );
    expect(sql).toContain('UNIQUE (channel_jid, message_ts)');
    expect(sql).toContain('public.fn_apply_procurement_review_card_decision');
  });

  it('atomically rejects stale cards and consumes open cards', () => {
    expect(sql).toContain("v_card.state <> 'open'");
    expect(sql).toContain('v_card.review_version <> p_expected_version');
    expect(sql).toContain('v_card.action_epoch <> btrim(p_action_epoch)');
    expect(sql).toContain("SET state = 'decided'");
    expect(sql).toContain("SET state = 'superseded'");
  });

  it('keeps all write functions host-admin only', () => {
    expect(sql).toContain(
      'REVOKE ALL ON FUNCTION public.fn_apply_procurement_review_card_decision',
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.fn_apply_procurement_review_card_decision\([\s\S]*?\) TO nanoclaw_admin;/,
    );
    expect(sql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.fn_(?:record|apply)_procurement[\s\S]*?TO nanoclaw_procurement;/,
    );
  });

  it('contains the legacy Procurement role to source-keyless Bonfire rows', () => {
    expect(sql).toContain(
      'ALTER TABLE public.procurement_opportunities ENABLE ROW LEVEL SECURITY',
    );
    expect(sql).toMatch(
      /CREATE POLICY procurement_legacy_bonfire_read[\s\S]*?FOR SELECT[\s\S]*?TO nanoclaw_procurement[\s\S]*?USING \(source = 'bonfire' AND source_key IS NULL\);/,
    );
    expect(sql).toMatch(
      /CREATE POLICY procurement_legacy_bonfire_insert[\s\S]*?FOR INSERT[\s\S]*?TO nanoclaw_procurement[\s\S]*?WITH CHECK \(source = 'bonfire' AND source_key IS NULL\);/,
    );
    expect(sql).toMatch(
      /CREATE POLICY procurement_legacy_bonfire_update[\s\S]*?FOR UPDATE[\s\S]*?TO nanoclaw_procurement[\s\S]*?USING \(source = 'bonfire' AND source_key IS NULL\)[\s\S]*?WITH CHECK \(source = 'bonfire' AND source_key IS NULL\);/,
    );
  });

  it('binds repeated source-run keys to the same batch hash', () => {
    expect(sql).toContain("v_existing.metadata ->> 'batch_hash'");
    expect(sql).toContain('was reused with a different batch');
  });
});

describe('migration 115 Procurement closure contract', () => {
  it('creates a pursuit only inside the bound-card decision transaction', () => {
    expect(
      pursuitSql.match(/INSERT INTO public\.procurement_pursuits/g),
    ).toHaveLength(1);
    expect(pursuitSql).toContain('source_review_card_id');
    expect(pursuitSql).toContain('UNIQUE (opportunity_id, decision_version)');
    expect(pursuitSql).toContain(
      'process decisions require a bound Procurement review card',
    );
  });

  it('keeps future proposal states declared but unreachable', () => {
    expect(pursuitSql).toContain("'proposal_ready', 'submitted', 'passed'");
    expect(pursuitSql).toContain(
      "p_target_state NOT IN ('assessing', 'blocked', 'passed')",
    );
  });

  it('derives source completeness from host-planned coverage', () => {
    expect(pursuitSql).toContain('fn_begin_procurement_source_run_v2');
    expect(pursuitSql).toContain('fn_complete_procurement_source_run_v2');
    expect(pursuitSql).toContain(
      "WHEN jsonb_array_length(v_missing) = 0 THEN 'complete'",
    );
    expect(pursuitSql).toContain(
      'observed procurement unit is not host-planned',
    );
    expect(pursuitSql).toContain(
      'coverage evidence must exactly receipt every observed unit',
    );
    expect(pursuitSql).toContain("v_run.status IN ('failed', 'partial')");
    expect(pursuitSql).toContain('was reused with different evidence');
    expect(pursuitSql).toContain('procurement_source_run_opportunities');
  });

  it('validates migration 114 and preserves its RLS policy definitions', () => {
    expect(pursuitSql).toContain(
      'VALIDATE CONSTRAINT procurement_review_state_check',
    );
    expect(pursuitSql).not.toContain('procurement_legacy_bonfire_read');
    expect(pursuitSql).not.toContain('procurement_legacy_bonfire_insert');
    expect(pursuitSql).not.toContain('procurement_legacy_bonfire_update');
  });

  it('grants the container only the bounded pursuit view', () => {
    expect(pursuitSql).toMatch(
      /GRANT SELECT ON public\.v_procurement_pursuit_queue[\s\S]*?TO nanoclaw_procurement/,
    );
    expect(pursuitSql).not.toMatch(
      /GRANT (?:SELECT|INSERT|UPDATE|DELETE) ON public\.procurement_pursuits[\s\S]*?TO nanoclaw_procurement/,
    );
    expect(pursuitSql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.fn_apply_procurement_pursuit_advance[\s\S]*?TO nanoclaw_procurement/,
    );
  });

  it('keeps alerts pending until an explicit delivery acknowledgment', () => {
    expect(pursuitSql).toContain('delivered_at');
    expect(pursuitSql).toContain('fn_ack_procurement_reconciler_alert');
    expect(pursuitSql).toContain('WHERE a.delivered_at IS NULL');
    expect(pursuitSql).toContain('date::text subject_version');
    expect(pursuitSql).not.toContain("interval '5 seconds'");
  });

  it('records successful human-action receipts transactionally and bounds retries', () => {
    expect(pursuitSql).toContain("'decision_receipt', 'opportunity'");
    expect(pursuitSql).toContain("'pursuit_receipt', 'pursuit'");
    expect(pursuitSql).toContain('channel_jid');
    expect(pursuitSql).toContain('thread_ts');
    expect(pursuitSql).toMatch(/WHERE a\.delivered_at IS NULL[\s\S]*?LIMIT 50/);
    expect(pursuitSql).toContain(
      'CREATE INDEX IF NOT EXISTS idx_procurement_reconciler_alerts_pending',
    );
  });

  it('ships a non-auto-discovered rollback with the migration-114 bodies', () => {
    expect(rollbackSql).toContain(
      'CREATE OR REPLACE FUNCTION public.fn_transition_procurement_review',
    );
    expect(rollbackSql).toContain(
      'CREATE OR REPLACE FUNCTION public.fn_apply_procurement_review_card_decision',
    );
    expect(rollbackSql).toContain(
      'DROP VIEW IF EXISTS public.v_procurement_pursuit_queue',
    );
    expect(rollbackSql).toContain('SET auto_archive = true');
  });
});
