-- 15_seed_programs.sql — Seed initial programs for Plan #3 (agent cutover)
-- Part of NanoClaw Schema v2 Migration (Plan #3 of 4)
-- Depends: 06_programs.sql (programs table)
-- Idempotent: ON CONFLICT DO NOTHING

SET search_path TO business_v2, public, pg_catalog;

INSERT INTO business_v2.programs (slug, kind, display_name)
VALUES
  ('coaching-inquiry',       'coaching-service', 'Coaching Inquiry'),
  ('certification-inquiry',  'certification',    'Certification Inquiry'),
  ('general-inquiry',        'coaching-service', 'General Inquiry')
ON CONFLICT (slug) DO NOTHING;
