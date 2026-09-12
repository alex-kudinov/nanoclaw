-- NC-20260909-003. Seven-year checkout-document retention, legal holds and
-- privacy-minimized immutable purge tombstones. Requires an empty v1 document
-- store so the approved v2 Paid semantics and branded bytes cannot be confused
-- with already-issued v1 artifacts.
BEGIN;
SET LOCAL search_path TO pg_catalog;

DO $$ BEGIN
  IF to_regclass('business_v2.payment_checkout_documents') IS NULL OR
     to_regclass('business_v2.payment_checkout_document_email_jobs') IS NULL THEN
    RAISE EXCEPTION 'migration 163 required';
  END IF;
  IF EXISTS (SELECT 1 FROM business_v2.payment_checkout_documents) OR
     EXISTS (SELECT 1 FROM business_v2.payment_checkout_document_email_jobs) THEN
    RAISE EXCEPTION 'document v2 migration requires empty document and email stores';
  END IF;
END; $$;

ALTER TABLE business_v2.payment_checkout_documents
  DROP CONSTRAINT payment_checkout_documents_document_version_check,
  ADD CONSTRAINT payment_checkout_documents_document_version_check
    CHECK (document_version='mcs-checkout-document-v2'),
  ADD COLUMN retention_until timestamptz NOT NULL,
  ADD COLUMN retention_policy_version text NOT NULL
    CHECK (retention_policy_version='mcs-checkout-documents-7y-v1'),
  ADD COLUMN amount_minor bigint NOT NULL CHECK (amount_minor>0),
  ADD COLUMN currency text NOT NULL CHECK (currency='USD'),
  ADD COLUMN attempt_id_sha256 text NOT NULL
    CHECK (attempt_id_sha256 ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT payment_checkout_documents_retention_window_check
    CHECK (retention_until=issued_at+interval '7 years');

CREATE INDEX payment_checkout_documents_retention_due
  ON business_v2.payment_checkout_documents(retention_until,document_id);

CREATE TABLE business_v2.payment_checkout_document_retention_events (
  event_id uuid PRIMARY KEY,
  document_id uuid NOT NULL REFERENCES business_v2.payment_checkout_documents(document_id),
  event_kind text NOT NULL CHECK (event_kind IN ('hold_placed','hold_released')),
  decision_reference text NOT NULL CHECK (
    decision_reference ~ '^[A-Za-z0-9_:.\/-]{1,200}$'
  ),
  receipt_sha256 text NOT NULL CHECK (receipt_sha256 ~ '^[a-f0-9]{64}$'),
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(document_id,occurred_at,event_id)
);
CREATE INDEX payment_checkout_document_retention_event_order
  ON business_v2.payment_checkout_document_retention_events
    (document_id,occurred_at DESC,event_id DESC);

CREATE TABLE business_v2.payment_checkout_document_tombstones (
  document_id uuid PRIMARY KEY,
  attempt_id_sha256 text NOT NULL CHECK (attempt_id_sha256 ~ '^[a-f0-9]{64}$'),
  document_kind text NOT NULL CHECK (document_kind IN ('receipt','paid_invoice')),
  document_number text NOT NULL UNIQUE CHECK (
    document_number ~ '^(TCA-[A-F0-9]{12}-R|TCA-[0-9]{4}-[0-9]{6})$'
  ),
  issued_at timestamptz NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor>0),
  currency text NOT NULL CHECK (currency='USD'),
  snapshot_sha256 text NOT NULL CHECK (snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  pdf_sha256 text NOT NULL CHECK (pdf_sha256 ~ '^[a-f0-9]{64}$'),
  retention_policy_version text NOT NULL
    CHECK (retention_policy_version='mcs-checkout-documents-7y-v1'),
  purge_receipt_sha256 text NOT NULL UNIQUE
    CHECK (purge_receipt_sha256 ~ '^[a-f0-9]{64}$'),
  purged_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (purged_at>=issued_at+interval '7 years')
);
CREATE UNIQUE INDEX payment_checkout_document_tombstone_attempt_kind
  ON business_v2.payment_checkout_document_tombstones(attempt_id_sha256,document_kind);

CREATE FUNCTION business_v2.fn_payment_checkout_document_body_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,business_v2 AS $$
BEGIN
  IF TG_OP='DELETE' AND EXISTS (
    SELECT 1 FROM business_v2.payment_checkout_document_tombstones t
    WHERE t.document_id=OLD.document_id
      AND t.attempt_id_sha256=OLD.attempt_id_sha256
      AND t.document_kind=OLD.document_kind
      AND t.document_number=OLD.document_number
      AND t.issued_at=OLD.issued_at
      AND t.amount_minor=OLD.amount_minor
      AND t.currency=OLD.currency
      AND t.snapshot_sha256=OLD.snapshot_sha256
      AND t.pdf_sha256=OLD.pdf_sha256
      AND t.retention_policy_version=OLD.retention_policy_version
      AND t.purged_at>=OLD.retention_until
  ) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'payment checkout document immutable';
END;
$$;

CREATE FUNCTION business_v2.fn_payment_checkout_document_capability_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,business_v2 AS $$
BEGIN
  IF TG_OP='DELETE' AND EXISTS (
    SELECT 1 FROM business_v2.payment_checkout_document_tombstones
    WHERE document_id=OLD.document_id
  ) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'payment checkout document capability immutable';
END;
$$;

CREATE OR REPLACE FUNCTION business_v2.fn_payment_checkout_document_email_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF EXISTS (
      SELECT 1 FROM business_v2.payment_checkout_document_tombstones
      WHERE document_id=OLD.document_id
    ) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'payment checkout document email deletion refused';
  END IF;
  IF (to_jsonb(NEW)-ARRAY['state','uncertain_acceptance','attempt_count','lease_token','lease_expires_at','gmail_message_id','gmail_thread_id','last_error_code','version','updated_at'])
     IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['state','uncertain_acceptance','attempt_count','lease_token','lease_expires_at','gmail_message_id','gmail_thread_id','last_error_code','version','updated_at']) THEN
    RAISE EXCEPTION 'payment checkout document email immutable contract';
  END IF;
  IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'payment checkout document email version fence'; END IF;
  IF OLD.state='confirmed' THEN RAISE EXCEPTION 'payment checkout document email terminal state'; END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION business_v2.fn_payment_checkout_document_email_receipt_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,business_v2 AS $$
