#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPECTED_BATCH = 'academy-capacity-shadow-2026-09-06';
const SHA256 = /^[a-f0-9]{64}$/;
const KEY = /^[a-z0-9][a-z0-9._:-]{0,249}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DISPOSABLE_DB = /^nc_academy_capacity_shadow_[a-z0-9_]{8,80}$/;
const PRODUCTION_DB = 'nanoclaw_business';

const BUNDLE_COMPONENTS = Object.freeze({
  'acc-module-1:v1': [['acc.module-1', 'included']],
  'acc-full:v1': [
    ['acc.module-1', 'included'],
    ['acc.module-2', 'included'],
    ['acc.module-3', 'included'],
    ['acc.module-4', 'included'],
    ['acc.group-mentoring', 'included'],
    ['acc.individual-mentoring', 'included'],
    ['acc.group-supervision', 'included'],
    ['acc.performance-evaluation', 'included'],
    ['acc.exam-preparation', 'included'],
    ['shared.coaching-tools-plus', 'included'],
  ],
  'mcs-standard-path:v1': [
    ['mcs.foundations', 'included'],
    ['mcs.acc-bars-training', 'included'],
    ['mcs.pcc-markers-training', 'included'],
    ['mcs.live-practicum', 'included'],
    ['mcs.observed-practice', 'included'],
    ['mcs.peer-mentoring-arcs', 'included'],
    ['mcs.mentoring-on-mentoring', 'included'],
    ['mcs.capstone', 'included'],
    ['mcs.mcc-bars-bonus', 'conditional'],
    ['mcs.certificate', 'earned_on_completion'],
  ],
});

const OFFER_BUNDLES = Object.freeze({
  'acc-module-1': 'acc-module-1:v1',
  'acc-full': 'acc-full:v1',
  'mcs-full': 'mcs-standard-path:v1',
});

const EXPECTED_OCCUPANCY = Object.freeze({
  'acc.module-1:2026-09-07': 21,
  'mcs-practicum:2026-09-24': 5,
  'mcs-practicum:2026-09-25': 13,
  'mcs-practicum:2027-01-07': 1,
  'mcs-practicum:2027-01-08': 0,
});

const EXPECTED_EXCEPTION_CODES = new Set([
  'mcs_friday_owner_count_variance',
  'funding_source_unresolved',
  'cross_provider_email_alias_unresolved',
]);

