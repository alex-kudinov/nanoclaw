import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  stdout: 'OK {"status":"ok","visitor_id":42}',
  err: null as Error | null,
}));

vi.mock('child_process', () => ({
  execFile: (
    _f: string,
    _a: string[],
    _o: unknown,
    cb: (e: unknown, v: unknown) => void,
  ) => cb(h.err, { stdout: h.stdout, stderr: '' }),
}));

import {
  extractCid,
  buildChaosData,
  recordChaosBooking,
} from './chaos-booking.js';
import type { BookedInput } from './booking-host-write.js';

function makeBooking(overrides: Partial<BookedInput> = {}): BookedInput {
  return {
    event_type: 'booked',
    event_id: 'appt:99:booked',
    appointmentId: '99',
    customerEmail: 'jane@example.com',
    customerFirstName: 'Jane',
    customerLastName: 'Doe',
    serviceName: 'Consultation Call',
    employeeName: 'Cherie Silas',
    status: 'Approved',
    startDateTime: '2026-06-20 15:00:00',
    customFields: [{ label: 'cid', value: 'fp_abc123' }],
    rawPayload: {},
    ...overrides,
  };
}

beforeEach(() => {
  h.stdout = 'OK {"status":"ok","visitor_id":42}';
  h.err = null;
});

describe('extractCid', () => {
  it('finds the cid field case-insensitively and trims it', () => {
    expect(
      extractCid({ customFields: [{ label: 'CID', value: ' fp9 ' }] }),
    ).toBe('fp9');
  });
  it('returns undefined when no cid field is present', () => {
    expect(
      extractCid({ customFields: [{ label: 'reason', value: 'x' }] }),
    ).toBeUndefined();
  });
  it('returns undefined when the cid value is blank', () => {
    expect(
      extractCid({ customFields: [{ label: 'cid', value: '   ' }] }),
    ).toBeUndefined();
  });
});

describe('buildChaosData', () => {
  it('shapes the booking payload and includes party_id', () => {
    const d = buildChaosData(makeBooking(), 'party-7');
    expect(d).toMatchObject({
      appointment_id: '99',
      service: 'Consultation Call',
      start_time: '2026-06-20 15:00:00',
      customer_email: 'jane@example.com',
      employee: 'Cherie Silas',
      status: 'Approved',
      customer_name: 'Jane Doe',
      party_id: 'party-7',
    });
    expect(d.custom_fields).toEqual([{ label: 'cid', value: 'fp_abc123' }]);
  });
  it('omits undefined optional fields', () => {
    const d = buildChaosData(
      makeBooking({
        employeeName: undefined,
        status: undefined,
        customerPhone: undefined,
        customerFullName: undefined,
        customerFirstName: undefined,
        customerLastName: undefined,
      }),
    );
    expect('employee' in d).toBe(false);
    expect('status' in d).toBe(false);
    expect('customer_name' in d).toBe(false);
    expect('party_id' in d).toBe(false);
  });
});

describe('recordChaosBooking', () => {
  it('skips when the booking has no cid', async () => {
    const r = await recordChaosBooking(makeBooking({ customFields: [] }));
    expect(r).toEqual({ status: 'skipped', reason: 'no_cid' });
  });
  it('returns recorded with visitor_id on an ok response', async () => {
    h.stdout = 'OK {"status":"ok","visitor_id":42}';
    expect(await recordChaosBooking(makeBooking())).toEqual({
      status: 'recorded',
      visitor_id: 42,
    });
  });
  it('maps visitor_not_found', async () => {
    h.stdout = 'OK {"status":"visitor_not_found"}';
    expect((await recordChaosBooking(makeBooking())).status).toBe(
      'visitor_not_found',
    );
  });
  it('maps duplicate', async () => {
    h.stdout = 'OK {"status":"duplicate","visitor_id":7}';
    expect(await recordChaosBooking(makeBooking())).toEqual({
      status: 'duplicate',
      visitor_id: 7,
    });
  });
  it('maps a degraded response', async () => {
    h.stdout = 'OK {"degraded":true,"error":"Chaos HTTP 500"}';
    const r = await recordChaosBooking(makeBooking());
    expect(r.status).toBe('degraded');
    expect(r.reason).toContain('500');
  });
  it('returns degraded when the tool throws', async () => {
    h.err = new Error('spawn ENOENT');
    const r = await recordChaosBooking(makeBooking());
    expect(r.status).toBe('degraded');
    expect(r.reason).toContain('ENOENT');
  });
});