DECLARE purge_document_id text;
BEGIN
  IF TG_OP='DELETE' THEN
    SELECT j.document_id::text INTO purge_document_id
      FROM business_v2.payment_checkout_document_email_jobs j
      WHERE j.job_id=OLD.job_id;
    IF EXISTS (
      SELECT 1 FROM business_v2.payment_checkout_document_tombstones
      WHERE document_id=purge_document_id::uuid
    ) THEN
      RETURN OLD;
    END IF;
  END IF;
  RAISE EXCEPTION 'payment checkout document email receipt immutable';
END;
$$;

CREATE FUNCTION business_v2.fn_payment_checkout_document_retention_event_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,business_v2 AS $$
BEGIN
  IF TG_OP='DELETE' AND EXISTS (
    SELECT 1 FROM business_v2.payment_checkout_document_tombstones
    WHERE document_id=OLD.document_id
  ) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'payment checkout document retention event immutable';
END;
$$;

CREATE FUNCTION business_v2.fn_payment_checkout_document_tombstone_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,business_v2 AS $$
DECLARE
  document_row business_v2.payment_checkout_documents%ROWTYPE;
  latest_retention_event text;
BEGIN
  IF TG_OP<>'INSERT' THEN
    RAISE EXCEPTION 'payment checkout document tombstone immutable';
  END IF;
  SELECT * INTO document_row
    FROM business_v2.payment_checkout_documents
    WHERE document_id=NEW.document_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment checkout document tombstone source missing'; END IF;
  SELECT event_kind INTO latest_retention_event
    FROM business_v2.payment_checkout_document_retention_events
    WHERE document_id=NEW.document_id
    ORDER BY occurred_at DESC,event_id DESC LIMIT 1;
  IF latest_retention_event='hold_placed' THEN
    RAISE EXCEPTION 'payment checkout document legal hold active';
  END IF;
  IF NEW.purged_at<document_row.retention_until OR
     NEW.attempt_id_sha256<>document_row.attempt_id_sha256 OR
     NEW.document_kind<>document_row.document_kind OR
     NEW.document_number<>document_row.document_number OR
     NEW.issued_at<>document_row.issued_at OR
     NEW.amount_minor<>document_row.amount_minor OR
     NEW.currency<>document_row.currency OR
     NEW.snapshot_sha256<>document_row.snapshot_sha256 OR
     NEW.pdf_sha256<>document_row.pdf_sha256 OR
     NEW.retention_policy_version<>document_row.retention_policy_version THEN
    RAISE EXCEPTION 'payment checkout document tombstone source mismatch';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER payment_checkout_documents_immutable
  ON business_v2.payment_checkout_documents;
