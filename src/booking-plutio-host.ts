import crypto from 'node:crypto';

import type { PoolClient, QueryResult, QueryResultRow } from 'pg';

import { withAgentContext, query } from './business-db.js';
import { callPlutioTool, stripToJson } from './plutio-cli.js';
import { extractEventKey } from './webhook-extractors.js';

export const BOOKING_PLUTIO_KIND_PREFIX = 'booking_activity:';
const BOOKING_PLUTIO_SCHEMA_VERSION = 1;
const PLUTIO_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type BookingPlutioEventType = 'canceled' | 'rescheduled';

export interface BookingPlutioEvent {
  eventId: string;
  eventType: BookingPlutioEventType;
  appointmentId: string;
  customerEmail: string;
  customerFirstName: string;
  customerLastName: string;
  customerPhone?: string;
  serviceName: string;
  startDateTime: string;
  marker: string;
  activityEntry: string;
}

export interface BookingPlutioReceipt {
  eventId: string;
  marker: string;
  plutioPersonId: string;
  noteId: string | null;
  remoteStatus: 'recorded' | 'already_recorded';
}

export interface BookingPlutioEnqueueResult {
  outboxId: number;
  eventId: string;
  kind: string;
  duplicate: boolean;
}

export interface BookingPlutioOutboxRow {
  id: number;
  operation: string;
  kind: string;
  party_id: number | null;
  payload: Record<string, unknown>;
}

type QueryFn = <T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: unknown[],
) => Promise<QueryResult<T>>;

type ToolCaller = (
  script: string,
  args: string[],
  timeoutMs?: number,
) => Promise<string>;

interface ArchivedBookingRow {
  id: string;
  source: string;
  event_id: string | null;
  event_type: string | null;
  raw_body: Record<string, unknown>;
  party_id: string | null;
}

interface BookingOutboxPayload {
  schema_version: 1;
  kind: string;
  webhook_inbox_id: number;
  event_id: string;
}

function requiredString(
  value: unknown,
  field: string,
  maxLength = 500,
): string {
  const text =
    typeof value === 'string' || typeof value === 'number'
      ? String(value).trim()
      : '';
  if (!text) throw new Error(`booking plutio event missing ${field}`);
  if (text.length > maxLength) {
    throw new Error(`booking plutio event ${field} exceeds ${maxLength}`);
  }
  return text;
}

function optionalString(value: unknown, maxLength = 500): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const text = String(value).trim();
  if (!text) return undefined;
  if (text.length > maxLength) {
    throw new Error(`booking plutio optional value exceeds ${maxLength}`);
  }
  return text;
}

function htmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function splitName(payload: Record<string, unknown>): {
  first: string;
  last: string;
} {
  const explicitFirst = optionalString(payload.customerFirstName, 200);
  const explicitLast = optionalString(payload.customerLastName, 200);
  if (explicitFirst) {
    return { first: explicitFirst, last: explicitLast ?? '' };
  }
  const full = optionalString(payload.customerFullName, 300) ?? 'Unknown';
  const parts = full.split(/\s+/);
  return {
    first: parts[0] || 'Unknown',
    last: parts.slice(1).join(' '),
  };
}

export function bookingPlutioMarker(eventId: string): string {
  const digest = crypto.createHash('sha256').update(eventId).digest('hex');
  // Plutio sanitizes HTML comments from descriptionHTML. Keep the receipt
  // visible and text-only so the exact bytes survive the remote round trip.
  return `[nanoclaw-booking:${digest}]`;
}

export function bookingPlutioKind(eventId: string): string {
  const digest = crypto.createHash('sha256').update(eventId).digest('hex');
  return `${BOOKING_PLUTIO_KIND_PREFIX}${digest}`;
}

/**
 * Convert one archived Trafft lifecycle event into the only values that the
 * host may send to Plutio. The caller-supplied event id is checked against the
 * host extractor; payload prose is never treated as an instruction.
 */
