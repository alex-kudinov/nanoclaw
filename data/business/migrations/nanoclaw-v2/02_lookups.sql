-- 02_lookups.sql — 14 lookup tables with deterministic seeds
-- Part of NanoClaw Schema v2 Migration (Plan #1 of 4)
-- Shape: key text PK, label text NOT NULL, ... + ON CONFLICT (key) DO NOTHING seeds.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

-- 1. role_types — 12 keys
CREATE TABLE business_v2.role_types (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL,
  is_person_only boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE business_v2.role_types IS 'Party role type taxonomy (buyer/provider/internal/other).';

INSERT INTO business_v2.role_types (key, label, category, is_person_only) VALUES
  ('prospect',    'Prospect',    'buyer',    false),
  ('client',      'Client',      'buyer',    false),
  ('student',     'Student',     'buyer',    true),
  ('coach',       'Coach',       'provider', true),
  ('trainer',     'Trainer',     'provider', true),
  ('mentor',      'Mentor',      'provider', true),
  ('supervisor',  'Supervisor',  'provider', true),
  ('facilitator', 'Facilitator', 'provider', true),
  ('vendor',      'Vendor',      'provider', false),
  ('partner',     'Partner',     'provider', false),
  ('staff',       'Staff',       'internal', true),
  ('contact',     'Contact',     'other',    false)
ON CONFLICT (key) DO NOTHING;

-- 2. contact_roles — 8 keys
CREATE TABLE business_v2.contact_roles (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE business_v2.contact_roles IS 'Contact role within an org relationship (billing, decision-maker, etc.).';

INSERT INTO business_v2.contact_roles (key, label) VALUES
  ('primary-contact',     'Primary Contact'),
  ('billing-contact',     'Billing Contact'),
  ('contracting-contact', 'Contracting Contact'),
  ('decision-maker',      'Decision Maker'),
  ('participant',         'Participant'),
  ('champion',            'Champion'),
  ('gatekeeper',          'Gatekeeper'),
  ('other',               'Other')
ON CONFLICT (key) DO NOTHING;

-- 3. relationship_types — 7 keys
CREATE TABLE business_v2.relationship_types (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE business_v2.relationship_types IS 'Directional party-to-party relationship taxonomy.';

INSERT INTO business_v2.relationship_types (key, label, description) VALUES
  ('employed-by',     'Employed By',     'Person works for organization'),
  ('represents',      'Represents',      'Person acts as public-facing agent/rep'),
  ('affiliated-with', 'Affiliated With', 'Advisor, board member, alumni'),
  ('refers',          'Refers',          'Referral source tracking'),
  ('reports-to',      'Reports To',      'Internal hierarchy'),
  ('coaches',         'Coaches',         'Informal coaching/mentorship'),
  ('partnered-with',  'Partnered With',  'Business partnership')
ON CONFLICT (key) DO NOTHING;

-- 4. program_kinds — 6 keys
CREATE TABLE business_v2.program_kinds (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE business_v2.program_kinds IS 'Program delivery model taxonomy.';

INSERT INTO business_v2.program_kinds (key, label) VALUES
  ('cohort',           'Cohort'),
  ('self-paced',       'Self-Paced'),
  ('coaching-service', 'Coaching Service'),
  ('mentor-service',   'Mentor Service'),
  ('supervision',      'Supervision'),
  ('certification',    'Certification')
ON CONFLICT (key) DO NOTHING;

-- 5. engagement_kinds — 5 keys
CREATE TABLE business_v2.engagement_kinds (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE business_v2.engagement_kinds IS 'Engagement delivery type taxonomy.';

INSERT INTO business_v2.engagement_kinds (key, label) VALUES
  ('cohort-delivery',    'Cohort Delivery'),
  ('coaching-package',   'Coaching Package'),
  ('mentor-pair',        'Mentor Pair'),
  ('supervision-series', 'Supervision Series'),
  ('bespoke',            'Bespoke')
ON CONFLICT (key) DO NOTHING;

-- 6. participant_roles — 5 keys
CREATE TABLE business_v2.participant_roles (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE business_v2.participant_roles IS 'Role a party plays within an engagement.';

INSERT INTO business_v2.participant_roles (key, label) VALUES
  ('student',    'Student'),
  ('instructor', 'Instructor'),
  ('mentor',     'Mentor'),
  ('supervisor', 'Supervisor'),
  ('client',     'Client')
ON CONFLICT (key) DO NOTHING;

-- 7. pipeline_stages — 8 keys
CREATE TABLE business_v2.pipeline_stages (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  sort_order int NOT NULL,
  is_terminal boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE business_v2.pipeline_stages IS 'Sales pipeline stage taxonomy with terminal flag.';

INSERT INTO business_v2.pipeline_stages (key, label, sort_order, is_terminal) VALUES
  ('new',         'New',         1, false),
  ('qualifying',  'Qualifying',  2, false),
  ('proposal',    'Proposal',    3, false),
  ('negotiating', 'Negotiating', 4, false),
  ('won',         'Won',         5, true),
  ('lost',        'Lost',        6, true),
  ('nurture',     'Nurture',     7, false),
  ('paused',      'Paused',      8, false)
ON CONFLICT (key) DO NOTHING;

-- 8. lost_reasons — 10 keys
CREATE TABLE business_v2.lost_reasons (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE business_v2.lost_reasons IS 'Reason a pipeline entry was marked lost.';

INSERT INTO business_v2.lost_reasons (key, label) VALUES
  ('budget',            'Budget'),
  ('timing',            'Timing'),
  ('competitor',        'Competitor'),
  ('wrong-fit',         'Wrong Fit'),
  ('no-response',       'No Response'),
  ('duplicate',         'Duplicate'),
  ('spam',              'Spam'),
  ('internal-decision', 'Internal Decision'),
  ('scope-change',      'Scope Change'),
  ('other',             'Other')
ON CONFLICT (key) DO NOTHING;

-- 9. interaction_channels — 9 keys
CREATE TABLE business_v2.interaction_channels (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE business_v2.interaction_channels IS 'Communication channel taxonomy for interactions.';

INSERT INTO business_v2.interaction_channels (key, label) VALUES
  ('email',           'Email'),
  ('meeting',         'Meeting'),
  ('call',            'Call'),
  ('form-submission', 'Form Submission'),
  ('booking',         'Booking'),
  ('payment',         'Payment'),
  ('slack',           'Slack'),
  ('whatsapp',        'WhatsApp'),
  ('other',           'Other')
ON CONFLICT (key) DO NOTHING;

-- 10. source_providers — 10 keys
CREATE TABLE business_v2.source_providers (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE business_v2.source_providers IS 'External system that originated a record.';

INSERT INTO business_v2.source_providers (key, label) VALUES
  ('plutio',    'Plutio'),
  ('gmail',     'Gmail'),
  ('slack',     'Slack'),
  ('whatsapp',  'WhatsApp'),
  ('trafft',    'Trafft'),
  ('zoom',      'Zoom'),
  ('wordpress', 'WordPress'),
  ('linkedin',  'LinkedIn'),
  ('manual',    'Manual'),
  ('other',     'Other')
ON CONFLICT (key) DO NOTHING;

-- 11. document_kinds — 8 keys
CREATE TABLE business_v2.document_kinds (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE business_v2.document_kinds IS 'Document type taxonomy.';

INSERT INTO business_v2.document_kinds (key, label) VALUES
  ('proposal',              'Proposal'),
  ('contract',              'Contract'),
  ('invoice',               'Invoice'),
  ('receipt',               'Receipt'),
  ('certificate',           'Certificate'),
  ('agreement',             'Agreement'),
  ('letter-of-engagement',  'Letter of Engagement'),
  ('statement',             'Statement')
ON CONFLICT (key) DO NOTHING;

-- 12. document_statuses — 7 keys
CREATE TABLE business_v2.document_statuses (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE business_v2.document_statuses IS 'Document lifecycle status taxonomy.';

INSERT INTO business_v2.document_statuses (key, label) VALUES
  ('draft',     'Draft'),
  ('sent',      'Sent'),
  ('signed',    'Signed'),
  ('paid',      'Paid'),
  ('overdue',   'Overdue'),
  ('void',      'Void'),
  ('cancelled', 'Cancelled')
ON CONFLICT (key) DO NOTHING;

-- 13. plutio_outbox_operations — 5 keys
CREATE TABLE business_v2.plutio_outbox_operations (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE business_v2.plutio_outbox_operations IS 'Plutio outbox operation types.';

INSERT INTO business_v2.plutio_outbox_operations (key, label) VALUES
  ('create',   'Create'),
  ('update',   'Update'),
  ('delete',   'Delete'),
  ('sync',     'Sync'),
  ('validate', 'Validate')
ON CONFLICT (key) DO NOTHING;

-- 14. plutio_outbox_statuses — 5 keys (extra: is_terminal, sort_order)
CREATE TABLE business_v2.plutio_outbox_statuses (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  is_terminal boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL,
  enabled boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE business_v2.plutio_outbox_statuses IS 'Plutio outbox processing status with terminal flag.';

INSERT INTO business_v2.plutio_outbox_statuses (key, label, is_terminal, sort_order) VALUES
  ('pending',   'Pending',   false, 1),
  ('in_flight', 'In Flight', false, 2),
  ('processed', 'Processed', true,  3),
  ('failed',    'Failed',    false, 4),
  ('dead',      'Dead',      true,  5)
ON CONFLICT (key) DO NOTHING;

COMMIT;
