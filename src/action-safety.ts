import crypto from 'node:crypto';

import { readEnvFile } from './env.js';

export const ACTION_SAFETY_ENV_KEYS = [
  'ACTION_SAFETY_ENFORCEMENT_ENABLED',
  'EXTERNAL_WRITE_SAFE_MODE',
  'EXTERNAL_WRITE_DISABLED_SYSTEMS',
] as const;

export const ACTION_SYSTEMS = [
  'gmail',
  'slack',
  'courses_smtp',
  'plutio',
  'stripe',
  'hive_firestore',
  'things',
] as const;

export const ACTION_CLASSES = [
  'c2_external_write',
  'c3_external_communication',
  'c4_financial',
  'c5_destructive',
] as const;

export type ActionSystem = (typeof ACTION_SYSTEMS)[number];
export type ActionClass = (typeof ACTION_CLASSES)[number];

export interface ActionApprovalV1 {
  approvalId: string;
  operatorIdSha256: string;
  occurredAt: string;
}

/**
 * Host-owned, content-free execution contract. Durable domain stores remain
 * authoritative for claim/receipt state; this envelope binds the exact request
 * that those stores authorize without copying customer content into telemetry.
 */
export interface ActionEnvelopeV1 {
  version: 1;
  actionId: string;
  idempotencyKey: string;
  nonce: string;
  system: ActionSystem;
  actionClass: ActionClass;
  source: string;
  workItemId?: string;
  targetSha256: string;
  payloadSha256: string;
  policyVersion: string;
  createdAt: string;
  expiresAt: string;
  approval?: ActionApprovalV1;
  fingerprint: string;
}

export type ActionClaimState = {
  state: 'unclaimed' | 'claimed' | 'confirmed' | 'failed';
  actionId: string;
  idempotencyKey: string;
  fingerprint: string;
};

export interface ActionSafetyConfig {
  enforcementEnabled: boolean;
  globalSafeMode: boolean;
  disabledSystems: ActionSystem[];
  valid: boolean;
  errorCode?: 'invalid_boolean' | 'unknown_disabled_system';
}

export type ActionSafetyDecisionCode =
  | 'allowed_compatibility_mode'
  | 'allowed_verified'
  | 'misconfigured'
  | 'global_safe_mode'
  | 'system_safe_mode'
  | 'unknown_system'
  | 'unknown_action_class'
  | 'envelope_required'
  | 'envelope_invalid'
  | 'envelope_mutated'
  | 'envelope_mismatch'
  | 'envelope_expired'
  | 'envelope_not_yet_valid'
  | 'approval_required'
  | 'request_binding_required'
  | 'approval_mismatch'
  | 'claim_state_required'
  | 'claim_mismatch'
  | 'claim_replay';

export interface ActionSafetyDecision {
  allowed: boolean;
  code: ActionSafetyDecisionCode;
  system: string;
}

export interface ExternalWriteRequest {
  system: string;
  actionClass: string;
  source: string;
  envelope?: ActionEnvelopeV1;
  binding?: {
    targetSha256: string;
    payloadSha256: string;
    policyVersion: string;
    approvalId?: string;
    operatorIdSha256?: string;
  };
  claim?: ActionClaimState;
  now?: Date;
}

export interface BuildActionEnvelopeInput {
  actionId: string;
  idempotencyKey: string;
  nonce: string;
  system: ActionSystem;
  actionClass: ActionClass;
  source: string;
  workItemId?: string;
  target: unknown;
  payload: unknown;
  policyVersion: string;
  createdAt: string;
  expiresAt: string;
  approval?: {
    approvalId: string;
    operatorId: string;
    occurredAt: string;
  };
}

const SHA256_RE = /^[a-f0-9]{64}$/;
const OPAQUE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9:._/-]{2,199}$/;
const counters = {
  allowed: 0,
  denied: 0,
  byCode: {} as Record<string, number>,
  bySystem: {} as Record<string, number>,
  lastDeniedAt: null as string | null,
};

function stableJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(',')}}`;
}

export function sha256(value: unknown): string {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex');
}

function envelopeBody(
  envelope: Omit<ActionEnvelopeV1, 'fingerprint'> | ActionEnvelopeV1,
): Omit<ActionEnvelopeV1, 'fingerprint'> {
  const { fingerprint: _fingerprint, ...body } = envelope as ActionEnvelopeV1;
  return body;
}

export function fingerprintActionEnvelope(
  envelope: Omit<ActionEnvelopeV1, 'fingerprint'> | ActionEnvelopeV1,
): string {
  return sha256(envelopeBody(envelope));
}

export function buildActionEnvelope(
  input: BuildActionEnvelopeInput,
): ActionEnvelopeV1 {
  const body: Omit<ActionEnvelopeV1, 'fingerprint'> = {
    version: 1,
    actionId: input.actionId,
    idempotencyKey: input.idempotencyKey,
    nonce: input.nonce,
    system: input.system,
    actionClass: input.actionClass,
    source: input.source,
    ...(input.workItemId ? { workItemId: input.workItemId } : {}),
    targetSha256: sha256(input.target),
    payloadSha256: sha256(input.payload),
    policyVersion: input.policyVersion,
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
    ...(input.approval
      ? {
          approval: {
            approvalId: input.approval.approvalId,
            operatorIdSha256: sha256(input.approval.operatorId),
            occurredAt: input.approval.occurredAt,
          },
        }
      : {}),
  };
  const envelope = { ...body, fingerprint: fingerprintActionEnvelope(body) };
  const invalid = validateEnvelopeShape(envelope);
  if (invalid) throw new Error(`Invalid action envelope: ${invalid}`);
  return envelope;
}

function parseStrictBoolean(
  raw: string | undefined,
): { ok: true; value: boolean } | { ok: false } {
  if (raw === undefined || raw === '') return { ok: true, value: false };
  if (raw === '1' || raw === 'true') return { ok: true, value: true };
  if (raw === '0' || raw === 'false') return { ok: true, value: false };
  return { ok: false };
}

export function resolveActionSafetyConfig(
  env: Record<string, string | undefined>,
): ActionSafetyConfig {
  const enforcement = parseStrictBoolean(env.ACTION_SAFETY_ENFORCEMENT_ENABLED);
  const global = parseStrictBoolean(env.EXTERNAL_WRITE_SAFE_MODE);
  if (!enforcement.ok || !global.ok) {
    return {
      enforcementEnabled: true,
      globalSafeMode: true,
      disabledSystems: [],
      valid: false,
      errorCode: 'invalid_boolean',
    };
  }
  const requested = (env.EXTERNAL_WRITE_DISABLED_SYSTEMS ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (
    requested.some((system) => !ACTION_SYSTEMS.includes(system as ActionSystem))
  ) {
    return {
      enforcementEnabled: true,
      globalSafeMode: true,
      disabledSystems: [],
      valid: false,
      errorCode: 'unknown_disabled_system',
    };
  }
  return {
    enforcementEnabled: enforcement.value,
    globalSafeMode: global.value,
    disabledSystems: [...new Set(requested)] as ActionSystem[],
    valid: true,
  };
}

export function loadActionSafetyConfig(): ActionSafetyConfig {
  const file = readEnvFile([...ACTION_SAFETY_ENV_KEYS]);
  const merged: Record<string, string | undefined> = { ...file };
  for (const key of ACTION_SAFETY_ENV_KEYS) {
    if (Object.prototype.hasOwnProperty.call(process.env, key)) {
      merged[key] = process.env[key];
    }
  }
  return resolveActionSafetyConfig(merged);
}

function validDate(raw: string): number | null {
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function validateEnvelopeShape(envelope: ActionEnvelopeV1): string | null {
  if (envelope.version !== 1) return 'version';
  for (const id of [
    envelope.actionId,
    envelope.idempotencyKey,
    envelope.nonce,
    envelope.source,
    envelope.policyVersion,
  ]) {
    if (!OPAQUE_ID_RE.test(id)) return 'opaque_id';
  }
  if (envelope.workItemId && !OPAQUE_ID_RE.test(envelope.workItemId)) {
    return 'work_item_id';
  }
  if (!ACTION_SYSTEMS.includes(envelope.system)) return 'system';
  if (!ACTION_CLASSES.includes(envelope.actionClass)) return 'action_class';
  if (!SHA256_RE.test(envelope.targetSha256)) return 'target_hash';
  if (!SHA256_RE.test(envelope.payloadSha256)) return 'payload_hash';
  const createdAt = validDate(envelope.createdAt);
  const expiresAt = validDate(envelope.expiresAt);
  if (createdAt === null || expiresAt === null || expiresAt <= createdAt) {
    return 'validity_window';
  }
  if (envelope.approval) {
    if (!OPAQUE_ID_RE.test(envelope.approval.approvalId)) return 'approval_id';
    if (!SHA256_RE.test(envelope.approval.operatorIdSha256)) {
      return 'operator_hash';
    }
    const occurredAt = validDate(envelope.approval.occurredAt);
    if (
      occurredAt === null ||
      occurredAt < createdAt ||
      occurredAt > expiresAt
    ) {
      return 'approval_time';
    }
  }
  if (!SHA256_RE.test(envelope.fingerprint)) return 'fingerprint';
  return null;
}

function denied(
  code: ActionSafetyDecisionCode,
  system: string,
): ActionSafetyDecision {
  return { allowed: false, code, system };
}

export function evaluateExternalWrite(
  request: ExternalWriteRequest,
  config: ActionSafetyConfig = loadActionSafetyConfig(),
): ActionSafetyDecision {
  if (!config.valid) return denied('misconfigured', request.system);
  if (config.globalSafeMode) return denied('global_safe_mode', request.system);
  if (!ACTION_SYSTEMS.includes(request.system as ActionSystem)) {
    return denied('unknown_system', request.system);
  }
  if (config.disabledSystems.includes(request.system as ActionSystem)) {
    return denied('system_safe_mode', request.system);
  }
  if (!ACTION_CLASSES.includes(request.actionClass as ActionClass)) {
    return denied('unknown_action_class', request.system);
  }
  if (!request.envelope && !config.enforcementEnabled) {
    return {
      allowed: true,
      code: 'allowed_compatibility_mode',
      system: request.system,
    };
  }
  if (!request.envelope) return denied('envelope_required', request.system);
  const envelope = request.envelope;
  if (validateEnvelopeShape(envelope)) {
    return denied('envelope_invalid', request.system);
  }
  if (fingerprintActionEnvelope(envelope) !== envelope.fingerprint) {
    return denied('envelope_mutated', request.system);
  }
  if (
    envelope.system !== request.system ||
    envelope.actionClass !== request.actionClass ||
    envelope.source !== request.source
  ) {
    return denied('envelope_mismatch', request.system);
  }
  if (!request.binding) {
    return denied('request_binding_required', request.system);
  }
  if (
    request.binding.targetSha256 !== envelope.targetSha256 ||
    request.binding.payloadSha256 !== envelope.payloadSha256 ||
    request.binding.policyVersion !== envelope.policyVersion
  ) {
    return denied('envelope_mismatch', request.system);
  }
  const now = (request.now ?? new Date()).getTime();
  if (now < Date.parse(envelope.createdAt)) {
    return denied('envelope_not_yet_valid', request.system);
  }
  if (now > Date.parse(envelope.expiresAt)) {
    return denied('envelope_expired', request.system);
  }
  if (
    ['c3_external_communication', 'c4_financial', 'c5_destructive'].includes(
      envelope.actionClass,
    ) &&
    !envelope.approval
  ) {
    return denied('approval_required', request.system);
  }
  if (
    envelope.approval &&
    (request.binding.approvalId !== envelope.approval.approvalId ||
      request.binding.operatorIdSha256 !== envelope.approval.operatorIdSha256)
  ) {
    return denied('approval_mismatch', request.system);
  }
  if (!request.claim) return denied('claim_state_required', request.system);
  if (
    request.claim.actionId !== envelope.actionId ||
    request.claim.idempotencyKey !== envelope.idempotencyKey ||
    request.claim.fingerprint !== envelope.fingerprint
  ) {
    return denied('claim_mismatch', request.system);
  }
  if (request.claim.state !== 'unclaimed') {
    return denied('claim_replay', request.system);
  }
  return { allowed: true, code: 'allowed_verified', system: request.system };
}

function recordDecision(decision: ActionSafetyDecision): void {
  counters[decision.allowed ? 'allowed' : 'denied']++;
  counters.byCode[decision.code] = (counters.byCode[decision.code] ?? 0) + 1;
  counters.bySystem[decision.system] =
    (counters.bySystem[decision.system] ?? 0) + 1;
  if (!decision.allowed) counters.lastDeniedAt = new Date().toISOString();
}

export class ExternalWriteDeniedError extends Error {
  constructor(
    readonly code: ActionSafetyDecisionCode,
    readonly system: string,
  ) {
    super(`External write denied: ${system}/${code}`);
    this.name = 'ExternalWriteDeniedError';
  }
}

export function assertExternalWriteAllowed(
  request: ExternalWriteRequest,
): void {
  const decision = evaluateExternalWrite(request);
  recordDecision(decision);
  if (!decision.allowed) {
    throw new ExternalWriteDeniedError(decision.code, decision.system);
  }
}

export function isExternalWriteDeniedError(
  error: unknown,
): error is ExternalWriteDeniedError {
  return error instanceof ExternalWriteDeniedError;
}

export function getActionSafetyStatus(): {
  config: ActionSafetyConfig;
  counters: typeof counters;
} {
  return {
    config: loadActionSafetyConfig(),
    counters: {
      allowed: counters.allowed,
      denied: counters.denied,
      byCode: { ...counters.byCode },
      bySystem: { ...counters.bySystem },
      lastDeniedAt: counters.lastDeniedAt,
    },
  };
}

export function resetActionSafetyDiagnosticsForTest(): void {
  counters.allowed = 0;
  counters.denied = 0;
  counters.byCode = {};
  counters.bySystem = {};
  counters.lastDeniedAt = null;
}
