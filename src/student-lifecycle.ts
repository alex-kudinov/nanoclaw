import crypto from 'crypto';

export const STUDENT_LIFECYCLE_SOURCE = 'student-lifecycle';
export const STUDENT_LIFECYCLE_SCHEMA_VERSION = 1 as const;
export const STUDENT_LIFECYCLE_WORKSPACE = 'community' as const;
export const STUDENT_LIFECYCLE_MAX_BODY_BYTES = 64 * 1024;
export const STUDENT_LIFECYCLE_MAX_SKEW_SECONDS = 300;

export const HEARTBEAT_ACTIONS = [
  'USER_JOIN',
  'USER_UPDATE',
  'EVENT_CREATE',
  'EVENT_RSVP',
  'THREAD_CREATE',
  'MENTION',
  'DIRECT_MESSAGE',
  'COURSE_COMPLETED',
  'GROUP_JOIN',
  'ABANDONED_CART',
  'DOCUMENT_CREATE',
] as const;

export type HeartbeatAction = (typeof HEARTBEAT_ACTIONS)[number];

export type LifecycleTreatment =
  | 'activation_observation'
  | 'reconciliation_request'
  | 'catalog_refresh'
  | 'rsvp_observation'
  | 'non_lifecycle'
  | 'completion_observation'
  | 'access_observation'
  | 'abandonment_observation';

export interface CommunityLifecycleRelayEnvelope {
  schema_version: 1;
  workspace: 'community';
  community_id: string;
  delivery_id: string;
  observed_at: string;
  action: { name: HeartbeatAction };
  data: Record<string, unknown>;
}

export interface PreparedCommunityLifecycleEnvelope {
  schema_version: 1;
  workspace: 'community';
  delivery_id: string;
  action: HeartbeatAction;
  treatment: LifecycleTreatment;
  source_event_key: string;
  event_name: string;
  observed_at: string;
  payload_sha256: string;
  identity_fingerprint: string | null;
  heartbeat: {
    community_id: string;
    user_id: string | null;
    group_id: string | null;
    course_id: string | null;
    cohort_id: string | null;
    lesson_id: string | null;
    invitation_id: string | null;
    event_id: string | null;
    channel_id: string | null;
    thread_id: string | null;
    chat_id: string | null;
    message_id: string | null;
    document_id: string | null;
  };
  facts: Record<string, unknown>;
}

export interface PreparedCommunityLifecycleResult {
  prepared: PreparedCommunityLifecycleEnvelope;
  transient_email: string | null;
}

export interface LifecycleProjection {
  access: 'unknown' | 'pending' | 'provisioned' | 'failed' | 'revoked';
  activation: 'unknown' | 'invited' | 'activated';
  learning:
    | 'not_started'
    | 'started'
    | 'progressing'
    | 'stalled'
    | 'resumed'
    | 'completed'
    | 'completion_unclassified';
  grading:
    | 'not_applicable'
    | 'unknown'
    | 'in_progress'
    | 'retry_required'
    | 'approved';
  feedback: 'not_applicable' | 'missing' | 'submitted';
  certificate: 'not_applicable' | 'blocked' | 'ready' | 'issued' | 'failed';
  finance:
    | 'unknown'
    | 'not_required'
    | 'pending'
    | 'paid'
    | 'refunded'
    | 'disputed';
  marketing_consent: 'unknown' | 'opted_in' | 'opted_out';
  contact_suppression: 'none' | 'marketing' | 'all_nonrequired';
}

export interface ProjectionChange {
  axis: keyof LifecycleProjection;
  previous: LifecycleProjection[keyof LifecycleProjection];
  next: LifecycleProjection[keyof LifecycleProjection];
  reason: string;
}

export class StudentLifecyclePayloadError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 422) {
    super(message);
    this.name = 'StudentLifecyclePayloadError';
    this.statusCode = statusCode;
  }
}

