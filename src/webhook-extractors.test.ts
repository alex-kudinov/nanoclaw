import { describe, it, expect } from 'vitest';
import { extractEventKey, chaosVisitorEventId } from './webhook-extractors.js';

describe('extractEventKey — trafft', () => {
  it('booked event keys on (appointmentId, event_type)', () => {
    expect(
      extractEventKey('trafft', {
        event_type: 'booked',
        appointmentId: 44,
        customerEmail: 'jamie.maak@finvari.com',
      }),
    ).toEqual({ event_id: 'appt:44:booked', event_type: 'booked' });
  });

  it('canceled mirrors booked shape', () => {
    expect(
      extractEventKey('trafft', {
        event_type: 'canceled',
        appointmentId: '42',
      }),
    ).toEqual({ event_id: 'appt:42:canceled', event_type: 'canceled' });
  });

  it('rescheduled includes start time so each move is unique', () => {
    expect(
      extractEventKey('trafft', {
        event_type: 'rescheduled',
        appointmentId: 38,
        bookingStart: '2026-05-19T17:45:00-05:00',
      }),
    ).toEqual({
      event_id: 'appt:38:rescheduled:2026-05-19T17:45:00-05:00',
      event_type: 'rescheduled',
    });
  });

  it('status_changed keys on target status', () => {
    expect(
      extractEventKey('trafft', {
        event_type: 'status_changed',
        appointmentId: 17,
        status: 'no_show',
      }),
    ).toEqual({
      event_id: 'appt:17:status:no_show',
      event_type: 'status_changed',
    });
  });

  it('customer_created keys on customer id', () => {
    expect(
      extractEventKey('trafft', {
        event_type: 'customer_created',
        customerId: '28',
        customerEmail: 'jamie.maak@finvari.com',
      }),
    ).toEqual({ event_id: 'cust:28:created', event_type: 'customer_created' });
  });

  it('returns null event_id when appointmentId is missing', () => {
    expect(extractEventKey('trafft', { event_type: 'booked' })).toEqual({
      event_id: null,
      event_type: 'booked',
    });
  });

  it('returns NONE for non-object payload', () => {
    expect(extractEventKey('trafft', null)).toEqual({
      event_id: null,
      event_type: null,
    });
    expect(extractEventKey('trafft', 'string-body')).toEqual({
      event_id: null,
      event_type: null,
    });
  });
});

describe('extractEventKey — stripe-payment', () => {
  it('keys on (stripe_id, event_type)', () => {
    expect(
      extractEventKey('stripe-payment', {
        stripe_id: 'pi_3Q8ABC123',
        event_type: 'payment_intent.succeeded',
      }),
    ).toEqual({
      event_id: 'stripe:pi_3Q8ABC123:payment_intent.succeeded',
      event_type: 'payment_intent.succeeded',
    });
  });

  it('different event types on same stripe_id are NOT duplicates', () => {
    const a = extractEventKey('stripe-payment', {
      stripe_id: 'cs_test_123',
      event_type: 'checkout.session.completed',
    });
    const b = extractEventKey('stripe-payment', {
      stripe_id: 'cs_test_123',
      event_type: 'payment_intent.succeeded',
    });
    expect(a.event_id).not.toEqual(b.event_id);
  });

  it('returns null event_id when fields missing', () => {
    expect(extractEventKey('stripe-payment', {})).toEqual({
      event_id: null,
      event_type: null,
    });
  });
});

describe('extractEventKey — course-recap', () => {
  it('prefers transcript_note for the key', () => {
    expect(
      extractEventKey('course-recap', {
        transcript_note: 'foundations-2026-04-15-cohort-3',
        summary_file: '/x/y.md',
      }),
    ).toEqual({
      event_id: 'recap:foundations-2026-04-15-cohort-3',
      event_type: 'session-recap',
    });
  });

  it('falls back to summary_file path', () => {
    expect(
      extractEventKey('course-recap', { summary_file: '/path/to/recap.md' }),
    ).toEqual({
      event_id: 'recap:/path/to/recap.md',
      event_type: 'session-recap',
    });
  });

  it('null event_id when no identifiers', () => {
    expect(extractEventKey('course-recap', {})).toEqual({
      event_id: null,
      event_type: 'session-recap',
    });
  });
});

describe('extractEventKey — contact-form', () => {
  it('returns null event_id (no stable GF key forwarded by n8n)', () => {
    expect(
      extractEventKey('contact-form', {
        email: 'jane@example.com',
        message: 'hi',
        submitted_at: '2026-04-27T12:00:00Z',
      }),
    ).toEqual({ event_id: null, event_type: 'lead-submission' });
  });
});