function normalizeEmail(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

export function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function manifestSha256(manifest) {
  return sha256(`${JSON.stringify(manifest)}\n`);
}

export function recordKey(participant) {
  return sha256(
    `${participant.participant_key}|${participant.delivery_block_key}|${participant.offer_key}`,
  ).slice(0, 40);
}

function sameComponents(actual, expected) {
  return (
    JSON.stringify(
      [...(actual ?? [])]
        .map((entry) => [entry.component_key, entry.state])
        .sort((left, right) => left[0].localeCompare(right[0])),
    ) ===
    JSON.stringify(
      [...expected].sort((left, right) => left[0].localeCompare(right[0])),
    )
  );
}

export function validateAcademyCapacityShadowManifest(manifest) {
  const findings = [];
  const add = (condition, message) => {
    if (!condition) findings.push(message);
  };
  add(manifest?.schema_version === '1.0', 'schema_version must be 1.0');
  add(manifest?.batch_key === EXPECTED_BATCH, 'unexpected batch_key');
  add(
    typeof manifest?.observed_at === 'string' &&
      !Number.isNaN(Date.parse(manifest.observed_at)),
    'observed_at must be an ISO date-time',
  );
  add(
    SHA256.test(manifest?.source_evidence_sha256 ?? ''),
    'source_evidence_sha256 must be SHA-256',
  );

  const blocks = Array.isArray(manifest?.delivery_blocks)
    ? manifest.delivery_blocks
    : [];
  const blockKeys = blocks.map((entry) => entry?.delivery_block_key);
  add(blocks.length === 5, 'exactly five delivery blocks are required');
  add(
    new Set(blockKeys).size === blocks.length,
    'delivery blocks must be unique',
  );
  add(
    blockKeys.length === Object.keys(EXPECTED_OCCUPANCY).length &&
      blockKeys.every((key) => Object.hasOwn(EXPECTED_OCCUPANCY, key)),
    'delivery block set differs from the authorized shadow population',
  );
  let offerMappingCount = 0;
  for (const block of blocks) {
    const prefix = block?.delivery_block_key ?? '(missing)';
    add(KEY.test(prefix), `${prefix}: invalid delivery_block_key`);
    add(
      KEY.test(block?.component_key ?? ''),
      `${prefix}: invalid component_key`,
    );
    add(KEY.test(block?.source_scope ?? ''), `${prefix}: invalid source_scope`);
    add(
      typeof block?.source_object_id === 'string' &&
        block.source_object_id.length > 0,
      `${prefix}: source_object_id required`,
    );
    add(
      !Number.isNaN(Date.parse(block?.starts_at)) &&
        !Number.isNaN(Date.parse(block?.ends_at)) &&
        Date.parse(block.starts_at) < Date.parse(block.ends_at),
      `${prefix}: invalid schedule window`,
    );
    add(block?.timezone === 'America/New_York', `${prefix}: timezone mismatch`);
    add(
      SHA256.test(block?.session_set_sha256 ?? ''),
      `${prefix}: session hash required`,
    );
    add(
      SHA256.test(block?.schedule_evidence_sha256 ?? ''),
      `${prefix}: schedule evidence hash required`,
    );
    add(
      block?.pool_key === `${manifest.batch_key}:pool:${prefix}`,
      `${prefix}: pool_key must be batch-scoped`,
    );
    add(block?.capacity === 12, `${prefix}: capacity must be 12`);
    add(
      block?.operational_state === 'open',
      `${prefix}: pool must remain operationally open`,
    );
    add(
      SHA256.test(block?.configuration_evidence_sha256 ?? ''),
      `${prefix}: configuration evidence hash required`,
    );
    add(
      Array.isArray(block?.offers) && block.offers.length > 0,
      `${prefix}: offers required`,
    );
    offerMappingCount += block?.offers?.length ?? 0;
    for (const offer of block?.offers ?? []) {
      add(KEY.test(offer?.offer_key ?? ''), `${prefix}: invalid offer mapping`);
      add(
        Number.isInteger(offer?.catalog_revision) &&
          offer.catalog_revision === 1,
        `${prefix}: offer catalog revision must be 1`,
      );
      add(
        SHA256.test(offer?.evidence_sha256 ?? ''),
        `${prefix}: offer mapping evidence hash required`,
      );
    }
  }
  add(
    offerMappingCount === 7,
    'exactly seven pool-offer mappings are required',
  );

  const participants = Array.isArray(manifest?.participants)
    ? manifest.participants
    : [];
  add(participants.length === 40, 'exactly 40 assignments are required');
  const emails = participants.map((entry) => normalizeEmail(entry?.email));
  const participantKeys = participants.map((entry) => entry?.participant_key);
  const participantsByKey = new Map(
    participants.map((entry) => [entry?.participant_key, entry]),
  );
  const recordKeys = participants.map((entry) => recordKey(entry));
  add(
    new Set(emails).size === emails.length,
    'participant emails must be unique',
  );
  add(
    new Set(participantKeys).size === participantKeys.length,
    'participant keys must be unique',
  );
  add(
    new Set(recordKeys).size === recordKeys.length,
    'record keys must be unique',
  );
  const blockSet = new Set(blockKeys);
  for (const participant of participants) {
    const email = normalizeEmail(participant?.email);
    const prefix = participant?.participant_key?.slice?.(0, 12) ?? '(missing)';
    add(EMAIL.test(email), `${prefix}: invalid participant email`);
    add(
      participant?.participant_key === sha256(email),
      `${prefix}: participant key does not match email`,
    );
    add(
      typeof participant?.display_name === 'string' &&
        participant.display_name.trim().length > 0,
      `${prefix}: display_name required`,
    );
    add(
      typeof participant?.allow_create_party === 'boolean',
      `${prefix}: allow_create_party must be boolean`,
    );
    add(
      blockSet.has(participant?.delivery_block_key),
      `${prefix}: unknown delivery block`,
    );
    add(
      OFFER_BUNDLES[participant?.offer_key] === participant?.bundle_key,
      `${prefix}: offer/bundle mismatch`,
    );
    add(
      sameComponents(
        participant?.components,
        BUNDLE_COMPONENTS[participant?.bundle_key] ?? [],
      ),
      `${prefix}: component entitlements do not match bundle`,
    );
    add(
      participant?.assignment_component_key ===
        (participant?.offer_key === 'mcs-full'
          ? 'mcs.live-practicum'
          : 'acc.module-1'),
      `${prefix}: assignment component mismatch`,
    );
    add(
      participant?.financial_classification === 'settled' ||
        participant?.financial_classification === 'held',
      `${prefix}: invalid financial classification`,
    );
    add(
      SHA256.test(participant?.record_evidence_sha256 ?? ''),
      `${prefix}: record evidence hash required`,
    );
    add(
      KEY.test(participant?.source_scope ?? ''),
      `${prefix}: invalid source scope`,
    );
  }

  const occupancy = Object.fromEntries(
    Object.keys(EXPECTED_OCCUPANCY).map((key) => [
      key,
      participants.filter((entry) => entry.delivery_block_key === key).length,
    ]),
  );
  for (const [key, expected] of Object.entries(EXPECTED_OCCUPANCY))
    add(
      occupancy[key] === expected,
      `${key}: expected ${expected} assignments`,
    );
  add(
    participants.filter((entry) => entry.offer_key === 'acc-module-1')
      .length === 10,
    'ACC Module 1 assignment count must be 10',
  );
  add(
    participants.filter((entry) => entry.offer_key === 'acc-full').length ===
      11,
    'ACC Full assignment count must be 11',
  );
  add(
    participants.filter((entry) => entry.offer_key === 'mcs-full').length ===
      19,
    'MCS assignment count must be 19',
  );
  add(
    participants.filter((entry) => entry.financial_classification === 'held')
      .length === 1,
    'exactly one funding classification must remain held',
  );
  add(
    participants.filter((entry) => entry.allow_create_party).length === 3,
    'exactly three exact roster Parties may be created',
  );

  const exceptions = Array.isArray(manifest?.exceptions)
    ? manifest.exceptions
    : [];
  const exceptionCodes = exceptions.map((entry) => entry?.reason_code);
  add(exceptions.length === 3, 'exactly three held exceptions are required');
  add(new Set(exceptionCodes).size === 3, 'exception reasons must be unique');
  add(
    exceptionCodes.every((code) => EXPECTED_EXCEPTION_CODES.has(code)),
    'exception set differs from authorization',
  );
  for (const exception of exceptions) {
    const prefix = exception?.reason_code ?? '(missing)';
    add(
      KEY.test(exception?.exception_key ?? ''),
      `${prefix}: invalid exception_key`,
    );
    add(
      exception?.exception_key?.startsWith?.(
        `${manifest.batch_key}:exception:`,
      ) === true,
      `${prefix}: exception_key must be batch-scoped`,
    );
    add(
      ['assignment', 'agreement', 'enrollment'].includes(
        exception?.subject_type,
      ),
      `${prefix}: invalid exception subject_type`,
    );
    add(
      Boolean(exception?.participant_key) !==
        Boolean(exception?.delivery_block_key),
      `${prefix}: choose participant_key or delivery_block_key`,
    );
    if (exception?.participant_key)
      add(
        participantKeys.includes(exception.participant_key),
        `${prefix}: unknown participant_key`,
      );
    if (exception?.delivery_block_key)
      add(
        blockSet.has(exception.delivery_block_key),
        `${prefix}: unknown delivery block`,
      );
    add(
      ['high', 'medium', 'low'].includes(exception?.severity),
      `${prefix}: invalid severity`,
    );
    add(
      [
        'enrollment_operator',
        'finance_operator',
        'owner_admin',
        'projection_worker',
      ].includes(exception?.owner_role),
      `${prefix}: invalid owner_role`,
    );
    add(
      SHA256.test(exception?.evidence_sha256 ?? ''),
      `${prefix}: evidence hash required`,
    );
    add(
      !Number.isNaN(Date.parse(exception?.review_at)),
      `${prefix}: review_at must be a date-time`,
    );
    const participant = participantsByKey.get(exception?.participant_key);
    if (exception?.reason_code === 'funding_source_unresolved')
      add(
        exception?.subject_type === 'agreement' &&
          participant?.financial_classification === 'held' &&
          participant?.offer_key === 'acc-module-1',
        `${prefix}: must bind the held ACC Module 1 agreement`,
      );
    if (exception?.reason_code === 'cross_provider_email_alias_unresolved')
      add(
        exception?.subject_type === 'enrollment' &&
          participant?.offer_key === 'acc-full',
        `${prefix}: must bind an ACC Full enrollment`,
      );
    if (exception?.reason_code === 'mcs_friday_owner_count_variance')
      add(
        exception?.subject_type === 'assignment' &&
          exception?.delivery_block_key === 'mcs-practicum:2026-09-25',
        `${prefix}: must bind the MCS Friday delivery block`,
      );
  }
  return findings;
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlTimestamp(value) {
  return `${sqlLiteral(value)}::timestamptz`;
}

function countedInsert(name, statement) {
  return `WITH inserted AS (${statement} RETURNING 1)
INSERT INTO shadow_apply_stats(name,value)
VALUES (${sqlLiteral(name)},(SELECT count(*) FROM inserted))
ON CONFLICT (name) DO UPDATE
SET value=shadow_apply_stats.value + EXCLUDED.value;`;
}

function participantSubjectKey(exception, participantsByKey, batchKey) {
  if (exception.delivery_block_key) return exception.delivery_block_key;
  const participant = participantsByKey.get(exception.participant_key);
  const key = recordKey(participant);
  if (exception.subject_type === 'agreement')
    return `${batchKey}:agreement:${key}`;
  if (exception.subject_type === 'enrollment')
    return `${batchKey}:enrollment:${key}`;
  return `${batchKey}:assignment:${key}`;
}

export function renderAcademyCapacityShadowSql(manifest) {
  const findings = validateAcademyCapacityShadowManifest(manifest);
  if (findings.length)
    throw new Error(
      `invalid Academy capacity shadow manifest: ${findings.join('; ')}`,
    );
  const observedAt = manifest.observed_at;
  const batch = manifest.batch_key;
  const actor = 'capacity-shadow-import:nc-20260906-002';
  const participantsByKey = new Map(
    manifest.participants.map((entry) => [entry.participant_key, entry]),
  );
  const lines = [
    '\\set ON_ERROR_STOP on',
    '\\pset tuples_only on',
    '\\pset format unaligned',
    'BEGIN;',
    'SET ROLE nanoclaw_admin;',
    'SET search_path TO business_v2, public, pg_catalog;',
    `SELECT pg_advisory_xact_lock(hashtextextended(${sqlLiteral(manifest.batch_key)},0));`,
    'CREATE TEMP TABLE shadow_apply_stats(name text PRIMARY KEY,value bigint NOT NULL);',
    'CREATE TEMP TABLE shadow_party_map(participant_key text PRIMARY KEY,party_id bigint NOT NULL);',
    `DO $$ BEGIN
      IF to_regclass('business_v2.student_enrollment_orders') IS NULL
         OR to_regclass('business_v2.academy_delivery_blocks') IS NULL THEN
        RAISE EXCEPTION 'migrations 142 and 143 must be applied before shadow population';
      END IF;
    END $$;`,
  ];

  for (const block of manifest.delivery_blocks) {
    lines.push(
      countedInsert(
        'delivery_blocks',
        `INSERT INTO business_v2.academy_delivery_blocks
          (delivery_block_key,component_key,source_scope,source_object_id,
           starts_at,ends_at,timezone,session_set_sha256,
           schedule_evidence_sha256,state,version,created_at,updated_at,updated_by)
         VALUES (${sqlLiteral(block.delivery_block_key)},${sqlLiteral(block.component_key)},
           ${sqlLiteral(block.source_scope)},${sqlLiteral(block.source_object_id)},
           ${sqlTimestamp(block.starts_at)},${sqlTimestamp(block.ends_at)},
           ${sqlLiteral(block.timezone)},${sqlLiteral(block.session_set_sha256)},
           ${sqlLiteral(block.schedule_evidence_sha256)},'scheduled',0,
           ${sqlTimestamp(observedAt)},${sqlTimestamp(observedAt)},${sqlLiteral(actor)})
         ON CONFLICT (delivery_block_key) DO NOTHING`,
      ),
      countedInsert(
        'seat_pools',
        `INSERT INTO business_v2.academy_seat_pools
          (pool_key,delivery_block_id,capacity,operational_state,close_reason,
           configuration_evidence_sha256,version,created_at,updated_at,updated_by)
         SELECT ${sqlLiteral(block.pool_key)},id,${block.capacity},
           ${sqlLiteral(block.operational_state)},NULL,
           ${sqlLiteral(block.configuration_evidence_sha256)},0,
           ${sqlTimestamp(observedAt)},${sqlTimestamp(observedAt)},${sqlLiteral(actor)}
         FROM business_v2.academy_delivery_blocks
         WHERE delivery_block_key=${sqlLiteral(block.delivery_block_key)}
         ON CONFLICT (pool_key) DO NOTHING`,
      ),
      countedInsert(
        'capacity_events',
        `INSERT INTO business_v2.academy_capacity_events
          (event_key,subject_type,subject_key,previous_version,new_version,
           event_type,evidence_sha256,actor,occurred_at,recorded_at)
         VALUES (${sqlLiteral(`${batch}:event:block:${block.delivery_block_key}`)},
           'delivery_block',${sqlLiteral(block.delivery_block_key)},NULL,0,
           'shadow_delivery_block_imported',${sqlLiteral(block.schedule_evidence_sha256)},
           ${sqlLiteral(actor)},${sqlTimestamp(observedAt)},${sqlTimestamp(observedAt)})
         ON CONFLICT (event_key) DO NOTHING`,
      ),
      countedInsert(
        'capacity_events',
        `INSERT INTO business_v2.academy_capacity_events
          (event_key,subject_type,subject_key,previous_version,new_version,
           event_type,evidence_sha256,actor,occurred_at,recorded_at)
         VALUES (${sqlLiteral(`${batch}:event:pool:${block.delivery_block_key}`)},
           'seat_pool',${sqlLiteral(block.pool_key)},NULL,0,
           'shadow_seat_pool_imported',${sqlLiteral(block.configuration_evidence_sha256)},
           ${sqlLiteral(actor)},${sqlTimestamp(observedAt)},${sqlTimestamp(observedAt)})
         ON CONFLICT (event_key) DO NOTHING`,
      ),
    );
    for (const offer of block.offers) {
      const mappingKey = `${batch}:mapping:${block.delivery_block_key}:${offer.offer_key}`;
      lines.push(
        countedInsert(
          'offer_mappings',
          `INSERT INTO business_v2.academy_seat_pool_offers
            (mapping_key,pool_id,offer_key,catalog_revision,state,version,
             evidence_sha256,created_at,updated_at,updated_by)
           SELECT ${sqlLiteral(mappingKey)},id,${sqlLiteral(offer.offer_key)},1,
             'active',0,${sqlLiteral(offer.evidence_sha256)},
             ${sqlTimestamp(observedAt)},${sqlTimestamp(observedAt)},${sqlLiteral(actor)}
           FROM business_v2.academy_seat_pools WHERE pool_key=${sqlLiteral(block.pool_key)}
           ON CONFLICT (mapping_key) DO NOTHING`,
        ),
        countedInsert(
          'capacity_events',
          `INSERT INTO business_v2.academy_capacity_events
            (event_key,subject_type,subject_key,previous_version,new_version,
             event_type,evidence_sha256,actor,occurred_at,recorded_at)
           VALUES (${sqlLiteral(`${batch}:event:mapping:${block.delivery_block_key}:${offer.offer_key}`)},
             'offer_mapping',${sqlLiteral(mappingKey)},NULL,0,
             'shadow_offer_mapping_imported',${sqlLiteral(offer.evidence_sha256)},
             ${sqlLiteral(actor)},${sqlTimestamp(observedAt)},${sqlTimestamp(observedAt)})
           ON CONFLICT (event_key) DO NOTHING`,
        ),
      );
    }
  }

  for (const participant of manifest.participants) {
    const email = normalizeEmail(participant.email);
    const rec = recordKey(participant);
    const orderKey = `${batch}:order:${rec}`;
    const sourceRefKey = `${batch}:source:${rec}`;
    const seatKey = `${batch}:seat:${rec}`;
    const agreementKey = `${batch}:agreement:${rec}`;
    const enrollmentKey = `${batch}:enrollment:${rec}`;
    const assignmentKey = `${batch}:assignment:${rec}`;
    const projectionKey = `${batch}:projection:roster:${rec}`;
    const receiptKey = `${batch}:receipt:roster:${rec}`;
    const allowCreate = participant.allow_create_party ? 'true' : 'false';
    lines.push(`DO $$
DECLARE matched bigint[]; selected_id bigint;
BEGIN
  SELECT array_agg(DISTINCT party_id ORDER BY party_id) INTO matched
  FROM (
    SELECT pe.party_id
    FROM business_v2.party_emails pe
    JOIN business_v2.parties p ON p.id=pe.party_id AND p.merged_into IS NULL
    WHERE lower(pe.email::text)=${sqlLiteral(email)}
    UNION
    SELECT p.id
    FROM business_v2.parties p
    WHERE p.merged_into IS NULL AND lower(p.primary_email::text)=${sqlLiteral(email)}
  ) exact_matches;
  IF COALESCE(cardinality(matched),0) > 1 THEN
    RAISE EXCEPTION 'multiple active Parties match participant ${participant.participant_key.slice(0, 16)}';
  ELSIF COALESCE(cardinality(matched),0) = 1 THEN
    selected_id := matched[1];
  ELSIF ${allowCreate} THEN
    INSERT INTO business_v2.parties
      (party_type,display_name,primary_email,source_provider,source_id,
       created_at,updated_at,last_updated_by)
    VALUES ('person',${sqlLiteral(participant.display_name)},${sqlLiteral(email)},
      NULL,${sqlLiteral(`${batch}:participant:${participant.participant_key}`)},
      ${sqlTimestamp(observedAt)},${sqlTimestamp(observedAt)},${sqlLiteral(actor)})
    RETURNING id INTO selected_id;
    INSERT INTO shadow_apply_stats(name,value) VALUES ('parties',1)
      ON CONFLICT (name) DO UPDATE
      SET value=shadow_apply_stats.value + EXCLUDED.value;
  ELSE
    RAISE EXCEPTION 'exact Party missing for participant ${participant.participant_key.slice(0, 16)}';
  END IF;
  INSERT INTO business_v2.party_emails(party_id,email,is_primary,verified_at)
  VALUES (selected_id,${sqlLiteral(email)},true,${sqlTimestamp(observedAt)})
  ON CONFLICT (party_id,email) DO NOTHING;
  INSERT INTO shadow_party_map(participant_key,party_id)
  VALUES (${sqlLiteral(participant.participant_key)},selected_id);
END $$;`);

    lines.push(
      countedInsert(
        'orders',
        `INSERT INTO business_v2.student_enrollment_orders
          (order_key,source_channel,offer_key,bundle_key,bundle_version,payer_party_id,
           seat_count,financial_classification,state,version,policy_revision,
           evidence_sha256,effective_at,created_at,updated_at,updated_by)
         VALUES (${sqlLiteral(orderKey)},'migration_or_correction',
           ${sqlLiteral(participant.offer_key)},${sqlLiteral(participant.bundle_key)},1,NULL,
           1,${sqlLiteral(participant.financial_classification)},'materialized',0,1,
           ${sqlLiteral(participant.record_evidence_sha256)},${sqlTimestamp(observedAt)},
           ${sqlTimestamp(observedAt)},${sqlTimestamp(observedAt)},${sqlLiteral(actor)})
         ON CONFLICT (order_key) DO NOTHING`,
      ),
      countedInsert(
        'source_refs',
        `INSERT INTO business_v2.student_enrollment_order_source_refs
          (order_id,source_scope,source_object_type,source_object_id,
           idempotency_key,evidence_sha256,observed_at,recorded_at,recorded_by)
         SELECT id,${sqlLiteral(participant.source_scope)},'roster_assignment',
           ${sqlLiteral(rec)},${sqlLiteral(sourceRefKey)},
           ${sqlLiteral(participant.record_evidence_sha256)},${sqlTimestamp(observedAt)},
           ${sqlTimestamp(observedAt)},${sqlLiteral(actor)}
         FROM business_v2.student_enrollment_orders WHERE order_key=${sqlLiteral(orderKey)}
         ON CONFLICT (idempotency_key) DO NOTHING`,
      ),
      countedInsert(
        'seats',
        `INSERT INTO business_v2.student_enrollment_seats
          (seat_key,order_id,seat_number,participant_party_id,
           participant_evidence_sha256,payer_relationship,state,version,
           created_at,updated_at,updated_by)
         SELECT ${sqlLiteral(seatKey)},o.id,1,m.party_id,
           ${sqlLiteral(participant.record_evidence_sha256)},'unknown','materialized',0,
           ${sqlTimestamp(observedAt)},${sqlTimestamp(observedAt)},${sqlLiteral(actor)}
         FROM business_v2.student_enrollment_orders o
         JOIN shadow_party_map m ON m.participant_key=${sqlLiteral(participant.participant_key)}
         WHERE o.order_key=${sqlLiteral(orderKey)}
         ON CONFLICT (seat_key) DO NOTHING`,
      ),
      countedInsert(
        'agreements',
        `INSERT INTO business_v2.student_financial_agreements
          (agreement_key,order_id,agreement_type,state,source_reference_id,version,
           evidence_sha256,created_at,updated_at,updated_by)
         SELECT ${sqlLiteral(agreementKey)},o.id,'other_explicit',
           ${sqlLiteral(participant.financial_classification === 'held' ? 'held' : 'complete')},
           sr.id,0,${sqlLiteral(participant.record_evidence_sha256)},
           ${sqlTimestamp(observedAt)},${sqlTimestamp(observedAt)},${sqlLiteral(actor)}
         FROM business_v2.student_enrollment_orders o
         JOIN business_v2.student_enrollment_order_source_refs sr ON sr.order_id=o.id
         WHERE o.order_key=${sqlLiteral(orderKey)} AND sr.idempotency_key=${sqlLiteral(sourceRefKey)}
         ON CONFLICT (agreement_key) DO NOTHING`,
      ),
      countedInsert(
        'enrollments',
        `INSERT INTO business_v2.student_enrollments_v2
          (enrollment_key,order_id,seat_id,participant_party_id,offer_key,bundle_key,
           bundle_version,catalog_revision,state,version,effective_at,ended_at,
           materialization_sha256,created_at,updated_at,updated_by)
         SELECT ${sqlLiteral(enrollmentKey)},o.id,s.id,m.party_id,
           ${sqlLiteral(participant.offer_key)},${sqlLiteral(participant.bundle_key)},1,1,
           'active',0,${sqlTimestamp(observedAt)},NULL,
           ${sqlLiteral(participant.record_evidence_sha256)},
           ${sqlTimestamp(observedAt)},${sqlTimestamp(observedAt)},${sqlLiteral(actor)}
         FROM business_v2.student_enrollment_orders o
         JOIN business_v2.student_enrollment_seats s ON s.order_id=o.id AND s.seat_key=${sqlLiteral(seatKey)}
         JOIN shadow_party_map m ON m.participant_key=${sqlLiteral(participant.participant_key)}
         WHERE o.order_key=${sqlLiteral(orderKey)}
         ON CONFLICT (enrollment_key) DO NOTHING`,
      ),
    );

    for (const component of participant.components) {
      const entitlementKey = `${batch}:entitlement:${rec}:${component.component_key}`;
      lines.push(
        countedInsert(
          'entitlements',
          `INSERT INTO business_v2.student_component_entitlements
            (entitlement_key,enrollment_id,component_key,grant_episode,state,version,
             evidence_sha256,created_at,updated_at,updated_by)
           SELECT ${sqlLiteral(entitlementKey)},id,${sqlLiteral(component.component_key)},1,
             ${sqlLiteral(component.state)},0,${sqlLiteral(participant.record_evidence_sha256)},
             ${sqlTimestamp(observedAt)},${sqlTimestamp(observedAt)},${sqlLiteral(actor)}
           FROM business_v2.student_enrollments_v2 WHERE enrollment_key=${sqlLiteral(enrollmentKey)}
           ON CONFLICT (entitlement_key) DO NOTHING`,
        ),
      );
    }

    const assignmentEntitlementKey = `${batch}:entitlement:${rec}:${participant.assignment_component_key}`;
    lines.push(
      countedInsert(
        'assignments',
        `INSERT INTO business_v2.student_class_assignments
          (assignment_key,enrollment_id,entitlement_id,delivery_block_key,state,version,
           schedule_evidence_sha256,starts_at,ends_at,created_at,updated_at,updated_by)
         SELECT ${sqlLiteral(assignmentKey)},e.id,t.id,${sqlLiteral(participant.delivery_block_key)},
           'active',0,b.schedule_evidence_sha256,b.starts_at,b.ends_at,
           ${sqlTimestamp(observedAt)},${sqlTimestamp(observedAt)},${sqlLiteral(actor)}
         FROM business_v2.student_enrollments_v2 e
         JOIN business_v2.student_component_entitlements t ON t.enrollment_id=e.id
           AND t.entitlement_key=${sqlLiteral(assignmentEntitlementKey)}
         JOIN business_v2.academy_delivery_blocks b
           ON b.delivery_block_key=${sqlLiteral(participant.delivery_block_key)}
         WHERE e.enrollment_key=${sqlLiteral(enrollmentKey)}
         ON CONFLICT (assignment_key) DO NOTHING`,
      ),
      countedInsert(
        'evidence',
        `INSERT INTO business_v2.student_enrollment_evidence
          (evidence_key,subject_type,subject_key,evidence_type,source_reference_id,
           evidence_sha256,observed_at,recorded_at,recorded_by)
         SELECT ${sqlLiteral(`${batch}:evidence:assignment:${rec}`)},'assignment',
           ${sqlLiteral(assignmentKey)},'source_reconciliation',sr.id,
           ${sqlLiteral(participant.record_evidence_sha256)},${sqlTimestamp(observedAt)},
           ${sqlTimestamp(observedAt)},${sqlLiteral(actor)}
         FROM business_v2.student_enrollment_order_source_refs sr
         WHERE sr.idempotency_key=${sqlLiteral(sourceRefKey)}
         ON CONFLICT (evidence_key) DO NOTHING`,
      ),
      countedInsert(
        'projection_outbox',
        `INSERT INTO business_v2.student_projection_outbox
          (projection_key,target,subject_type,subject_key,subject_version,state,
           attempt_count,payload_sha256,expected_readback_sha256,payload_json,
           lease_token,lease_expires_at,last_error_code,created_at,updated_at)
         VALUES (${sqlLiteral(projectionKey)},'student_roster','assignment',
           ${sqlLiteral(assignmentKey)},0,'verified',0,
           ${sqlLiteral(participant.record_evidence_sha256)},
           ${sqlLiteral(participant.record_evidence_sha256)},
           jsonb_build_object('mode','imported_verified_projection',
             'source','student_roster','readback_sha256',${sqlLiteral(participant.record_evidence_sha256)}),
           NULL,NULL,NULL,${sqlTimestamp(observedAt)},${sqlTimestamp(observedAt)})
         ON CONFLICT (projection_key) DO NOTHING`,
      ),
      countedInsert(
        'projection_receipts',
        `INSERT INTO business_v2.student_projection_receipts
          (receipt_key,outbox_id,subject_version,stage,outcome,result_code,
           evidence_sha256,actor,occurred_at,recorded_at)
         SELECT ${sqlLiteral(receiptKey)},id,0,'final','verified',
           'imported_source_readback_verified',${sqlLiteral(participant.record_evidence_sha256)},
           ${sqlLiteral(actor)},${sqlTimestamp(observedAt)},${sqlTimestamp(observedAt)}
         FROM business_v2.student_projection_outbox WHERE projection_key=${sqlLiteral(projectionKey)}
         ON CONFLICT (receipt_key) DO NOTHING`,
      ),
      countedInsert(
        'history',
        `INSERT INTO business_v2.student_enrollment_history
          (subject_type,subject_key,previous_version,new_version,command_key,reason_code,
           evidence_sha256,actor,occurred_at,recorded_at)
         VALUES ('assignment',${sqlLiteral(assignmentKey)},NULL,0,'shadow_population',
           'source_reconciliation_import',${sqlLiteral(participant.record_evidence_sha256)},
           ${sqlLiteral(actor)},${sqlTimestamp(observedAt)},${sqlTimestamp(observedAt)})
         ON CONFLICT (subject_type,subject_key,new_version) DO NOTHING`,
      ),
      countedInsert(
        'capacity_events',
        `INSERT INTO business_v2.academy_capacity_events
          (event_key,subject_type,subject_key,previous_version,new_version,event_type,
           evidence_sha256,actor,occurred_at,recorded_at)
         VALUES (${sqlLiteral(`${batch}:event:assignment:${rec}`)},'assignment',
           ${sqlLiteral(assignmentKey)},NULL,0,'shadow_assignment_imported',
           ${sqlLiteral(participant.record_evidence_sha256)},${sqlLiteral(actor)},
           ${sqlTimestamp(observedAt)},${sqlTimestamp(observedAt)})
         ON CONFLICT (event_key) DO NOTHING`,
      ),
      `DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM business_v2.student_enrollment_orders o
          JOIN business_v2.student_enrollment_seats s ON s.order_id=o.id
          JOIN business_v2.student_enrollments_v2 e ON e.seat_id=s.id AND e.order_id=o.id
          JOIN business_v2.student_class_assignments a ON a.enrollment_id=e.id
          JOIN business_v2.student_financial_agreements f ON f.order_id=o.id
          WHERE o.order_key=${sqlLiteral(orderKey)}
            AND o.offer_key=${sqlLiteral(participant.offer_key)}
            AND o.bundle_key=${sqlLiteral(participant.bundle_key)}
            AND o.financial_classification=${sqlLiteral(participant.financial_classification)}
            AND s.seat_key=${sqlLiteral(seatKey)} AND s.payer_relationship='unknown'
            AND e.enrollment_key=${sqlLiteral(enrollmentKey)} AND e.state='active'
            AND a.assignment_key=${sqlLiteral(assignmentKey)} AND a.state='active'
            AND a.delivery_block_key=${sqlLiteral(participant.delivery_block_key)}
            AND f.agreement_key=${sqlLiteral(agreementKey)}
            AND f.state=${sqlLiteral(participant.financial_classification === 'held' ? 'held' : 'complete')}
        ) THEN RAISE EXCEPTION 'participant chain readback mismatch ${rec}'; END IF;
        IF (SELECT count(*) FROM business_v2.student_component_entitlements t
            JOIN business_v2.student_enrollments_v2 e ON e.id=t.enrollment_id
            WHERE e.enrollment_key=${sqlLiteral(enrollmentKey)}) <> ${participant.components.length}
        THEN RAISE EXCEPTION 'entitlement count mismatch ${rec}'; END IF;
      END $$;`,
    );
  }

  for (const exception of manifest.exceptions) {
    const subjectKey = participantSubjectKey(
      exception,
      participantsByKey,
      batch,
    );
    lines.push(
      countedInsert(
        'exceptions',
        `INSERT INTO business_v2.student_enrollment_exceptions_v2
          (exception_key,subject_type,subject_key,reason_code,state,severity,
           owner_role,version,occurrence_count,evidence_sha256,first_seen_at,
           last_seen_at,review_at,resolved_at,resolution_sha256,updated_by)
         VALUES (${sqlLiteral(exception.exception_key)},${sqlLiteral(exception.subject_type)},
           ${sqlLiteral(subjectKey)},${sqlLiteral(exception.reason_code)},'open',
           ${sqlLiteral(exception.severity)},${sqlLiteral(exception.owner_role)},0,1,
           ${sqlLiteral(exception.evidence_sha256)},${sqlTimestamp(observedAt)},
           ${sqlTimestamp(observedAt)},${sqlTimestamp(exception.review_at)},NULL,NULL,
           ${sqlLiteral(actor)})
         ON CONFLICT (exception_key) DO NOTHING`,
      ),
      countedInsert(
        'history',
        `INSERT INTO business_v2.student_enrollment_history
          (subject_type,subject_key,previous_version,new_version,command_key,reason_code,
           evidence_sha256,actor,occurred_at,recorded_at)
         VALUES ('exception',${sqlLiteral(exception.exception_key)},NULL,0,
           'shadow_population','held_source_exception',${sqlLiteral(exception.evidence_sha256)},
           ${sqlLiteral(actor)},${sqlTimestamp(observedAt)},${sqlTimestamp(observedAt)})
         ON CONFLICT (subject_type,subject_key,new_version) DO NOTHING`,
      ),
    );
  }

  const occupancyChecks = Object.entries(EXPECTED_OCCUPANCY)
    .map(
      ([key, value]) =>
        `(SELECT occupied=${value} AND capacity=12 AND available=${Math.max(0, 12 - value)} AND public_state=${sqlLiteral(value >= 12 ? 'sold_out' : 'open')} FROM business_v2.v_academy_seat_pool_occupancy WHERE delivery_block_key=${sqlLiteral(key)})`,
    )
    .join(' AND ');
  lines.push(
    `DO $$ BEGIN
      IF (SELECT count(*) FROM business_v2.academy_delivery_blocks
          WHERE delivery_block_key=ANY(ARRAY[${Object.keys(EXPECTED_OCCUPANCY).map(sqlLiteral).join(',')}])) <> 5
      THEN RAISE EXCEPTION 'delivery block readback count mismatch'; END IF;
      IF (SELECT count(*) FROM business_v2.student_class_assignments
          WHERE assignment_key LIKE ${sqlLiteral(`${batch}:assignment:%`)} AND state='active') <> 40
      THEN RAISE EXCEPTION 'assignment readback count mismatch'; END IF;
      IF (SELECT count(*) FROM business_v2.student_enrollment_exceptions_v2
          WHERE exception_key LIKE ${sqlLiteral(`${batch}:exception:%`)} AND state='open') <> 3
      THEN RAISE EXCEPTION 'held exception readback count mismatch'; END IF;
      IF (SELECT count(*) FROM business_v2.student_projection_outbox
          WHERE projection_key LIKE ${sqlLiteral(`${batch}:projection:%`)} AND state<>'verified') <> 0
      THEN RAISE EXCEPTION 'projection outbox is not fully verified'; END IF;
      IF NOT (${occupancyChecks})
      THEN RAISE EXCEPTION 'capacity occupancy readback mismatch'; END IF;
      IF (SELECT count(*) FROM business_v2.academy_capacity_reservations r
          JOIN business_v2.academy_seat_pools p ON p.id=r.pool_id
          WHERE p.pool_key LIKE ${sqlLiteral(`${batch}:pool:%`)}) <> 0
      THEN RAISE EXCEPTION 'shadow population created reservations'; END IF;
      IF (SELECT count(*) FROM business_v2.academy_waitlist_entries w
          JOIN business_v2.academy_seat_pools p ON p.id=w.pool_id
          WHERE p.pool_key LIKE ${sqlLiteral(`${batch}:pool:%`)}) <> 0
      THEN RAISE EXCEPTION 'shadow population created waitlist entries'; END IF;
    END $$;`,
    `SELECT json_build_object(
      'ok',true,
      'batch_key',${sqlLiteral(manifest.batch_key)},
      'manifest_sha256',${sqlLiteral(manifestSha256(manifest))},
      'inserted',COALESCE((SELECT json_object_agg(name,value ORDER BY name) FROM shadow_apply_stats),'{}'::json),
      'counts',json_build_object(
        'delivery_blocks',(SELECT count(*) FROM business_v2.academy_delivery_blocks WHERE delivery_block_key=ANY(ARRAY[${Object.keys(EXPECTED_OCCUPANCY).map(sqlLiteral).join(',')}])),
        'seat_pools',(SELECT count(*) FROM business_v2.academy_seat_pools WHERE pool_key LIKE ${sqlLiteral(`${batch}:pool:%`)}),
        'offer_mappings',(SELECT count(*) FROM business_v2.academy_seat_pool_offers WHERE mapping_key LIKE ${sqlLiteral(`${batch}:mapping:%`)}),
        'orders',(SELECT count(*) FROM business_v2.student_enrollment_orders WHERE order_key LIKE ${sqlLiteral(`${batch}:order:%`)}),
        'enrollments',(SELECT count(*) FROM business_v2.student_enrollments_v2 WHERE enrollment_key LIKE ${sqlLiteral(`${batch}:enrollment:%`)}),
        'entitlements',(SELECT count(*) FROM business_v2.student_component_entitlements WHERE entitlement_key LIKE ${sqlLiteral(`${batch}:entitlement:%`)}),
        'assignments',(SELECT count(*) FROM business_v2.student_class_assignments WHERE assignment_key LIKE ${sqlLiteral(`${batch}:assignment:%`)}),
        'exceptions',(SELECT count(*) FROM business_v2.student_enrollment_exceptions_v2 WHERE exception_key LIKE ${sqlLiteral(`${batch}:exception:%`)}),
        'pending_projections',(SELECT count(*) FROM business_v2.student_projection_outbox WHERE projection_key LIKE ${sqlLiteral(`${batch}:projection:%`)} AND state<>'verified'),
        'reservations',(SELECT count(*) FROM business_v2.academy_capacity_reservations r JOIN business_v2.academy_seat_pools p ON p.id=r.pool_id WHERE p.pool_key LIKE ${sqlLiteral(`${batch}:pool:%`)}),
        'waitlist_entries',(SELECT count(*) FROM business_v2.academy_waitlist_entries w JOIN business_v2.academy_seat_pools p ON p.id=w.pool_id WHERE p.pool_key LIKE ${sqlLiteral(`${batch}:pool:%`)})
      ),
      'occupancy',(SELECT json_agg(row_to_json(v) ORDER BY delivery_block_key) FROM (
        SELECT delivery_block_key,capacity,occupied,reserved,available,waitlist_count,public_state
        FROM business_v2.v_academy_seat_pool_occupancy
        WHERE delivery_block_key=ANY(ARRAY[${Object.keys(EXPECTED_OCCUPANCY).map(sqlLiteral).join(',')}])
      ) v)
    );`,
    'COMMIT;',
  );
  return `${lines.join('\n')}\n`;
}

function parseArgs(argv) {
  const result = {
    manifest: '',
    database: PRODUCTION_DB,
    psql: '/opt/homebrew/opt/postgresql@16/bin/psql',
    apply: false,
    confirmHost: '',
    expectedManifestSha256: '',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--manifest') result.manifest = argv[++index] ?? '';
    else if (arg === '--database') result.database = argv[++index] ?? '';
    else if (arg === '--psql') result.psql = argv[++index] ?? '';
    else if (arg === '--apply') result.apply = true;
    else if (arg === '--confirm-host') result.confirmHost = argv[++index] ?? '';
    else if (arg === '--expected-manifest-sha256')
      result.expectedManifestSha256 = argv[++index] ?? '';
    else if (arg === '--help') result.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return result;
}

function usage() {
  return `Usage: populate-academy-capacity-shadow.mjs --manifest PRIVATE_JSON
       [--database nanoclaw_business] [--psql /absolute/path]
       [--apply --confirm-host HOST --expected-manifest-sha256 SHA256]

Dry-run is the default. The private manifest must be a mode-0600 regular file.
Apply is allowed only for nanoclaw_business or a generated disposable database.
The command prints aggregate counts and hashes only.`;
}

function loadPrivateManifest(filePath) {
  const resolved = path.resolve(filePath);
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile())
    throw new Error('private manifest must be a regular file');
  if ((stat.mode & 0o077) !== 0)
    throw new Error(
      'private manifest must not grant group or world permissions',
    );
  const manifest = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  const findings = validateAcademyCapacityShadowManifest(manifest);
  if (findings.length)
    throw new Error(
      `invalid Academy capacity shadow manifest: ${findings.join('; ')}`,
    );
  return manifest;
}

function assertDatabaseName(database) {
  if (database !== PRODUCTION_DB && !DISPOSABLE_DB.test(database))
    throw new Error(
      'refusing database outside production or generated disposable scope',
    );
}

export function runAcademyCapacityShadowPopulation(options) {
  if (!options.manifest) throw new Error('--manifest is required');
  assertDatabaseName(options.database);
  const manifest = loadPrivateManifest(options.manifest);
  const digest = manifestSha256(manifest);
  const summary = {
    ok: true,
    dry_run: !options.apply,
    batch_key: manifest.batch_key,
    manifest_sha256: digest,
    delivery_blocks: manifest.delivery_blocks.length,
    participants: manifest.participants.length,
    held_exceptions: manifest.exceptions.length,
    create_party_allowances: manifest.participants.filter(
      (entry) => entry.allow_create_party,
    ).length,
  };
  if (!options.apply) return summary;
  if (!SHA256.test(options.expectedManifestSha256 ?? ''))
    throw new Error('--expected-manifest-sha256 is required for apply');
  if (options.expectedManifestSha256 !== digest)
    throw new Error('private manifest SHA-256 does not match approval');
  const actualHost = os.hostname();
  if (!options.confirmHost || options.confirmHost !== actualHost)
    throw new Error(`host confirmation mismatch: expected ${actualHost}`);
  if (!path.isAbsolute(options.psql) || !fs.existsSync(options.psql))
    throw new Error('psql binary is unavailable at the required absolute path');
  const sql = renderAcademyCapacityShadowSql(manifest);
  const result = spawnSync(
    options.psql,
    [
      '-X',
      '--no-psqlrc',
      '-v',
      'ON_ERROR_STOP=1',
      '-qAt',
      '-d',
      options.database,
    ],
    {
      cwd: ROOT,
      encoding: 'utf8',
      input: sql,
      env: Object.fromEntries(
        ['PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'TMPDIR']
          .filter((key) => process.env[key] !== undefined)
          .map((key) => [key, process.env[key]]),
      ),
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  if (result.status !== 0) {
    const detail = `${result.stderr ?? ''}\n${result.stdout ?? ''}`
      .trim()
      .slice(-4000);
    throw new Error(`Academy capacity shadow population failed: ${detail}`);
  }
  const output = result.stdout
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (output.length !== 1)
    throw new Error('population did not return exactly one aggregate receipt');
  const receipt = JSON.parse(output[0]);
  if (receipt?.manifest_sha256 !== digest || receipt?.ok !== true)
    throw new Error('population aggregate receipt failed manifest readback');
  return receipt;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const result = runAcademyCapacityShadowPopulation(options);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `ERROR: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
