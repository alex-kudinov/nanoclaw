import {
  RELATIONSHIP_CONTEXT_SECTIONS,
  RelationshipContextContractError,
  stableJson,
  type RelationshipContextSection,
} from './relationship-context-contract.js';
import {
  RELATIONSHIP_CONTEXT_PURPOSES,
  consumeRelationshipContextGrant,
  type RelationshipContextGrantRequest,
  type RelationshipContextPurpose,
  type RelationshipContextSubject,
} from './relationship-context-policy.js';
import {
  type RelationshipContextRepository,
  withRelationshipContextRepository,
} from './relationship-context-store.js';
import { getRelationshipContext } from './relationship-context.js';

export interface RelationshipContextGetPayload {
  type: 'party_context_get';
  purpose: RelationshipContextPurpose;
  subject: RelationshipContextSubject;
  sections: RelationshipContextSection[];
  maxAgeSeconds?: Partial<Record<RelationshipContextSection, number>>;
  groupFolder?: string;
  source_container?: string;
  run_id?: string;
}

export interface RelationshipContextIpcDeps {
  deliverSourceInput(
    groupFolder: string,
    containerName: string,
    text: string,
  ): boolean;
  repository?: RelationshipContextRepository;
  env?: NodeJS.ProcessEnv;
  nowMs?: number;
}

export function isRelationshipContextIpcType(
  type: string,
): type is RelationshipContextGetPayload['type'] {
  return type === 'party_context_get';
}

function validatePayload(
  sourceGroup: string,
  payload: RelationshipContextGetPayload,
): RelationshipContextGrantRequest {
  if (
    payload.groupFolder !== undefined &&
    payload.groupFolder !== sourceGroup
  ) {
    throw new RelationshipContextContractError(
      'relationship_context_group_mismatch',
    );
  }
  if (!RELATIONSHIP_CONTEXT_PURPOSES.includes(payload.purpose)) {
    throw new RelationshipContextContractError(
      'relationship_context_purpose_invalid',
    );
  }
  if (
    !Array.isArray(payload.sections) ||
    payload.sections.length === 0 ||
    payload.sections.some(
      (section) => !RELATIONSHIP_CONTEXT_SECTIONS.includes(section),
    )
  ) {
    throw new RelationshipContextContractError(
      'relationship_context_sections_invalid',
    );
  }
  return {
    purpose: payload.purpose,
    subject: payload.subject,
    sections: payload.sections,
    maxAgeSeconds: payload.maxAgeSeconds,
  };
}

async function runWithRepository<T>(
  repository: RelationshipContextRepository | undefined,
  fn: (value: RelationshipContextRepository) => Promise<T>,
): Promise<T> {
  if (repository) return fn(repository);
  return withRelationshipContextRepository('relationship-context-query', fn);
}

export async function dispatchRelationshipContextIpc(
  sourceGroup: string,
  payload: RelationshipContextGetPayload,
  deps: RelationshipContextIpcDeps,
): Promise<void> {
  if (!payload.source_container || !payload.run_id) {
    throw new RelationshipContextContractError(
      'relationship_context_host_binding_missing',
    );
  }
  const request = validatePayload(sourceGroup, payload);
  const grant = consumeRelationshipContextGrant({
    group: sourceGroup,
    runId: payload.run_id,
    sourceContainer: payload.source_container,
    request,
    env: deps.env,
    nowMs: deps.nowMs,
  });
  const pack = await runWithRepository(deps.repository, (repository) =>
    getRelationshipContext({ repository, grant, nowMs: deps.nowMs }),
  );
  const serialized = stableJson(pack);
  if (Buffer.byteLength(serialized, 'utf8') > 32 * 1024) {
    await runWithRepository(deps.repository, (repository) =>
      repository.markQueryDelivery({
        receiptId: pack.receiptId,
        status: 'failed',
        errorCode: 'response_too_large',
        deliveredAt: null,
      }),
    );
    throw new RelationshipContextContractError(
      'relationship_context_response_too_large',
    );
  }
  const delivered = deps.deliverSourceInput(
    sourceGroup,
    payload.source_container,
    `[RELATIONSHIP CONTEXT]\n${serialized}`,
  );
  if (!delivered) {
    await runWithRepository(deps.repository, (repository) =>
      repository.markQueryDelivery({
        receiptId: pack.receiptId,
        status: 'failed',
        errorCode: 'source_container_unavailable',
        deliveredAt: null,
      }),
    );
    throw new RelationshipContextContractError(
      'relationship_context_source_container_unavailable',
    );
  }
  await runWithRepository(deps.repository, (repository) =>
    repository.markQueryDelivery({
      receiptId: pack.receiptId,
      status: 'delivered',
      errorCode: null,
      deliveredAt: new Date(deps.nowMs ?? Date.now()).toISOString(),
    }),
  );
}
