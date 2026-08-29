-- 140_checkout_failure_incidents.sql
-- Source-authoritative failure context and one durable operator incident per
-- bounded checkout episode. No customer-send or payment authority.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

ALTER TABLE business_v2.checkout_recovery_cases
  ADD COLUMN party_id bigint REFERENCES business_v2.parties(id),
  ADD COLUMN party_evidence_tier text CHECK (
    party_evidence_tier IS NULL OR
    party_evidence_tier IN (
      'stripe_customer_exact_ref_v1',
      'unique_party_email_v1',
      'identity_unresolved_v1'
    )
  ),
  ADD COLUMN stripe_customer_id text CHECK (
    stripe_customer_id IS NULL OR
    stripe_customer_id ~ '^cus_[A-Za-z0-9_]{10,200}$'
  ),
  ADD COLUMN last_failure_code text CHECK (
    last_failure_code IS NULL OR last_failure_code ~ '^[a-z][a-z0-9_]{0,99}$'
  ),
  ADD COLUMN last_decline_code text CHECK (
    last_decline_code IS NULL OR last_decline_code ~ '^[a-z][a-z0-9_]{0,99}$'
  ),
  ADD COLUMN last_advice_code text CHECK (
    last_advice_code IS NULL OR last_advice_code ~ '^[a-z][a-z0-9_]{0,99}$'
  ),
  ADD COLUMN customer_guidance_key text CHECK (
    customer_guidance_key IS NULL OR customer_guidance_key IN (
      'verify_card_details',
      'authenticate_payment',
      'use_different_method',
      'contact_issuer_or_change_method',
      'retry_later_or_change_method',
      'generic_decline'
    )
  ),
  ADD COLUMN payment_method_brand text CHECK (
    payment_method_brand IS NULL OR
    payment_method_brand IN (
      'amex','cartes_bancaires','diners','discover','eftpos_au','interac',
      'jcb','link','mastercard','unionpay','visa','unknown'
    )
  ),
  ADD COLUMN payment_method_last4 text CHECK (
    payment_method_last4 IS NULL OR payment_method_last4 ~ '^[0-9]{4}$'
  );