export function parseBookingPlutioEvent(
  payload: unknown,
  expectedEventId?: string,
): BookingPlutioEvent {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('booking plutio event payload must be an object');
  }
  const raw = payload as Record<string, unknown>;
  const key = extractEventKey('trafft', raw);
  if (
    (key.event_type !== 'canceled' && key.event_type !== 'rescheduled') ||
    !key.event_id
  ) {
    throw new Error(
      `booking plutio event type is not allowed: ${String(key.event_type)}`,
    );
  }
  if (expectedEventId && key.event_id !== expectedEventId) {
    throw new Error('booking plutio archived event identity mismatch');
  }

  const appointmentId = requiredString(raw.appointmentId, 'appointmentId', 128);
  const customerEmail = requiredString(raw.customerEmail, 'customerEmail', 320);
  if (!EMAIL_RE.test(customerEmail)) {
    throw new Error('booking plutio event customerEmail is invalid');
  }
  const serviceName = requiredString(raw.serviceName, 'serviceName', 300);
  const startDateTime = requiredString(
    raw.bookingStart ??
      raw.appointmentStart ??
      raw.start_date_time ??
      raw.appointmentStartDateTime,
    'appointmentStartDateTime',
    160,
  );
  const { first, last } = splitName(raw);
  const marker = bookingPlutioMarker(key.event_id);
  const label = key.event_type === 'canceled' ? '[CANCELLED]' : '[RESCHEDULED]';
  const connector = key.event_type === 'canceled' ? 'on' : 'to';
  const activityEntry = `${label} ${htmlEscape(serviceName)} ${connector} ${htmlEscape(startDateTime)} ${marker}`;

  return {
    eventId: key.event_id,
    eventType: key.event_type,
    appointmentId,
    customerEmail,
    customerFirstName: first,
    customerLastName: last,
    customerPhone: optionalString(raw.customerPhone, 80),
    serviceName,
    startDateTime,
    marker,
    activityEntry,
  };
}

function parseObject(raw: string, label: string): Record<string, unknown> {
  const parsed = JSON.parse(stripToJson(raw)) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`booking plutio ${label} returned an invalid object`);
  }
  return parsed as Record<string, unknown>;
}

function parseArray(raw: string, label: string): Record<string, unknown>[] {
  const parsed = JSON.parse(stripToJson(raw)) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`booking plutio ${label} returned an invalid array`);
  }
  return parsed.filter(
    (value): value is Record<string, unknown> =>
      Boolean(value) && typeof value === 'object' && !Array.isArray(value),
  );
}

function validatedPlutioId(value: unknown, label: string): string {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!PLUTIO_ID_RE.test(id)) {
    throw new Error(`booking plutio ${label} returned an invalid id`);
  }
  return id;
}

/** Execute one already-validated lifecycle activity through host-owned tools. */
export async function executeBookingPlutioActivity(
  event: BookingPlutioEvent,
  deps?: { callTool?: ToolCaller },
): Promise<BookingPlutioReceipt> {
  const callTool = deps?.callTool ?? callPlutioTool;
  const personArgs = [
    '--email',
    event.customerEmail,
    '--first',
    event.customerFirstName,
  ];
  if (event.customerLastName) personArgs.push('--last', event.customerLastName);
  if (event.customerPhone) personArgs.push('--phone', event.customerPhone);
  const person = parseObject(
    await callTool('upsert-person.sh', personArgs),
    'person upsert',
  );
  const plutioPersonId = validatedPlutioId(person._id, 'person upsert');

  const notes = parseArray(
    await callTool('list-notes.sh', [
      '--entity-type',
      'person',
      '--entity-id',
      plutioPersonId,
      '--search',
      '^Activity Log$',
      '--limit',
      '1',
    ]),
    'note lookup',
  );
  const existing = notes.find(
    (note) =>
      note.title === 'Activity Log' &&
      typeof note.descriptionHTML === 'string' &&
      note.descriptionHTML.includes(event.marker),
  );
  if (existing) {
    const noteId =
      typeof existing._id === 'string' && PLUTIO_ID_RE.test(existing._id)
        ? existing._id
        : null;
    return {
      eventId: event.eventId,
      marker: event.marker,
      plutioPersonId,
      noteId,
      remoteStatus: 'already_recorded',
    };
  }

  const logged = parseObject(
    await callTool('log-activity.sh', [
      '--person-id',
      plutioPersonId,
      '--entry',
      event.activityEntry,
    ]),
    'activity write',
  );
  const noteId = validatedPlutioId(logged.note_id, 'activity write');
  return {
    eventId: event.eventId,
    marker: event.marker,
    plutioPersonId,
    noteId,
    remoteStatus: 'recorded',
  };
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
}