export class StudentLifecycleSignatureError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 401) {
    super(message);
    this.name = 'StudentLifecycleSignatureError';
    this.statusCode = statusCode;
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTION_SET = new Set<string>(HEARTBEAT_ACTIONS);

function asObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new StudentLifecyclePayloadError(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new StudentLifecyclePayloadError(`${field} is required`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new StudentLifecyclePayloadError(`${field} exceeds ${maxLength}`);
  }
  return trimmed;
}

function uuid(value: unknown, field: string): string {
  const parsed = requiredString(value, field, 64);
  if (!UUID_RE.test(parsed)) {
    throw new StudentLifecyclePayloadError(`${field} must be a UUID`);
  }
  return parsed.toLowerCase();
}

function nullableUuid(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  return uuid(value, field);
}

function uuidArray(value: unknown, field: string, maxItems = 100): string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new StudentLifecyclePayloadError(
      `${field} must be an array with at most ${maxItems} entries`,
    );
  }
  return value.map((entry, index) => uuid(entry, `${field}[${index}]`));
}

function normalizeEmail(value: unknown, field: string): string {
  const parsed = requiredString(value, field, 320).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parsed)) {
    throw new StudentLifecyclePayloadError(`${field} is invalid`);
  }
  return parsed;
}

function isoTimestamp(value: unknown, field: string): string {
  const parsed = requiredString(value, field, 80);
  const ms = Date.parse(parsed);
  if (!Number.isFinite(ms)) {
    throw new StudentLifecyclePayloadError(`${field} must be ISO-8601`);
  }
  return new Date(ms).toISOString();
}

