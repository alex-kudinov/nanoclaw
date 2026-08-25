-- Run only against an explicitly created disposable PostgreSQL database after
-- base migrations 01-13 and migration 137. No customer rows are used.

SET search_path TO business_v2, public, pg_catalog;

DO $$
DECLARE
  legacy_party bigint;
  conflict_owner bigint;
  conflict_source bigint;
  winner bigint;
  loser bigint;
  inserted integer;
  loser_observation bigint;
  query_receipt bigint;
BEGIN
  INSERT INTO business_v2.parties
    (party_type,display_name,source_provider,source_id,last_updated_by)
  VALUES ('person','RC Legacy Fixture','manual','rc-legacy-1','integration')
  RETURNING id INTO legacy_party;

  inserted := business_v2.fn_relationship_context_backfill_legacy_refs();
  IF inserted <> 1 THEN
    RAISE EXCEPTION 'expected one legacy backfill row, got %', inserted;
  END IF;
  inserted := business_v2.fn_relationship_context_backfill_legacy_refs();
  IF inserted <> 0 THEN
    RAISE EXCEPTION 'legacy backfill replay was not idempotent: %', inserted;
  END IF;

  INSERT INTO business_v2.parties
    (party_type,display_name,last_updated_by)
  VALUES ('person','RC Conflict Owner','integration')
  RETURNING id INTO conflict_owner;
  INSERT INTO business_v2.parties
    (party_type,display_name,source_provider,source_id,last_updated_by)
  VALUES ('person','RC Conflict Source','manual','rc-conflict','integration')
  RETURNING id INTO conflict_source;
  INSERT INTO business_v2.party_external_refs
    (party_id,provider,source_scope,entity_type,external_id,adapter_key,
     adapter_version,schema_version,status,first_seen_at,last_seen_at,
     source_receipt_sha256)
  VALUES
    (conflict_owner,'manual','legacy-primary','person','rc-conflict',
     'fixture','1.0.0',1,'active',now(),now(),repeat('a',64));
  BEGIN
    PERFORM business_v2.fn_relationship_context_backfill_legacy_refs();
    RAISE EXCEPTION 'expected legacy backfill conflict refusal';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%legacy source conflicts%' THEN RAISE; END IF;
  END;

  BEGIN
    INSERT INTO business_v2.party_context_adapter_registrations
      (adapter_key,adapter_version,source_system,source_scope,manifest_version,
       manifest_sha256,manifest,config_declaration)
    VALUES
      ('oversized','1.0.0','oversized','fixture',1,repeat('b',64),
       jsonb_build_object('value',repeat('x',9000)),'{}'::jsonb);
    RAISE EXCEPTION 'expected oversized manifest refusal';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  INSERT INTO business_v2.parties
    (party_type,display_name,last_updated_by)
  VALUES ('person','RC Merge Winner','integration')
  RETURNING id INTO winner;
  INSERT INTO business_v2.parties
    (party_type,display_name,last_updated_by)
  VALUES ('person','RC Merge Loser','integration')
  RETURNING id INTO loser;

  INSERT INTO business_v2.party_external_refs
    (party_id,provider,source_scope,entity_type,external_id,adapter_key,
     adapter_version,schema_version,status,first_seen_at,last_seen_at,
     source_receipt_sha256)
  VALUES
    (loser,'manual','fixture','person','rc-merge-ref','fixture','1.0.0',1,
     'active',now(),now(),repeat('c',64));
  INSERT INTO business_v2.party_identifier_claims
    (party_id,identifier_kind,identifier_fingerprint,verification_method,
     confidence,status,valid_from,evidence_sha256)
  VALUES
    (loser,'verified_email_candidate',repeat('d',64),'fixture',
     'source_verified','active',now(),repeat('e',64));
  INSERT INTO business_v2.party_identity_exceptions
    (fingerprint,current_party_id,candidate_party_ids,reason_code,status,
     owner_group,evidence_refs,first_seen_at,last_seen_at)
  VALUES
    (repeat('f',64),loser,ARRAY[loser],'needs_identity','open','chief',
     '{}'::jsonb,now(),now());
  INSERT INTO business_v2.party_context_observations
    (schema_version,adapter_key,adapter_version,source_system,source_scope,
     source_fact_key,fact_type,fact_schema_version,original_party_id,
     current_party_id,value,value_sha256,source_record_type,source_record_id,
     observed_at,confidence,conflict_state,privacy_class)
  VALUES
    (1,'fixture','1.0.0','fixture','fixture','merge-fact',
     'relationship.fixture@1',1,loser,loser,'{}'::jsonb,repeat('1',64),
     'person','merge',now(),'source_verified','none','internal')
  RETURNING id INTO loser_observation;
  INSERT INTO business_v2.party_context_projections
    (party_id,section,projection_key,version,value,value_sha256,
     source_watermarks,status,observed_at)
  VALUES
    (loser,'relationship','fixture',1,'{}'::jsonb,repeat('2',64),
     '{}'::jsonb,'current',now());
  INSERT INTO business_v2.party_context_query_receipts
    (request_uuid,run_id,source_container_sha256,work_item_id,actor_group,
     purpose,original_party_id,current_party_id,requested_sections,
     returned_sections,policy_decision,result_status,response_sha256,
     started_at,completed_at,duration_ms)
  VALUES
    (gen_random_uuid(),gen_random_uuid(),repeat('3',64),'work:fixture','sales',
     'answer_appointment_inquiry',loser,loser,'["relationship"]'::jsonb,
     '["relationship"]'::jsonb,'allowed','resolved',repeat('4',64),
    now(),now(),0)
  RETURNING id INTO query_receipt;
  INSERT INTO business_v2.party_context_plutio_projection_receipts
    (plan_uuid,original_party_id,current_party_id,projection_version,
     projection_sha256,proposed_fields,proposed_field_count,mode,status)
  VALUES
    (gen_random_uuid(),loser,loser,1,repeat('5',64),'{}'::jsonb,0,
     'dry_run','no_change');

  PERFORM business_v2.fn_merge_parties(loser,winner,'integration fixture');

  IF EXISTS (SELECT 1 FROM business_v2.party_external_refs
              WHERE party_id=loser AND status='active') THEN
    RAISE EXCEPTION 'active external ref remained on loser';
  END IF;
  IF EXISTS (SELECT 1 FROM business_v2.party_identifier_claims
              WHERE party_id=loser AND status='active') THEN
    RAISE EXCEPTION 'active claim remained on loser';
  END IF;
  IF EXISTS (SELECT 1 FROM business_v2.party_identity_exceptions
              WHERE current_party_id=loser AND status='open') THEN
    RAISE EXCEPTION 'open exception remained current on loser';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM business_v2.party_context_observations
                  WHERE id=loser_observation AND original_party_id=loser
                    AND current_party_id=winner) THEN
    RAISE EXCEPTION 'observation did not preserve original and current lineage';
  END IF;
  IF EXISTS (SELECT 1 FROM business_v2.party_context_projections
              WHERE party_id=loser) THEN
    RAISE EXCEPTION 'current projection remained on loser';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM business_v2.party_context_query_receipts
                  WHERE original_party_id=loser AND current_party_id=winner) THEN
    RAISE EXCEPTION 'query receipt lineage was not reconciled';
  END IF;
  UPDATE business_v2.party_context_query_receipts
     SET delivery_status='delivered',delivered_at=now()
   WHERE id=query_receipt;
  BEGIN
    UPDATE business_v2.party_context_query_receipts
       SET delivery_status='failed',delivery_error_code='late_failure',
           delivered_at=NULL
     WHERE id=query_receipt;
    RAISE EXCEPTION 'expected query delivery terminal refusal';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%query delivery is terminal%' THEN RAISE; END IF;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM business_v2.party_context_plutio_projection_receipts
     WHERE original_party_id=loser AND current_party_id=winner
  ) THEN
    RAISE EXCEPTION 'Plutio receipt lineage was not reconciled';
  END IF;

  BEGIN
    INSERT INTO business_v2.party_context_projections
      (party_id,section,projection_key,version,value,value_sha256,
       source_watermarks,status,observed_at)
    VALUES
      (loser,'identity','forbidden',1,'{}'::jsonb,repeat('6',64),
       '{}'::jsonb,'current',now());
    RAISE EXCEPTION 'expected merged-party write refusal';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%cannot write active relationship context%' THEN
      RAISE;
    END IF;
  END;
END $$;

SELECT 'relationship-context integration PASS' AS result;
