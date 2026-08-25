import crypto from 'node:crypto';

import {
  RELATIONSHIP_CONTEXT_SECTIONS,
  RelationshipContextContractError,
  type ExternalReferenceInput,
  type RelationshipContextSection,
  sha256Json,
  validateExternalReference,
} from './relationship-context-contract.js';

export const RELATIONSHIP_CONTEXT_PURPOSES = [
  'answer_appointment_inquiry',
  'service_existing_relationship',
  'intake_prior_context',
  'financial_fulfillment',
  'grading_prerequisite',
  'management_exception',
] as const;

export type RelationshipContextPurpose =
  (typeof RELATIONSHIP_CONTEXT_PURPOSES)[number];

export type RelationshipContextSubject =
  | { kind: 'party'; partyId: number }
  | { kind: 'external_ref'; reference: ExternalReferenceInput };

export interface RelationshipContextGrant {
  grantId: string;
  group: string;
  runId: string;
  sourceContainer: string;
  workItemId: string;
  purpose: RelationshipContextPurpose;
  subject: RelationshipContextSubject;
  sections: RelationshipContextSection[];
  maxAgeSeconds: Partial<Record<RelationshipContextSection, number>>;
  issuedAt: string;
  expiresAt: string;
}

export interface RelationshipContextGrantRequest {
  purpose: RelationshipContextPurpose;
  subject: RelationshipContextSubject;
  sections: RelationshipContextSection[];
  maxAgeSeconds?: Partial<Record<RelationshipContextSection, number>>;
}

const MATRIX: Readonly<
  Record<
    string,
    Partial<
      Record<RelationshipContextPurpose, readonly RelationshipContextSection[]>
    >
  >
> = {
  sales: {
    answer_appointment_inquiry: [
      'identity',
      'relationship',
      'appointments',
      'communications',
      'open_work',
      'data_quality',
    ],
    service_existing_relationship: [
      'identity',
      'relationship',
      'appointments',
      'commercial',
      'communications',
      'learning',
      'consent',
      'open_work',
      'data_quality',
    ],
  },
  booking: {
    answer_appointment_inquiry: [
      'identity',
      'relationship',
      'appointments',
      'open_work',
      'data_quality',
    ],
  },
  inbox: {
    intake_prior_context: [
      'identity',
      'relationship',
      'communications',
      'open_work',
      'data_quality',
    ],
  },
  contador: {
    financial_fulfillment: [
      'identity',
      'relationship',
      'commercial',
      'learning',
      'open_work',
      'data_quality',
    ],
  },
  certifier: {
    grading_prerequisite: [
      'identity',
      'learning',
      'commercial',
      'data_quality',
    ],
  },
  grader: {
    grading_prerequisite: ['identity', 'learning', 'data_quality'],
  },
  chief: {
    management_exception: [...RELATIONSHIP_CONTEXT_SECTIONS],
  },
};

const grants = new Map<string, RelationshipContextGrant>();
const MAX_GRANTS = 500;

export function relationshipContextEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.RELATIONSHIP_CONTEXT_ENABLED === '1';
}

function validateSubject(
  subject: RelationshipContextSubject,
): RelationshipContextSubject {
  if (subject.kind === 'party') {
    if (!Number.isSafeInteger(subject.partyId) || subject.partyId < 1) {
      throw new RelationshipContextContractError(
        'relationship_context_subject_invalid',
      );
    }
    return { kind: 'party', partyId: subject.partyId };
  }
  return {
    kind: 'external_ref',
    reference: validateExternalReference(subject.reference),
  };
}

function validateSections(
  group: string,
  purpose: RelationshipContextPurpose,
  sections: RelationshipContextSection[],
): RelationshipContextSection[] {
  const allowed = MATRIX[group]?.[purpose];
  if (
    !allowed ||
    sections.length === 0 ||
    sections.length > RELATIONSHIP_CONTEXT_SECTIONS.length ||
    new Set(sections).size !== sections.length ||
    sections.some(
      (section) =>
        !RELATIONSHIP_CONTEXT_SECTIONS.includes(section) ||
        !allowed.includes(section),
    )
  ) {
    throw new RelationshipContextContractError(
      'relationship_context_policy_denied',
    );
  }
  return [...sections];
}

function validateHostString(value: string, code: string, max = 200): string {
  if (!value || value.length > max || /[\r\n\0]/.test(value)) {
    throw new RelationshipContextContractError(code);
  }
  return value;
}