function fingerprintEmail(email: string, secret: string): string {
  if (!secret) {
    throw new StudentLifecyclePayloadError(
      'identity fingerprint secret is unavailable',
      503,
    );
  }
  return crypto
    .createHmac('sha256', secret)
    .update(`student-lifecycle-identity-v1\0${email}`, 'utf8')
    .digest('hex');
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function eventBase(action: HeartbeatAction): {
  eventName: string;
  treatment: LifecycleTreatment;
} {
  switch (action) {
    case 'USER_JOIN':
      return {
        eventName: 'community_login_first',
        treatment: 'activation_observation',
      };
    case 'USER_UPDATE':
      return {
        eventName: 'heartbeat_user_reconciliation_requested',
        treatment: 'reconciliation_request',
      };
    case 'EVENT_CREATE':
      return {
        eventName: 'heartbeat_event_catalog_refresh_requested',
        treatment: 'catalog_refresh',
      };
    case 'EVENT_RSVP':
      return {
        eventName: 'event_rsvp_observed',
        treatment: 'rsvp_observation',
      };
    case 'THREAD_CREATE':
      return { eventName: 'thread_created', treatment: 'non_lifecycle' };
    case 'MENTION':
      return { eventName: 'mention_observed', treatment: 'non_lifecycle' };
    case 'DIRECT_MESSAGE':
      return {
        eventName: 'direct_message_observed',
        treatment: 'non_lifecycle',
      };
    case 'COURSE_COMPLETED':
      return {
        eventName: 'course_completed',
        treatment: 'completion_observation',
      };
    case 'GROUP_JOIN':
      return {
        eventName: 'learning_access_observed',
        treatment: 'access_observation',
      };
    case 'ABANDONED_CART':
      return {
        eventName: 'invitation_abandonment_observed',
        treatment: 'abandonment_observation',
      };
    case 'DOCUMENT_CREATE':
      return { eventName: 'document_created', treatment: 'non_lifecycle' };
  }
}

function emptyHeartbeatRefs(
  communityId: string,
): PreparedCommunityLifecycleEnvelope['heartbeat'] {
  return {
    community_id: communityId,
    user_id: null,
    group_id: null,
    course_id: null,
    cohort_id: null,
    lesson_id: null,
    invitation_id: null,
    event_id: null,
    channel_id: null,
    thread_id: null,
    chat_id: null,
    message_id: null,
    document_id: null,
  };
}

function sourceKey(
  action: HeartbeatAction,
  deliveryId: string,
  refs: PreparedCommunityLifecycleEnvelope['heartbeat'],
  identityFingerprint: string | null,
  payloadSha256: string,
  observedAt: string,
  facts: Record<string, unknown>,
): string {
  const prefix = 'hb:v1:community';
  switch (action) {
    case 'USER_JOIN':
      return `${prefix}:user_join:${refs.user_id}`;
    case 'GROUP_JOIN':
      return `${prefix}:group_join:${refs.group_id}:${refs.user_id}`;
    case 'COURSE_COMPLETED':
      return `${prefix}:course_completed:${refs.course_id}:${refs.user_id}`;
    case 'EVENT_CREATE':
      return `${prefix}:event_create:${refs.event_id}`;
    case 'EVENT_RSVP':
      return `${prefix}:event_rsvp:${refs.event_id}:${refs.user_id ?? identityFingerprint ?? deliveryId}`;
    case 'THREAD_CREATE':
      return `${prefix}:thread_create:${refs.channel_id}:${refs.thread_id}`;
    case 'DIRECT_MESSAGE':
      return `${prefix}:direct_message:${refs.chat_id}:${refs.message_id}`;
    case 'DOCUMENT_CREATE':
      return `${prefix}:document_create:${refs.document_id}`;
    case 'MENTION':
      return `${prefix}:mention:${refs.channel_id}:${refs.thread_id}:${refs.message_id}:${facts.mentioned_selection_sha256}`;
    case 'ABANDONED_CART': {
      const dayBucket = Math.floor(Date.parse(observedAt) / 86_400_000);
      return `${prefix}:abandoned_cart:${refs.invitation_id}:${identityFingerprint ?? deliveryId}:${payloadSha256}:${dayBucket}`;
    }
    case 'USER_UPDATE':
      return `${prefix}:${action.toLowerCase()}:delivery:${deliveryId}`;
  }
}

export function prepareCommunityLifecycleEnvelope(
  payload: unknown,
  identitySecret: string,
): PreparedCommunityLifecycleResult {
  const envelope = asObject(payload, 'payload');
  if (envelope.schema_version !== STUDENT_LIFECYCLE_SCHEMA_VERSION) {
    throw new StudentLifecyclePayloadError('unsupported schema_version');
  }
  if (envelope.workspace !== STUDENT_LIFECYCLE_WORKSPACE) {
    throw new StudentLifecyclePayloadError('workspace must be community');
  }
  const deliveryId = uuid(envelope.delivery_id, 'delivery_id');
  const communityId = uuid(envelope.community_id, 'community_id');
  const observedAt = isoTimestamp(envelope.observed_at, 'observed_at');
  const actionObject = asObject(envelope.action, 'action');
  const actionName = requiredString(actionObject.name, 'action.name', 80);
  if (!ACTION_SET.has(actionName)) {
    throw new StudentLifecyclePayloadError('unsupported Heartbeat action');
  }
  const action = actionName as HeartbeatAction;
  const data = asObject(envelope.data, 'data');
  const refs = emptyHeartbeatRefs(communityId);
  const facts: Record<string, unknown> = {};
  let transientEmail: string | null = null;
  let identityFingerprint: string | null = null;

  switch (action) {
    case 'USER_JOIN': {
      refs.user_id = uuid(data.id, 'data.id');
      transientEmail = normalizeEmail(data.email, 'data.email');
      break;
    }
    case 'USER_UPDATE':
      refs.user_id = uuid(data.id, 'data.id');
      break;
    case 'EVENT_CREATE':
      refs.event_id = uuid(data.id, 'data.id');
      break;
    case 'EVENT_RSVP': {
      refs.event_id = uuid(data.eventID, 'data.eventID');
      refs.user_id = nullableUuid(data.userID, 'data.userID');
      if (refs.user_id === null) {
        transientEmail = normalizeEmail(data.email, 'data.email');
      }
      facts.user_type = refs.user_id === null ? 'guest' : 'heartbeat_user';
      break;
    }
    case 'THREAD_CREATE':
      refs.thread_id = uuid(data.id, 'data.id');
      refs.channel_id = uuid(data.channelID, 'data.channelID');
      break;
    case 'MENTION': {
      refs.user_id = uuid(data.userID, 'data.userID');
      const source = asObject(data.source, 'data.source');
      const type = requiredString(source.type, 'data.source.type', 20);
      if (type !== 'THREAD' && type !== 'COMMENT') {
        throw new StudentLifecyclePayloadError(
          'data.source.type must be THREAD or COMMENT',
        );
      }
      refs.channel_id = uuid(source.channelID, 'data.source.channelID');
      refs.thread_id = uuid(source.threadID, 'data.source.threadID');
      refs.message_id =
        type === 'COMMENT'
          ? uuid(source.commentID, 'data.source.commentID')
          : refs.thread_id;
      const selections = data.mentionedUsers;
      if (!Array.isArray(selections) || selections.length > 100) {
        throw new StudentLifecyclePayloadError(
          'data.mentionedUsers must be a bounded array',
        );
      }
      const normalizedSelections = selections
        .map((selection, index) => {
          const item = asObject(selection, `data.mentionedUsers[${index}]`);
          const selectionType = requiredString(
            item.type,
            `data.mentionedUsers[${index}].type`,
            20,
          );
          if (selectionType !== 'USER' && selectionType !== 'GROUP') {
            throw new StudentLifecyclePayloadError(
              `data.mentionedUsers[${index}].type is unsupported`,
            );
          }
          return {
            id: uuid(item.id, `data.mentionedUsers[${index}].id`),
            type: selectionType,
          };
        })
        .sort((a, b) => `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`));
      facts.mentioned_count = normalizedSelections.length;
      facts.mentioned_selection_sha256 = sha256(
        JSON.stringify(normalizedSelections),
      );
      break;
    }
    case 'DIRECT_MESSAGE':
      refs.user_id = uuid(data.senderUserID, 'data.senderUserID');
      uuid(data.receiverUserID, 'data.receiverUserID');
      refs.chat_id = uuid(data.chatID, 'data.chatID');
      refs.message_id = uuid(data.chatMessageID, 'data.chatMessageID');
      break;
    case 'COURSE_COMPLETED':
      refs.course_id = uuid(data.courseID, 'data.courseID');
      refs.user_id = uuid(data.userID, 'data.userID');
      break;
    case 'GROUP_JOIN':
      refs.user_id = uuid(data.userID, 'data.userID');
      refs.group_id = uuid(data.groupID, 'data.groupID');
      break;
    case 'ABANDONED_CART':
      transientEmail = normalizeEmail(data.email, 'data.email');
      refs.invitation_id = uuid(data.invitationLinkID, 'data.invitationLinkID');
      facts.group_ids = uuidArray(data.groupIDs, 'data.groupIDs').sort();
      break;
    case 'DOCUMENT_CREATE':
      refs.document_id = uuid(data.id, 'data.id');
      break;
  }

  if (transientEmail !== null) {
    identityFingerprint = fingerprintEmail(transientEmail, identitySecret);
  }

  const { eventName, treatment } = eventBase(action);
  const payloadSha256 = sha256(
    JSON.stringify(
      action === 'ABANDONED_CART'
        ? {
            invitation_id: refs.invitation_id,
            identity_fingerprint: identityFingerprint,
            group_ids: facts.group_ids,
          }
        : data,
    ),
  );
  const prepared: PreparedCommunityLifecycleEnvelope = {
    schema_version: STUDENT_LIFECYCLE_SCHEMA_VERSION,
    workspace: STUDENT_LIFECYCLE_WORKSPACE,
    delivery_id: deliveryId,
    action,
    treatment,
    source_event_key: sourceKey(
      action,
      deliveryId,
      refs,
      identityFingerprint,
      payloadSha256,
      observedAt,
      facts,
    ),
    event_name: eventName,
    observed_at: observedAt,
    payload_sha256: payloadSha256,
    identity_fingerprint: identityFingerprint,
    heartbeat: refs,
    facts,
  };

  return { prepared, transient_email: transientEmail };
}