CREATE TABLE business_v2.checkout_recovery_operator_incidents (
  id                         bigserial PRIMARY KEY,
  incident_uuid              uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  incident_key               text NOT NULL UNIQUE CHECK (
                               incident_key ~ '^[0-9a-f]{64}$'
                             ),
  group_key                  text NOT NULL CHECK (
                               group_key ~ '^[0-9a-f]{64}$'
                             ),
  subject_key                text NOT NULL CHECK (
                               subject_key ~ '^[0-9a-f]{64}$'
                             ),
  party_id                   bigint REFERENCES business_v2.parties(id),
  stripe_account             text NOT NULL CHECK (
                               stripe_account IN ('tandem','heartbeat')
                             ),
  incident_kind              text NOT NULL CHECK (
                               incident_kind IN ('payment_failed','checkout_incomplete')
                             ),
  product_key                text NOT NULL CHECK (
                               char_length(product_key) BETWEEN 1 AND 300
                             ),
  product_name               text CHECK (
                               product_name IS NULL OR
                               char_length(product_name) BETWEEN 1 AND 300
                             ),
  amount_cents               bigint CHECK (
                               amount_cents IS NULL OR amount_cents >= 0
                             ),
  currency                   text CHECK (
                               currency IS NULL OR currency ~ '^[a-z]{3}$'
                             ),
  episode_started_at         timestamptz NOT NULL,
  episode_ends_at            timestamptz NOT NULL,
  last_failure_at            timestamptz NOT NULL,
  notify_due_at              timestamptz NOT NULL,
  status                     text NOT NULL DEFAULT 'open' CHECK (
                               status IN ('open','notified','closed')
                             ),
  version                    integer NOT NULL DEFAULT 1 CHECK (version > 0),
  notified_version           integer NOT NULL DEFAULT 0 CHECK (
                               notified_version >= 0 AND notified_version <= version
                             ),
  case_count                 integer NOT NULL DEFAULT 1 CHECK (case_count > 0),
  payment_intent_count       integer NOT NULL DEFAULT 0 CHECK (
                               payment_intent_count >= 0
                             ),
  provider_failure_count     integer NOT NULL DEFAULT 0 CHECK (
                               provider_failure_count >= 0
                             ),
  customer_guidance_key      text CHECK (
                               customer_guidance_key IS NULL OR
                               customer_guidance_key IN (
                                 'verify_card_details',
                                 'authenticate_payment',
                                 'use_different_method',
                                 'contact_issuer_or_change_method',
                                 'retry_later_or_change_method',
                                 'generic_decline'
                               )
                             ),
  payment_method_brand       text CHECK (
                               payment_method_brand IS NULL OR
                               payment_method_brand IN (
                                 'amex','cartes_bancaires','diners','discover',
                                 'eftpos_au','interac','jcb','link','mastercard',
                                 'unionpay','visa','unknown'
                               )
                             ),
  payment_method_last4       text CHECK (
                               payment_method_last4 IS NULL OR
                               payment_method_last4 ~ '^[0-9]{4}$'
                             ),
  reminder_state             text NOT NULL DEFAULT 'not_sent_consent_missing'
                             CHECK (reminder_state IN (
                               'not_sent_consent_missing',
                               'not_sent_opted_out',
                               'eligible_pending',
                               'provider_accepted',
                               'suppressed',
                               'not_applicable'
                             )),
  root_notified_at           timestamptz,
  last_notified_at           timestamptz,
  closed_at                  timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT checkout_recovery_incident_window_chk CHECK (
    episode_started_at < episode_ends_at AND
    episode_started_at <= last_failure_at AND
    notify_due_at >= episode_started_at AND
    notify_due_at <= episode_ends_at
  ),
  CONSTRAINT checkout_recovery_incident_notification_chk CHECK (
    (notified_version = 0 AND root_notified_at IS NULL AND last_notified_at IS NULL) OR
    (notified_version > 0 AND root_notified_at IS NOT NULL AND last_notified_at IS NOT NULL)
  )
);

CREATE INDEX checkout_recovery_operator_incidents_due_idx
  ON business_v2.checkout_recovery_operator_incidents
    (notify_due_at,id)
  WHERE status IN ('open','notified');

CREATE INDEX checkout_recovery_operator_incidents_group_idx
  ON business_v2.checkout_recovery_operator_incidents
    (group_key,episode_started_at DESC);

CREATE TABLE business_v2.checkout_recovery_operator_incident_cases (
  incident_id                bigint NOT NULL REFERENCES
                               business_v2.checkout_recovery_operator_incidents(id),
  case_id                    bigint NOT NULL UNIQUE REFERENCES
                               business_v2.checkout_recovery_cases(id),
  joined_at                  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (incident_id,case_id)
);

ALTER TABLE business_v2.checkout_recovery_cases
  ADD COLUMN operator_incident_id bigint REFERENCES
    business_v2.checkout_recovery_operator_incidents(id);

CREATE OR REPLACE FUNCTION business_v2.fn_checkout_recovery_incident_case_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'checkout recovery incident membership is append-only';
END;
$$;

CREATE TRIGGER checkout_recovery_operator_incident_cases_append_only
BEFORE UPDATE OR DELETE ON business_v2.checkout_recovery_operator_incident_cases
FOR EACH ROW EXECUTE FUNCTION business_v2.fn_checkout_recovery_incident_case_append_only();

ALTER TABLE business_v2.checkout_recovery_operator_incidents
  OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.checkout_recovery_operator_incident_cases
  OWNER TO nanoclaw_admin;
ALTER SEQUENCE business_v2.checkout_recovery_operator_incidents_id_seq
  OWNER TO nanoclaw_admin;

REVOKE ALL ON TABLE
  business_v2.checkout_recovery_operator_incidents,
  business_v2.checkout_recovery_operator_incident_cases
  FROM PUBLIC;
REVOKE ALL ON SEQUENCE
  business_v2.checkout_recovery_operator_incidents_id_seq
  FROM PUBLIC;

COMMIT;
