import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./logger.js', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const resolveTrafftCustomer = vi.fn(async (..._args: unknown[]) => 4242);
vi.mock('./identity-join.js', () => ({
  resolveTrafftCustomer: (...args: unknown[]) => resolveTrafftCustomer(...args),
}));

// fn_log_interaction_dedup is idempotent on (source_provider, source_id).
// The fake mirrors that: same appointmentId → same interaction id.
const dedupStore = new Map<string, number>();
let nextId = 9000;
let queryImpl: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }>;
vi.mock('./business-db.js', () => ({
  withAgentContext: async (
    _agent: string,
    fn: (client: { query: typeof queryImpl }) => Promise<unknown>,
  ) =>
    fn({ query: (sql: string, params: unknown[]) => queryImpl(sql, params) }),
}));

import {
  parseBookedPayload,
  bookingHostWrite,
  BookedPayloadError,
} from './booking-host-write.js';
import bookedFixture from './fixtures/booked-webhook.json' with { type: 'json' };

beforeEach(() => {
  resolveTrafftCustomer.mockClear();
  dedupStore.clear();
  nextId = 9000;
  queryImpl = async (_sql, params) => {
    const apptId = String(params[7]);
    if (!dedupStore.has(apptId)) dedupStore.set(apptId, nextId++);
    return { rows: [{ id: String(dedupStore.get(apptId)) }] };
  };
});

describe('parseBookedPayload', () => {
  it('parses the real redacted booked fixture', () => {
    const input = parseBookedPayload(bookedFixture);
    expect(input.event_type).toBe('booked');
    expect(input.event_id).toBe('appt:66:booked');
    expect(input.appointmentId).toBe('66');
    expect(input.customerEmail).toBe('jordan.rivera@example.com');
    expect(input.serviceName).toBe('Mentor Coaching');
    expect(input.startDateTime).toBe('2026-05-19 8:00 am');
    expect(input.customerFullName).toBe('Jordan Rivera');
    // Mentor Coaching has no booking form → no custom fields.
    expect(input.customFields).toEqual([]);
  });

  it('parses appointment custom fields (reason + source) when present', () => {
    const input = parseBookedPayload({
      ...bookedFixture,
      serviceName: 'Consultation Call',
      'customFields[0][label]': 'What would you like to discuss?',
      'customFields[0][value]': 'PCC Exam Review',
      'customFields[1][label]': 'How did you learn about Tandem?',
      'customFields[1][value]': 'Agile community',
    });
    expect(input.customFields).toEqual([
      { label: 'What would you like to discuss?', value: 'PCC Exam Review' },
      { label: 'How did you learn about Tandem?', value: 'Agile community' },
    ]);
  });

  it('throws BookedPayloadError on a missing appointmentId', () => {
    const bad = { ...bookedFixture } as Record<string, unknown>;
    delete bad.appointmentId;
    expect(() => parseBookedPayload(bad)).toThrow(BookedPayloadError);
  });

  it('throws BookedPayloadError on a non-booked event', () => {
    expect(() =>
      parseBookedPayload({ ...bookedFixture, event_type: 'canceled' }),
    ).toThrow(BookedPayloadError);
  });
});

describe('bookingHostWrite', () => {
  it('resolves the party and writes the interaction row', async () => {
    const input = parseBookedPayload(bookedFixture);
    const r = await bookingHostWrite(input);
    expect(resolveTrafftCustomer).toHaveBeenCalledTimes(1);
    expect(r.party_id).toBe(4242);
    expect(r.interaction_id).toBeGreaterThan(0);
    expect(r.booking_row_id).toBe(r.interaction_id);
  });

  it('stores parsed custom_fields in the interaction metadata', async () => {
    const input = parseBookedPayload({
      ...bookedFixture,
      serviceName: 'Consultation Call',
      'customFields[0][label]': 'What would you like to discuss?',
      'customFields[0][value]': 'PCC Exam Review',
    });
    let captured: Record<string, unknown> | undefined;
    queryImpl = async (_sql, params) => {
      captured = JSON.parse(String(params[5])) as Record<string, unknown>;
      return { rows: [{ id: '9001' }] };
    };
    await bookingHostWrite(input);
    expect(captured?.custom_fields).toEqual([
      { label: 'What would you like to discuss?', value: 'PCC Exam Review' },
    ]);
  });

  it('is idempotent — a replayed event re-resolves the same ids', async () => {
    const input = parseBookedPayload(bookedFixture);
    const first = await bookingHostWrite(input);
    const second = await bookingHostWrite(input);
    expect(second.interaction_id).toBe(first.interaction_id);
    expect(second.party_id).toBe(first.party_id);
    expect(dedupStore.size).toBe(1); // no duplicate row for the same appointment
  });

  it('retries once on a transient serialization failure', async () => {
    const input = parseBookedPayload(bookedFixture);
    let calls = 0;
    queryImpl = async (_sql, params) => {
      calls++;
      if (calls === 1) {
        const e = new Error('serialization failure') as Error & {
          code: string;
        };
        e.code = '40001';
        throw e;
      }
      return { rows: [{ id: '9999' }] };
    };
    const r = await bookingHostWrite(input);
    expect(calls).toBe(2);
    expect(r.interaction_id).toBe(9999);
  });

  it('does not retry a constraint error', async () => {
    const input = parseBookedPayload(bookedFixture);
    let calls = 0;
    queryImpl = async () => {
      calls++;
      const e = new Error('constraint violation') as Error & { code: string };
      e.code = '23505';
      throw e;
    };
    await expect(bookingHostWrite(input)).rejects.toThrow();
    expect(calls).toBe(1);
  });
});
