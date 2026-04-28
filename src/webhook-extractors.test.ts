import { describe, it, expect } from 'vitest';
import { extractEventKey } from './webhook-extractors.js';

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

describe('extractEventKey — unknown sources', () => {
  it('returns NONE for unregistered source ids', () => {
    expect(extractEventKey('zoom-class', { foo: 'bar' })).toEqual({
      event_id: null,
      event_type: null,
    });
  });
});
