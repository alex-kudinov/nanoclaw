import fs from 'fs';
import { describe, expect, it } from 'vitest';

const sql = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/114_procurement_control_plane.sql',
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
