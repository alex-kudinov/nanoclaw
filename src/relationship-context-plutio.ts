import crypto from 'node:crypto';

import {
  RelationshipContextContractError,
  assertBoundedJson,
  sha256Json,
} from './relationship-context-contract.js';

export interface PlutioProjectionPlan {
  planUuid: string;
  partyId: number;
  plutioRefEntityId: number | null;
  projectionVersion: number;
  projectionSha256: string;
  proposedFields: Record<string, unknown>;
  status: 'planned' | 'no_change' | 'conflict' | 'uncertain';
  conflictCodes: string[];
  mode: 'dry_run';
}

const TASK_OWNED_FIELDS = new Set([
  'company_os_party_id',
  'relationship_summary',
  'program_summary',
  'next_appointment',
  'payment_gate',
  'learning_summary',
  'last_external_contact',
  'open_work_summary',
  'context_freshness',
]);

function validateFields(
  value: Record<string, unknown>,
  code: string,
): Record<string, unknown> {
  assertBoundedJson(value, code);
  if (
    Object.keys(value).length > 100 ||
    Object.keys(value).some((key) => !TASK_OWNED_FIELDS.has(key))
  ) {
    throw new RelationshipContextContractError(code);
  }
  return structuredClone(value);
}

export function planPlutioProjection(input: {
  partyId: number;
  plutioRefEntityId: number | null;
  projectionVersion: number;
  desiredFields: Record<string, unknown>;
  providerFields: Record<string, unknown>;
  lastReceiptedFields: Record<string, unknown> | null;
  providerReadCertain: boolean;
}): PlutioProjectionPlan {
  if (
    !Number.isSafeInteger(input.partyId) ||
    input.partyId < 1 ||
    !Number.isSafeInteger(input.projectionVersion) ||
    input.projectionVersion < 1 ||
    (input.plutioRefEntityId !== null &&
      (!Number.isSafeInteger(input.plutioRefEntityId) ||
        input.plutioRefEntityId < 1))
  ) {
    throw new RelationshipContextContractError(
      'relationship_context_plutio_plan_invalid',
    );
  }
  const desired = validateFields(
    input.desiredFields,
    'relationship_context_plutio_desired_fields_invalid',
  );
  const provider = validateFields(
    input.providerFields,
    'relationship_context_plutio_provider_fields_invalid',
  );
  const last = input.lastReceiptedFields
    ? validateFields(
        input.lastReceiptedFields,
        'relationship_context_plutio_receipted_fields_invalid',
      )
    : null;
  const conflictCodes: string[] = [];
  if (!input.providerReadCertain) conflictCodes.push('provider_read_uncertain');
  if (!input.plutioRefEntityId) conflictCodes.push('plutio_ref_missing');
  if (last) {
    for (const key of Object.keys(provider)) {
      if (
        Object.hasOwn(last, key) &&
        sha256Json(provider[key]) !== sha256Json(last[key]) &&
        sha256Json(provider[key]) !== sha256Json(desired[key])
      ) {
        conflictCodes.push(`operator_or_provider_drift:${key}`);
      }
    }
  } else if (Object.keys(provider).length > 0) {
    conflictCodes.push('provider_baseline_unreceipted');
  }
  const proposedFields = Object.fromEntries(
    Object.entries(desired).filter(
      ([key, value]) => sha256Json(value) !== sha256Json(provider[key]),
    ),
  );
  const projectionSha256 = sha256Json({
    party_id: input.partyId,
    version: input.projectionVersion,
    fields: desired,
  });
  let status: PlutioProjectionPlan['status'];
  if (!input.providerReadCertain) status = 'uncertain';
  else if (conflictCodes.length > 0) status = 'conflict';
  else if (Object.keys(proposedFields).length === 0) status = 'no_change';
  else status = 'planned';
  return {
    planUuid: crypto.randomUUID(),
    partyId: input.partyId,
    plutioRefEntityId: input.plutioRefEntityId,
    projectionVersion: input.projectionVersion,
    projectionSha256,
    proposedFields,
    status,
    conflictCodes,
    mode: 'dry_run',
  };
}
