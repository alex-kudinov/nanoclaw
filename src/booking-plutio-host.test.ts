import { beforeEach, describe, expect, it, vi } from 'vitest';

import canceledFixture from './fixtures/canceled-webhook.json' with { type: 'json' };
import rescheduledFixture from './fixtures/rescheduled-webhook.json' with { type: 'json' };
import {
  bookingPlutioKind,
  bookingPlutioMarker,
  dispatchBookingPlutioOutboxRow,
  enqueueBookingPlutioActivity,
  executeBookingPlutioActivity,
  parseBookingPlutioEvent,
} from './booking-plutio-host.js';
import { extractEventKey } from './webhook-extractors.js';

describe('parseBookingPlutioEvent', () => {
  it('accepts only canceled/rescheduled archived Trafft events', () => {
    const canceled = parseBookingPlutioEvent(canceledFixture);
    const rescheduled = parseBookingPlutioEvent(rescheduledFixture);
    expect(canceled.eventType).toBe('canceled');
    expect(canceled.activityEntry).toContain('[CANCELLED]');
    expect(rescheduled.eventType).toBe('rescheduled');
    expect(rescheduled.eventId).toContain('2026-05-20 8:00 am');
    expect(rescheduled.activityEntry).toContain('[RESCHEDULED]');
    expect(() =>
      parseBookingPlutioEvent({ ...canceledFixture, event_type: 'booked' }),
    ).toThrow(/not allowed/);
  });

  it('binds the archived id and HTML-escapes provider-controlled values', () => {
    const eventId = extractEventKey('trafft', canceledFixture).event_id!;
    const event = parseBookingPlutioEvent(
      { ...canceledFixture, serviceName: '<script>alert(1)</script>' },
      eventId,
    );
    expect(event.activityEntry).not.toContain('<script>');
    expect(event.activityEntry).toContain('&lt;script&gt;');
    expect(event.marker).toBe(bookingPlutioMarker(eventId));
    expect(event.marker).toMatch(/^\[nanoclaw-booking:[0-9a-f]{64}\]$/);
    expect(event.marker).not.toMatch(/[<>]/);
    expect(event.activityEntry).toContain(event.marker);
    expect(() =>
      parseBookingPlutioEvent(canceledFixture, 'appt:other:canceled'),
    ).toThrow(/identity mismatch/);
  });
});

describe('executeBookingPlutioActivity', () => {
  const callTool = vi.fn();

  beforeEach(() => callTool.mockReset());

  it('upserts, checks the marker, and logs exactly one safe activity', async () => {
    callTool
      .mockResolvedValueOnce('{"_id":"person_1","created":false}')
      .mockResolvedValueOnce('OK []')
      .mockResolvedValueOnce(
        '{"note_id":"note_1","action":"updated","entries":2}',
      );
    const event = parseBookingPlutioEvent(canceledFixture);
    const receipt = await executeBookingPlutioActivity(event, { callTool });
    expect(receipt.remoteStatus).toBe('recorded');
    expect(callTool.mock.calls.map((call) => call[0])).toEqual([
      'upsert-person.sh',
      'list-notes.sh',
      'log-activity.sh',
    ]);
    expect(callTool.mock.calls[2][1]).toEqual([
      '--person-id',
      'person_1',
      '--entry',
      event.activityEntry,
    ]);
  });

  it('treats the remote marker as the crash-safe receipt on replay', async () => {
    const event = parseBookingPlutioEvent(rescheduledFixture);
    callTool
      .mockResolvedValueOnce('{"_id":"person_2","created":false}')
      .mockResolvedValueOnce(
        JSON.stringify([
          {
            _id: 'note_2',
            title: 'Activity Log',
            descriptionHTML: `<p>existing ${event.marker}</p>`,
          },
        ]),
      );
    const receipt = await executeBookingPlutioActivity(event, { callTool });
    expect(receipt.remoteStatus).toBe('already_recorded');
    expect(receipt.noteId).toBe('note_2');
    expect(callTool).toHaveBeenCalledTimes(2);
  });

  it('fails closed on malformed Plutio identifiers', async () => {
    callTool.mockResolvedValueOnce('{"_id":"../../unsafe"}');
    await expect(
      executeBookingPlutioActivity(parseBookingPlutioEvent(canceledFixture), {
        callTool,
      }),
    ).rejects.toThrow(/invalid id/);
    expect(callTool).toHaveBeenCalledTimes(1);
  });
});