function parseOutboxPayload(value: unknown): BookingOutboxPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('booking plutio outbox payload must be an object');
  }
  const payload = value as Record<string, unknown>;
  const expected = ['event_id', 'kind', 'schema_version', 'webhook_inbox_id'];
  const keys = Object.keys(payload).sort();
  if (
    keys.length !== expected.length ||
    keys.some((key, index) => key !== expected[index])
  ) {
    throw new Error('booking plutio outbox payload keys are invalid');
  }
  if (payload.schema_version !== BOOKING_PLUTIO_SCHEMA_VERSION) {
    throw new Error('booking plutio outbox schema version is invalid');
  }
  const webhookInboxId = Number(payload.webhook_inbox_id);
  assertPositiveInteger(webhookInboxId, 'webhook_inbox_id');
  const eventId = requiredString(payload.event_id, 'event_id', 300);
  const kind = requiredString(payload.kind, 'kind', 128);
  if (kind !== bookingPlutioKind(eventId)) {
    throw new Error('booking plutio outbox kind does not match event');
  }
  return {
    schema_version: BOOKING_PLUTIO_SCHEMA_VERSION,
    kind,
    webhook_inbox_id: webhookInboxId,
    event_id: eventId,
  };
}

async function enqueueWithClient(
  client: Pick<PoolClient, 'query'>,
  webhookInboxId: number,
): Promise<BookingPlutioEnqueueResult> {
  const archived = await client.query<ArchivedBookingRow>(
    `SELECT id::text, source, event_id, event_type, raw_body,
            party_id::text
       FROM business_v2.webhook_inbox
      WHERE id = $1
      FOR UPDATE`,
    [webhookInboxId],
  );
  const row = archived.rows[0];
  if (!row || row.source !== 'trafft' || !row.event_id) {
    throw new Error('booking plutio archived Trafft event not found');
  }
  const event = parseBookingPlutioEvent(row.raw_body, row.event_id);
  if (row.event_type !== event.eventType) {
    throw new Error('booking plutio archived event type mismatch');
  }
  const kind = bookingPlutioKind(event.eventId);
  let partyId = row.party_id ? Number(row.party_id) : null;
  if (!partyId) {
    const party = await client.query<{ id: string | null }>(
      `SELECT business_v2.best_party_by_email($1::citext)::text AS id`,
      [event.customerEmail],
    );
    partyId = Number(party.rows[0]?.id || 0) || null;
  }
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `booking-plutio:${event.eventId}`,
  ]);
  const existing = await client.query<{ id: string }>(
    `SELECT id::text
       FROM business_v2.plutio_outbox
      WHERE operation = 'sync'
        AND kind = $1
        AND payload->>'event_id' = $2
      ORDER BY id ASC
      LIMIT 1`,
    [kind, event.eventId],
  );
  if (existing.rows[0]) {
    return {
      outboxId: Number(existing.rows[0].id),
      eventId: event.eventId,
      kind,
      duplicate: true,
    };
  }
  const payload: BookingOutboxPayload = {
    schema_version: BOOKING_PLUTIO_SCHEMA_VERSION,
    kind,
    webhook_inbox_id: webhookInboxId,
    event_id: event.eventId,
  };
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO business_v2.plutio_outbox
       (operation, kind, party_id, payload, last_updated_by)
     VALUES ('sync', $1, $2, $3::jsonb, 'booking-plutio-host')
     RETURNING id::text`,
    [kind, partyId, JSON.stringify(payload)],
  );
  return {
    outboxId: Number(inserted.rows[0].id),
    eventId: event.eventId,
    kind,
    duplicate: false,
  };
}

/** Persist one opaque action. NC-20260816-011 does not wire this into ingress. */
export async function enqueueBookingPlutioActivity(
  webhookInboxId: number,
  deps?: {
    withContext?: <T>(
      fn: (client: Pick<PoolClient, 'query'>) => Promise<T>,
    ) => Promise<T>;
  },
): Promise<BookingPlutioEnqueueResult> {
  assertPositiveInteger(webhookInboxId, 'webhook_inbox_id');
  if (deps?.withContext) {
    return deps.withContext((client) =>
      enqueueWithClient(client, webhookInboxId),
    );
  }
  return withAgentContext('booking-plutio-host', (client) =>
    enqueueWithClient(client, webhookInboxId),
  );
}

export function isBookingPlutioOutboxRow(
  row: Pick<BookingPlutioOutboxRow, 'operation' | 'kind'>,
): boolean {
  return (
    row.operation === 'sync' && row.kind.startsWith(BOOKING_PLUTIO_KIND_PREFIX)
  );
}

/** Dispatch a durable outbox row using only its archived event reference. */
export async function dispatchBookingPlutioOutboxRow(
  row: BookingPlutioOutboxRow,
  deps?: { query?: QueryFn; callTool?: ToolCaller },
): Promise<BookingPlutioReceipt> {
  if (!isBookingPlutioOutboxRow(row)) {
    throw new Error('not a Booking Plutio outbox row');
  }
  const payload = parseOutboxPayload(row.payload);
  if (payload.kind !== row.kind) {
    throw new Error('booking plutio row kind mismatch');
  }
  const queryFn = deps?.query ?? query;
  const archived = await queryFn<ArchivedBookingRow>(
    `SELECT id::text, source, event_id, event_type, raw_body,
            party_id::text
       FROM business_v2.webhook_inbox
      WHERE id = $1`,
    [payload.webhook_inbox_id],
  );
  const archivedRow = archived.rows[0];
  if (
    !archivedRow ||
    archivedRow.source !== 'trafft' ||
    archivedRow.event_id !== payload.event_id
  ) {
    throw new Error('booking plutio archived event identity mismatch');
  }
  const event = parseBookingPlutioEvent(archivedRow.raw_body, payload.event_id);
  if (archivedRow.event_type !== event.eventType) {
    throw new Error('booking plutio archived event type mismatch');
  }
  let partyId = row.party_id ?? (Number(archivedRow.party_id || 0) || null);
  if (!partyId) {
    const party = await queryFn<{ id: string | null }>(
      `SELECT business_v2.best_party_by_email($1::citext)::text AS id`,
      [event.customerEmail],
    );
    partyId = Number(party.rows[0]?.id || 0) || null;
  }
  const receipt = await executeBookingPlutioActivity(event, {
    callTool: deps?.callTool,
  });

  if (partyId) {
    await queryFn(
      `INSERT INTO business_v2.plutio_refs
         (entity_type, entity_id, plutio_entity_type, plutio_id, last_pushed_at)
       VALUES ('party', $1, 'party', $2, NOW())
       ON CONFLICT (entity_type, entity_id) DO UPDATE
         SET plutio_id = EXCLUDED.plutio_id,
             last_pushed_at = NOW()`,
      [partyId, receipt.plutioPersonId],
    );
    await queryFn(
      `UPDATE business_v2.interactions
          SET metadata = metadata || jsonb_build_object('plutio_person_id', $1),
              updated_at = NOW(),
              last_updated_by = 'booking-plutio-host'
        WHERE party_id = $2
          AND channel = 'booking'
          AND source_provider = 'trafft'
          AND metadata->>'trafft_appointment_id' = $3`,
      [receipt.plutioPersonId, partyId, event.appointmentId],
    );
  }
  return receipt;
}
