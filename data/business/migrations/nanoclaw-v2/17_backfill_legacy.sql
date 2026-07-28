-- 17_backfill_legacy.sql — Plan #4: Backfill legacy public.* data into business_v2
-- Part of NanoClaw Schema v2 Migration (Plan #4 of 4)
-- Depends: 16_cutover_helpers.sql (Plan #3), 15_seed_programs.sql
--
-- Backfills: 39 leads → parties + pipeline_entries + interactions
--            28 booking_events → interactions (matched to parties by email)
-- Skips:     tasks (no party reference), empty tables (proposals, contracts, etc.)
--
-- Uses reserved ID range 1-9999 for historical party imports.
-- Idempotent: checks for existing data before inserting.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

----------------------------------------------------------------------
-- Preflight: abort if backfill already ran
----------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM business_v2.parties WHERE source_id LIKE 'lead:%') THEN
    RAISE EXCEPTION 'Backfill already applied (parties with source_id=lead:* exist). Aborting.';
  END IF;
END $$;

----------------------------------------------------------------------
-- Phase 1: Leads → Parties + Party Emails + Party Roles
-- Uses explicit IDs in reserved 1-9999 range (lead.id maps directly)
----------------------------------------------------------------------

-- 1a. Insert parties from leads (only those with non-null email)
INSERT INTO business_v2.parties
  (id, party_type, display_name, primary_email, source_provider, source_id, last_updated_by, created_at, updated_at)
SELECT
  l.id,
  'person',
  COALESCE(NULLIF(TRIM(l.name), ''), 'Unknown'),
  LOWER(TRIM(l.email))::citext,
  'wordpress',
  'lead:' || l.id::text,
  'backfill',
  l.created_at,
  l.updated_at
FROM public.leads l
WHERE l.email IS NOT NULL AND TRIM(l.email) <> '';

-- 1b. Insert party_emails
INSERT INTO business_v2.party_emails (party_id, email, is_primary)
SELECT
  l.id,
  LOWER(TRIM(l.email))::citext,
  true
FROM public.leads l
WHERE l.email IS NOT NULL AND TRIM(l.email) <> ''
ON CONFLICT (party_id, email) DO NOTHING;

-- 1c. Insert party_roles — completed leads get 'client', everything else 'prospect'
INSERT INTO business_v2.party_roles (party_id, role_type, started_at, created_at)
SELECT
  l.id,
  CASE WHEN l.status = 'completed' THEN 'client' ELSE 'prospect' END,
  l.created_at,
  l.created_at
FROM public.leads l
WHERE l.email IS NOT NULL AND TRIM(l.email) <> ''
ON CONFLICT (party_id, role_type) WHERE ended_at IS NULL DO NOTHING;

----------------------------------------------------------------------
-- Phase 2: Leads → Pipeline Entries
-- Status mapping: qualified→qualifying, approved/sent/follow-up-sent→proposal,
--                 replied→negotiating, completed→won, cold/closed/archived→lost
----------------------------------------------------------------------

-- Resolve program_id for 'general-inquiry' (all leads are contact-form)
DO $$
DECLARE v_program_id bigint;
BEGIN
  SELECT id INTO v_program_id FROM business_v2.programs WHERE slug = 'general-inquiry';
  IF v_program_id IS NULL THEN
    RAISE EXCEPTION 'program general-inquiry not found';
  END IF;
  PERFORM set_config('app.backfill_program_id', v_program_id::text, true);
END $$;

INSERT INTO business_v2.pipeline_entries
  (party_id, program_id, stage, amount_cents, currency, dedupe_key,
   entered_stage_at, metadata, last_updated_by, created_at, updated_at)
SELECT
  l.id,
  current_setting('app.backfill_program_id')::bigint,
  CASE l.status
    WHEN 'qualified'       THEN 'qualifying'
    WHEN 'approved'        THEN 'proposal'
    WHEN 'sent'            THEN 'proposal'
    WHEN 'follow-up-sent'  THEN 'proposal'
    WHEN 'replied'         THEN 'negotiating'
    WHEN 'completed'       THEN 'won'
    WHEN 'cold'            THEN 'lost'
    WHEN 'closed'          THEN 'lost'
    WHEN 'archived'        THEN 'lost'
    ELSE 'new'
  END,
  0,
  'USD',
  'lead:' || l.id::text,
  COALESCE(l.updated_at, l.created_at),
  jsonb_build_object(
    'legacy_status', l.status,
    'legacy_source', l.source,
    'company', l.company,
    'message', LEFT(l.message, 500),
    'assigned_to', l.assigned_to,
    'follow_up_count', l.follow_up_count,
    'thread_id', l.thread_id,
    'plutio_person_id', l.plutio_person_id
  ),
  'backfill',
  l.created_at,
  l.updated_at
FROM public.leads l
WHERE l.email IS NOT NULL AND TRIM(l.email) <> '';

----------------------------------------------------------------------
-- Phase 3: Leads → Interactions (one form-submission per lead)
----------------------------------------------------------------------

INSERT INTO business_v2.interactions
  (party_id, channel, direction, subject, occurred_at, source_provider, source_id,
   metadata, last_updated_by, created_at, updated_at)
SELECT
  l.id,
  'form-submission',
  'inbound',
  COALESCE(l.source, 'contact-form') || ': ' || COALESCE(l.name, 'unknown'),
  l.created_at,
  'wordpress',
  'lead:' || l.id::text,
  jsonb_build_object('legacy_message', LEFT(l.message, 1000)),
  'backfill',
  l.created_at,
  l.created_at
FROM public.leads l
WHERE l.email IS NOT NULL AND TRIM(l.email) <> '';

-- Also log email interactions for leads that had outbound contact
INSERT INTO business_v2.interactions
  (party_id, channel, direction, subject, occurred_at, source_provider, source_id,
   metadata, last_updated_by, created_at, updated_at)
SELECT
  l.id,
  'email',
  'outbound',
  'Follow-up email #' || l.follow_up_count,
  l.last_contact_at,
  'gmail',
  'lead-followup:' || l.id::text,
  jsonb_build_object('thread_id', l.thread_id, 'follow_up_count', l.follow_up_count),
  'backfill',
  l.last_contact_at,
  l.last_contact_at
FROM public.leads l
WHERE l.email IS NOT NULL AND TRIM(l.email) <> ''
  AND l.last_contact_at IS NOT NULL
  AND l.follow_up_count > 0;

----------------------------------------------------------------------
-- Phase 4: Booking Events → Parties (find-or-create) + Interactions
-- Uses fn_create_party for email matching (IDs at 10000+ range)
----------------------------------------------------------------------

-- Create parties for booking customers not already in leads
-- (fn_create_party is idempotent — returns existing if email matches)
DO $$
DECLARE
  r RECORD;
  v_party_id bigint;
BEGIN
  PERFORM set_config('app.current_agent', 'backfill', true);
  FOR r IN
    SELECT DISTINCT ON (LOWER(TRIM(customer_email)))
      customer_name, LOWER(TRIM(customer_email)) AS email
    FROM public.booking_events
    WHERE customer_email IS NOT NULL AND TRIM(customer_email) <> ''
    ORDER BY LOWER(TRIM(customer_email)), id
  LOOP
    v_party_id := business_v2.fn_create_party(
      'person',
      COALESCE(NULLIF(TRIM(r.customer_name), ''), 'Unknown'),
      r.email::citext,
      'trafft',
      '{}'::jsonb
    );
  END LOOP;
END $$;

-- Insert booking interactions (dedup by trafft_appointment_id + event_type)
INSERT INTO business_v2.interactions
  (party_id, channel, direction, subject, occurred_at,
   source_provider, source_id, metadata, last_updated_by, created_at, updated_at)
SELECT
  COALESCE(
    business_v2.best_party_by_email(LOWER(TRIM(b.customer_email))::citext),
    (SELECT id FROM business_v2.parties ORDER BY id LIMIT 1)
  ),
  'booking',
  'inbound',
  COALESCE(b.service_name, 'Booking') || ' — ' || b.event_type,
  COALESCE(b.start_date_time, b.created_at),
  'trafft',
  b.trafft_appointment_id || ':' || b.event_type,
  jsonb_build_object(
    'trafft_appointment_id', b.trafft_appointment_id,
    'event_type', b.event_type,
    'status', b.status,
    'customer_name', b.customer_name,
    'customer_phone', b.customer_phone,
    'service_name', b.service_name,
    'employee_name', b.employee_name,
    'follow_up_status', b.follow_up_status
  ),
  'backfill',
  b.created_at,
  b.created_at
FROM public.booking_events b
WHERE b.customer_email IS NOT NULL AND TRIM(b.customer_email) <> ''
ON CONFLICT DO NOTHING;

----------------------------------------------------------------------
-- Phase 5: Update sequence high-water mark
-- Ensure parties_id_seq stays above the highest backfilled ID
-- (sequence already starts at 10000, but safety check)
----------------------------------------------------------------------
DO $$
DECLARE v_max bigint;
BEGIN
  SELECT COALESCE(MAX(id), 0) INTO v_max FROM business_v2.parties;
  IF v_max >= 10000 THEN
    -- Advance sequence past max if somehow it's behind
    PERFORM setval('business_v2.parties_id_seq', v_max + 1, false);
  END IF;
END $$;

COMMIT;

\echo 'Backfill complete. Run verification queries below.'