describe('enqueueBookingPlutioActivity', () => {
  it('stores only opaque event identity and converges duplicate enqueue', async () => {
    const eventId = extractEventKey('trafft', canceledFixture).event_id!;
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: '91',
            source: 'trafft',
            event_id: eventId,
            event_type: 'canceled',
            raw_body: canceledFixture,
            party_id: '42',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: '701' }] });
    const result = await enqueueBookingPlutioActivity(91, {
      withContext: async (fn) => fn({ query } as never),
    });
    expect(result).toEqual({
      outboxId: 701,
      eventId,
      kind: bookingPlutioKind(eventId),
      duplicate: false,
    });
    const insertedPayload = JSON.parse(String(query.mock.calls[3][1][2]));
    expect(insertedPayload).toEqual({
      schema_version: 1,
      kind: bookingPlutioKind(eventId),
      webhook_inbox_id: 91,
      event_id: eventId,
    });
    expect(JSON.stringify(insertedPayload)).not.toContain(
      canceledFixture.customerEmail,
    );
  });

  it('returns the existing durable row without another insert', async () => {
    const eventId = extractEventKey('trafft', canceledFixture).event_id!;
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: '91',
            source: 'trafft',
            event_id: eventId,
            event_type: 'canceled',
            raw_body: canceledFixture,
            party_id: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: '700' }] });
    const result = await enqueueBookingPlutioActivity(91, {
      withContext: async (fn) => fn({ query } as never),
    });
    expect(result.duplicate).toBe(true);
    expect(result.outboxId).toBe(700);
    expect(query).toHaveBeenCalledTimes(4);
  });
});

describe('dispatchBookingPlutioOutboxRow', () => {
  it('reloads the archived body and records only host-derived references', async () => {
    const eventId = extractEventKey('trafft', canceledFixture).event_id!;
    const kind = bookingPlutioKind(eventId);
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: '91',
            source: 'trafft',
            event_id: eventId,
            event_type: 'canceled',
            raw_body: canceledFixture,
            party_id: '42',
          },
        ],
      })
      .mockResolvedValue({ rows: [] });
    const callTool = vi
      .fn()
      .mockResolvedValueOnce('{"_id":"person_1","created":false}')
      .mockResolvedValueOnce('[]')
      .mockResolvedValueOnce('{"note_id":"note_1"}');
    const receipt = await dispatchBookingPlutioOutboxRow(
      {
        id: 701,
        operation: 'sync',
        kind,
        party_id: 42,
        payload: {
          schema_version: 1,
          kind,
          webhook_inbox_id: 91,
          event_id: eventId,
        },
      },
      { query, callTool },
    );
    expect(receipt.remoteStatus).toBe('recorded');
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[1][1]).toEqual([42, 'person_1']);
    expect(query.mock.calls[2][1]).toEqual(['person_1', 42, '47']);
  });

  it('rejects payload fields that try to inject customer/action values', async () => {
    const eventId = extractEventKey('trafft', canceledFixture).event_id!;
    const kind = bookingPlutioKind(eventId);
    const callTool = vi.fn();
    await expect(
      dispatchBookingPlutioOutboxRow(
        {
          id: 701,
          operation: 'sync',
          kind,
          party_id: null,
          payload: {
            schema_version: 1,
            kind,
            webhook_inbox_id: 91,
            event_id: eventId,
            customer_email: 'attacker@example.com',
          },
        },
        { query: vi.fn(), callTool },
      ),
    ).rejects.toThrow(/payload keys/);
    expect(callTool).not.toHaveBeenCalled();
  });
});