CREATE TRIGGER payment_checkout_documents_immutable
  BEFORE UPDATE OR DELETE ON business_v2.payment_checkout_documents
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_payment_checkout_document_body_guard();

DROP TRIGGER payment_checkout_document_capabilities_immutable
  ON business_v2.payment_checkout_document_capabilities;
CREATE TRIGGER payment_checkout_document_capabilities_immutable
  BEFORE UPDATE OR DELETE ON business_v2.payment_checkout_document_capabilities
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_payment_checkout_document_capability_guard();

DROP TRIGGER payment_checkout_document_email_receipts_immutable
  ON business_v2.payment_checkout_document_email_receipts;
CREATE TRIGGER payment_checkout_document_email_receipts_immutable
  BEFORE UPDATE OR DELETE ON business_v2.payment_checkout_document_email_receipts
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_payment_checkout_document_email_receipt_guard();

CREATE TRIGGER payment_checkout_document_retention_events_immutable
  BEFORE UPDATE OR DELETE ON business_v2.payment_checkout_document_retention_events
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_payment_checkout_document_retention_event_guard();
CREATE TRIGGER payment_checkout_document_tombstones_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON business_v2.payment_checkout_document_tombstones
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_payment_checkout_document_tombstone_guard();

CREATE FUNCTION business_v2.purge_payment_checkout_document(
  target_document_id uuid,
  target_purge_receipt_sha256 text,
  target_purged_at timestamptz
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,business_v2 AS $$
DECLARE
  document_row business_v2.payment_checkout_documents%ROWTYPE;
  latest_retention_event text;
  existing_receipt text;
BEGIN
  IF target_purge_receipt_sha256 !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'invalid payment checkout document purge receipt';
  END IF;
  SELECT purge_receipt_sha256 INTO existing_receipt
    FROM business_v2.payment_checkout_document_tombstones
    WHERE document_id=target_document_id;
  IF FOUND THEN
    IF existing_receipt=target_purge_receipt_sha256 THEN RETURN 'already_purged'; END IF;
    RAISE EXCEPTION 'payment checkout document purge receipt conflict';
  END IF;
  SELECT * INTO document_row
    FROM business_v2.payment_checkout_documents
    WHERE document_id=target_document_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment checkout document not found'; END IF;
  IF target_purged_at<document_row.retention_until THEN
    RAISE EXCEPTION 'payment checkout document retention active';
  END IF;
  SELECT event_kind INTO latest_retention_event
    FROM business_v2.payment_checkout_document_retention_events
    WHERE document_id=target_document_id
    ORDER BY occurred_at DESC,event_id DESC LIMIT 1;
  IF latest_retention_event='hold_placed' THEN
    RAISE EXCEPTION 'payment checkout document legal hold active';
  END IF;
  INSERT INTO business_v2.payment_checkout_document_tombstones
    (document_id,attempt_id_sha256,document_kind,document_number,issued_at,amount_minor,currency,
     snapshot_sha256,pdf_sha256,retention_policy_version,purge_receipt_sha256,purged_at)
  VALUES
    (document_row.document_id,document_row.attempt_id_sha256,document_row.document_kind,document_row.document_number,
     document_row.issued_at,document_row.amount_minor,document_row.currency,
     document_row.snapshot_sha256,document_row.pdf_sha256,
     document_row.retention_policy_version,target_purge_receipt_sha256,target_purged_at);
  DELETE FROM business_v2.payment_checkout_document_email_receipts
    WHERE job_id IN (
      SELECT job_id FROM business_v2.payment_checkout_document_email_jobs
      WHERE document_id=target_document_id
    );
  DELETE FROM business_v2.payment_checkout_document_email_jobs
    WHERE document_id=target_document_id;
  DELETE FROM business_v2.payment_checkout_document_capabilities
    WHERE document_id=target_document_id;
  DELETE FROM business_v2.payment_checkout_document_retention_events
    WHERE document_id=target_document_id;
  DELETE FROM business_v2.payment_checkout_documents
    WHERE document_id=target_document_id;
  RETURN 'purged';
END;
$$;

ALTER TABLE business_v2.payment_checkout_document_retention_events OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.payment_checkout_document_tombstones OWNER TO nanoclaw_admin;
ALTER FUNCTION business_v2.fn_payment_checkout_document_body_guard() OWNER TO nanoclaw_admin;
ALTER FUNCTION business_v2.fn_payment_checkout_document_capability_guard() OWNER TO nanoclaw_admin;
ALTER FUNCTION business_v2.fn_payment_checkout_document_email_receipt_guard() OWNER TO nanoclaw_admin;
ALTER FUNCTION business_v2.fn_payment_checkout_document_retention_event_guard() OWNER TO nanoclaw_admin;
ALTER FUNCTION business_v2.fn_payment_checkout_document_tombstone_guard() OWNER TO nanoclaw_admin;
ALTER FUNCTION business_v2.purge_payment_checkout_document(uuid,text,timestamptz) OWNER TO nanoclaw_admin;
REVOKE ALL ON business_v2.payment_checkout_document_retention_events,
  business_v2.payment_checkout_document_tombstones FROM PUBLIC;
REVOKE ALL ON FUNCTION business_v2.fn_payment_checkout_document_body_guard(),
  business_v2.fn_payment_checkout_document_capability_guard(),
  business_v2.fn_payment_checkout_document_email_receipt_guard(),
  business_v2.fn_payment_checkout_document_retention_event_guard(),
  business_v2.fn_payment_checkout_document_tombstone_guard(),
  business_v2.purge_payment_checkout_document(uuid,text,timestamptz) FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
  FOR role_name IN SELECT rolname FROM pg_roles
    WHERE rolname<>'nanoclaw_admin' AND rolname NOT LIKE 'pg_%' LOOP
    EXECUTE format('REVOKE ALL ON business_v2.payment_checkout_document_retention_events,business_v2.payment_checkout_document_tombstones FROM %I',role_name);
    EXECUTE format('REVOKE ALL ON FUNCTION business_v2.fn_payment_checkout_document_body_guard(),business_v2.fn_payment_checkout_document_capability_guard(),business_v2.fn_payment_checkout_document_email_receipt_guard(),business_v2.fn_payment_checkout_document_retention_event_guard(),business_v2.fn_payment_checkout_document_tombstone_guard(),business_v2.purge_payment_checkout_document(uuid,text,timestamptz) FROM %I',role_name);
  END LOOP;
END; $$;
COMMIT;