function validateMaxAges(
  sections: RelationshipContextSection[],
  values: Partial<Record<RelationshipContextSection, number>> = {},
): Partial<Record<RelationshipContextSection, number>> {
  const out: Partial<Record<RelationshipContextSection, number>> = {};
  for (const [key, value] of Object.entries(values)) {
    if (
      !sections.includes(key as RelationshipContextSection) ||
      !Number.isSafeInteger(value) ||
      value < 1 ||
      value > 31_536_000
    ) {
      throw new RelationshipContextContractError(
        'relationship_context_max_age_invalid',
      );
    }
    out[key as RelationshipContextSection] = value;
  }
  return out;
}

export function issueRelationshipContextGrant(input: {
  group: string;
  runId: string;
  sourceContainer: string;
  workItemId: string;
  purpose: RelationshipContextPurpose;
  subject: RelationshipContextSubject;
  sections: RelationshipContextSection[];
  maxAgeSeconds?: Partial<Record<RelationshipContextSection, number>>;
  ttlSeconds?: number;
  nowMs?: number;
  env?: NodeJS.ProcessEnv;
}): RelationshipContextGrant {
  if (!relationshipContextEnabled(input.env)) {
    throw new RelationshipContextContractError('relationship_context_disabled');
  }
  const now = input.nowMs ?? Date.now();
  const ttl = input.ttlSeconds ?? 300;
  if (!Number.isSafeInteger(ttl) || ttl < 1 || ttl > 600) {
    throw new RelationshipContextContractError(
      'relationship_context_grant_ttl_invalid',
    );
  }
  const sections = validateSections(input.group, input.purpose, input.sections);
  const grant: RelationshipContextGrant = {
    grantId: crypto.randomUUID(),
    group: validateHostString(
      input.group,
      'relationship_context_group_invalid',
    ),
    runId: validateHostString(input.runId, 'relationship_context_run_invalid'),
    sourceContainer: validateHostString(
      input.sourceContainer,
      'relationship_context_container_invalid',
    ),
    workItemId: validateHostString(
      input.workItemId,
      'relationship_context_work_invalid',
      500,
    ),
    purpose: input.purpose,
    subject: validateSubject(input.subject),
    sections,
    maxAgeSeconds: validateMaxAges(sections, input.maxAgeSeconds),
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttl * 1000).toISOString(),
  };
  if (grants.size >= MAX_GRANTS) {
    const oldest = grants.keys().next();
    if (!oldest.done) grants.delete(oldest.value);
  }
  grants.set(grant.grantId, grant);
  return structuredClone(grant);
}

export function consumeRelationshipContextGrant(input: {
  group: string;
  runId: string | undefined;
  sourceContainer: string | undefined;
  request: RelationshipContextGrantRequest;
  nowMs?: number;
  env?: NodeJS.ProcessEnv;
}): RelationshipContextGrant {
  if (!relationshipContextEnabled(input.env)) {
    throw new RelationshipContextContractError('relationship_context_disabled');
  }
  if (!input.runId || !input.sourceContainer) {
    throw new RelationshipContextContractError(
      'relationship_context_host_binding_missing',
    );
  }
  const now = input.nowMs ?? Date.now();
  const subject = validateSubject(input.request.subject);
  const sections = validateSections(
    input.group,
    input.request.purpose,
    input.request.sections,
  );
  const maxAgeSeconds = validateMaxAges(sections, input.request.maxAgeSeconds);
  const candidate = [...grants.values()].find(
    (grant) =>
      grant.group === input.group &&
      grant.runId === input.runId &&
      grant.sourceContainer === input.sourceContainer &&
      grant.purpose === input.request.purpose &&
      sha256Json(grant.subject) === sha256Json(subject) &&
      sha256Json(grant.sections) === sha256Json(sections) &&
      sha256Json(grant.maxAgeSeconds) === sha256Json(maxAgeSeconds),
  );
  if (!candidate) {
    throw new RelationshipContextContractError(
      'relationship_context_grant_missing',
    );
  }
  grants.delete(candidate.grantId);
  if (Date.parse(candidate.expiresAt) < now) {
    throw new RelationshipContextContractError(
      'relationship_context_grant_expired',
    );
  }
  return structuredClone(candidate);
}

export function clearRelationshipContextGrantsForTests(): void {
  grants.clear();
}

export function relationshipContextPolicyDiagnostic(
  env: NodeJS.ProcessEnv = process.env,
): { enabled: boolean; activeGrants: number; groups: string[] } {
  return {
    enabled: relationshipContextEnabled(env),
    activeGrants: grants.size,
    groups: Object.keys(MATRIX).sort(),
  };
}