export function parsePreparedCommunityLifecycleEnvelope(
  value: unknown,
): PreparedCommunityLifecycleEnvelope {
  const stored = asObject(value, 'prepared payload');
  if (stored.schema_version !== STUDENT_LIFECYCLE_SCHEMA_VERSION) {
    throw new StudentLifecyclePayloadError(
      'unsupported prepared schema_version',
    );
  }
  if (stored.workspace !== STUDENT_LIFECYCLE_WORKSPACE) {
    throw new StudentLifecyclePayloadError(
      'prepared workspace must be community',
    );
  }
  const deliveryId = uuid(stored.delivery_id, 'delivery_id');
  const actionName = requiredString(stored.action, 'action', 80);
  if (!ACTION_SET.has(actionName)) {
    throw new StudentLifecyclePayloadError('unsupported prepared action');
  }
  const action = actionName as HeartbeatAction;
  const observedAt = isoTimestamp(stored.observed_at, 'observed_at');
  const heartbeat = asObject(stored.heartbeat, 'heartbeat');
  const refs: PreparedCommunityLifecycleEnvelope['heartbeat'] = {
    community_id: uuid(heartbeat.community_id, 'heartbeat.community_id'),
    user_id: nullableUuid(heartbeat.user_id, 'heartbeat.user_id'),
    group_id: nullableUuid(heartbeat.group_id, 'heartbeat.group_id'),
    course_id: nullableUuid(heartbeat.course_id, 'heartbeat.course_id'),
    cohort_id: nullableUuid(heartbeat.cohort_id, 'heartbeat.cohort_id'),
    lesson_id: nullableUuid(heartbeat.lesson_id, 'heartbeat.lesson_id'),
    invitation_id: nullableUuid(
      heartbeat.invitation_id,
      'heartbeat.invitation_id',
    ),
    event_id: nullableUuid(heartbeat.event_id, 'heartbeat.event_id'),
    channel_id: nullableUuid(heartbeat.channel_id, 'heartbeat.channel_id'),
    thread_id: nullableUuid(heartbeat.thread_id, 'heartbeat.thread_id'),
    chat_id: nullableUuid(heartbeat.chat_id, 'heartbeat.chat_id'),
    message_id: nullableUuid(heartbeat.message_id, 'heartbeat.message_id'),
    document_id: nullableUuid(heartbeat.document_id, 'heartbeat.document_id'),
  };
  const identityFingerprint =
    stored.identity_fingerprint === null ||
    stored.identity_fingerprint === undefined
      ? null
      : requiredString(stored.identity_fingerprint, 'identity_fingerprint', 64);
  if (
    identityFingerprint !== null &&
    !/^[0-9a-f]{64}$/.test(identityFingerprint)
  ) {
    throw new StudentLifecyclePayloadError('identity_fingerprint is invalid');
  }
  const payloadSha256 = requiredString(
    stored.payload_sha256,
    'payload_sha256',
    64,
  );
  if (!/^[0-9a-f]{64}$/.test(payloadSha256)) {
    throw new StudentLifecyclePayloadError('payload_sha256 is invalid');
  }
  const facts = asObject(stored.facts, 'facts');
  if (Buffer.byteLength(JSON.stringify(facts), 'utf8') > 8192) {
    throw new StudentLifecyclePayloadError('prepared facts exceed 8192 bytes');
  }
  const { eventName, treatment } = eventBase(action);
  if (stored.event_name !== eventName || stored.treatment !== treatment) {
    throw new StudentLifecyclePayloadError(
      'prepared event classification is inconsistent',
    );
  }
  const expectedKey = sourceKey(
    action,
    deliveryId,
    refs,
    identityFingerprint,
    payloadSha256,
    observedAt,
    facts,
  );
  if (stored.source_event_key !== expectedKey) {
    throw new StudentLifecyclePayloadError(
      'prepared source_event_key mismatch',
    );
  }
  const serialized = JSON.stringify(stored).toLowerCase();
  for (const forbidden of [
    '"email"',
    '"name"',
    '"text"',
    '"body"',
    '"content"',
    '"authorization"',
    '"cookie"',
  ]) {
    if (serialized.includes(forbidden)) {
      throw new StudentLifecyclePayloadError(
        'prepared payload contains forbidden content',
      );
    }
  }
  return {
    schema_version: STUDENT_LIFECYCLE_SCHEMA_VERSION,
    workspace: STUDENT_LIFECYCLE_WORKSPACE,
    delivery_id: deliveryId,
    action,
    treatment,
    source_event_key: expectedKey,
    event_name: eventName,
    observed_at: observedAt,
    payload_sha256: payloadSha256,
    identity_fingerprint: identityFingerprint,
    heartbeat: refs,
    facts,
  };
}