describe('extractEventKey — cnpc-coaching-intake', () => {
  it('uses the stable Gravity Forms submission id', () => {
    expect(
      extractEventKey('cnpc-coaching-intake', {
        submission_id: 'gf:47:9001',
      }),
    ).toEqual({
      event_id: 'cnpc:gf:47:9001',
      event_type: 'cnpc.intake.submitted',
    });
  });

  it('fails open to archive without dedup only when n8n omits the key', () => {
    expect(extractEventKey('cnpc-coaching-intake', {})).toEqual({
      event_id: null,
      event_type: 'cnpc.intake.submitted',
    });
  });
});

describe('extractEventKey — zoom-class', () => {
  it('keys on the Zoom recording UUID inside payload.payload.object', () => {
    expect(
      extractEventKey('zoom-class', {
        event: 'recording.completed',
        payload: {
          account_id: 'lUifeHH8RtylIUQyDNiDEQ',
          object: {
            uuid: 'ogU81J1kQXOXZXC+I6Uzgw==',
            id: 9459738533,
            host_email: 'cherie@tandemcoach.co',
          },
        },
      }),
    ).toEqual({
      event_id: 'recording:ogU81J1kQXOXZXC+I6Uzgw==',
      event_type: 'recording.completed',
    });
  });

  it('falls back to event=recording.completed when not provided', () => {
    expect(
      extractEventKey('zoom-class', {
        payload: { object: { uuid: 'abc==' } },
      }),
    ).toEqual({
      event_id: 'recording:abc==',
      event_type: 'recording.completed',
    });
  });

  it('returns null event_id when uuid is missing', () => {
    expect(extractEventKey('zoom-class', { payload: { object: {} } })).toEqual({
      event_id: null,
      event_type: 'recording.completed',
    });
  });
});

describe('extractEventKey — chaos', () => {
  it('keys on visitor_id with form_contact event type', () => {
    expect(
      extractEventKey('chaos', {
        visitor_id: 412,
        form_event_type: 'form_contact',
        email: 'lead@example.com',
      }),
    ).toEqual({
      event_id: 'chaos:visitor:412:verified',
      event_type: 'form_contact',
    });
  });

  it('carries form_lead_magnet event type', () => {
    expect(
      extractEventKey('chaos', {
        visitor_id: 7,
        form_event_type: 'form_lead_magnet',
      }),
    ).toEqual({
      event_id: 'chaos:visitor:7:verified',
      event_type: 'form_lead_magnet',
    });
  });

  it('carries form_newsletter event type', () => {
    expect(
      extractEventKey('chaos', {
        visitor_id: 99,
        form_event_type: 'form_newsletter',
      }),
    ).toEqual({
      event_id: 'chaos:visitor:99:verified',
      event_type: 'form_newsletter',
    });
  });

  it('defaults event_type to verified when form_event_type is null', () => {
    expect(
      extractEventKey('chaos', { visitor_id: 5, form_event_type: null }),
    ).toEqual({ event_id: 'chaos:visitor:5:verified', event_type: 'verified' });
  });

  it('coerces an unrecognized form_event_type to verified', () => {
    expect(
      extractEventKey('chaos', { visitor_id: 5, form_event_type: 'form_junk' }),
    ).toEqual({ event_id: 'chaos:visitor:5:verified', event_type: 'verified' });
  });

  it('returns null event_id for a missing/invalid visitor_id', () => {
    expect(
      extractEventKey('chaos', { form_event_type: 'form_contact' }),
    ).toEqual({ event_id: null, event_type: 'form_contact' });
    expect(extractEventKey('chaos', { visitor_id: 0 }).event_id).toBeNull();
    expect(extractEventKey('chaos', { visitor_id: -3 }).event_id).toBeNull();
    expect(extractEventKey('chaos', { visitor_id: 'abc' }).event_id).toBeNull();
  });

  it('push and sweep paths produce a byte-identical event_id', () => {
    expect(chaosVisitorEventId(123)).toEqual(chaosVisitorEventId('123'));
    expect(chaosVisitorEventId(123)).toBe('chaos:visitor:123:verified');
  });
});

describe('extractEventKey — unknown sources', () => {
  it('returns NONE for unregistered source ids', () => {
    expect(extractEventKey('something-not-registered', { foo: 'bar' })).toEqual(
      { event_id: null, event_type: null },
    );
  });
});