export function verifyCommunityLifecycleSignature(input: {
  rawBody: Buffer;
  timestampHeader: string | string[] | undefined;
  signatureHeader: string | string[] | undefined;
  secret: string;
  nowMs?: number;
}): void {
  if (!input.secret) {
    throw new StudentLifecycleSignatureError(
      'lifecycle relay secret is unavailable',
      503,
    );
  }
  const timestamp = Array.isArray(input.timestampHeader)
    ? input.timestampHeader[0]
    : input.timestampHeader;
  const signature = Array.isArray(input.signatureHeader)
    ? input.signatureHeader[0]
    : input.signatureHeader;
  if (!timestamp || !/^\d{10}$/.test(timestamp)) {
    throw new StudentLifecycleSignatureError('invalid webhook timestamp');
  }
  if (!signature || !/^v1=[0-9a-f]{64}$/i.test(signature)) {
    throw new StudentLifecycleSignatureError('invalid webhook signature');
  }
  const timestampMs = Number(timestamp) * 1000;
  const nowMs = input.nowMs ?? Date.now();
  if (
    !Number.isFinite(timestampMs) ||
    Math.abs(nowMs - timestampMs) > STUDENT_LIFECYCLE_MAX_SKEW_SECONDS * 1000
  ) {
    throw new StudentLifecycleSignatureError('webhook timestamp is expired');
  }
  const expected = crypto
    .createHmac('sha256', input.secret)
    .update(timestamp, 'utf8')
    .update('.', 'utf8')
    .update(input.rawBody)
    .digest();
  const supplied = Buffer.from(signature.slice(3), 'hex');
  if (
    supplied.length !== expected.length ||
    !crypto.timingSafeEqual(supplied, expected)
  ) {
    throw new StudentLifecycleSignatureError('webhook signature mismatch');
  }
}

export function defaultLifecycleProjection(): LifecycleProjection {
  return {
    access: 'unknown',
    activation: 'unknown',
    learning: 'not_started',
    grading: 'unknown',
    feedback: 'missing',
    certificate: 'blocked',
    finance: 'unknown',
    marketing_consent: 'unknown',
    contact_suppression: 'none',
  };
}

export function reduceLifecycleProjection(
  current: LifecycleProjection,
  event: PreparedCommunityLifecycleEnvelope,
): { projection: LifecycleProjection; changes: ProjectionChange[] } {
  const projection: LifecycleProjection = { ...current };
  const changes: ProjectionChange[] = [];

  const change = <K extends keyof LifecycleProjection>(
    axis: K,
    next: LifecycleProjection[K],
    reason: string,
  ) => {
    const previous = projection[axis];
    if (previous === next) return;
    projection[axis] = next;
    changes.push({ axis, previous, next, reason });
  };

  if (event.action === 'USER_JOIN') {
    change('activation', 'activated', 'heartbeat_user_join');
  } else if (event.action === 'GROUP_JOIN') {
    change('access', 'provisioned', 'heartbeat_group_join');
  } else if (event.action === 'COURSE_COMPLETED') {
    change('learning', 'completed', 'heartbeat_course_completed');
  }

  return { projection, changes };
}
