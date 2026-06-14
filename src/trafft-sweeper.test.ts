/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';

vi.mock('./business-db.js', () => ({
  query: vi.fn(),
  withAgentContext: vi.fn(async (_role: string, fn: any) =>
    fn({ query: vi.fn() }),
  ),
}));
vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('./identity-join.js', () => ({
  resolveTrafftCustomer: vi.fn(),
}));
vi.mock('./config.js', () => ({ DATA_DIR: '/tmp/nc-test' }));

import {
  apptEventId,
  custEventId,
  buildApptRawBody,
  buildCustRawBody,
  withRetry,
  describeExecError,
} from './trafft-sweeper.js';

const noSleep = async () => {};

describe('event_id construction matches Phase 2 extractor format', () => {
  it('apptEventId for booked', () => {
    expect(apptEventId({ id: 44 } as any)).toBe('appt:44:booked');
  });

  it('custEventId for created', () => {
    expect(custEventId({ id: 28 } as any)).toBe('cust:28:created');
  });
});

describe('buildApptRawBody', () => {
  it('flattens appointment + first booking customer', () => {
    const body = buildApptRawBody({
      id: 44,
      status: 'approved',
      start_date_time: '2026-05-01T11:30:00-05:00',
      created_at: '2026-04-23T05:21:03+00:00',
      service: { name: 'Consultation Call' },
      bookings: [
        {
          customer: {
            id: 28,
            first_name: 'Jamie',
            last_name: 'Maak',
            email: 'jamie.maak@finvari.com',
          },
        },
      ],
    } as any);
    expect(body).toMatchObject({
      event_type: 'booked',
      appointmentId: '44',
      appointmentStatus: 'approved',
      customerId: '28',
      customerEmail: 'jamie.maak@finvari.com',
      customerFirstName: 'Jamie',
      customerLastName: 'Maak',
      _synthetic: true,
    });
  });

  it('maps employee + customer full name and phone', () => {
    const body = buildApptRawBody(
      {
        id: 70,
        status: 'approved',
        start_date_time: '2026-05-19T09:30:00-05:00',
        created_at: '2026-05-16T04:00:00+00:00',
        service: { name: 'Consultation Call' },
        employees: [{ id: 5, first_name: 'Cherie', last_name: 'Silas' }],
        bookings: [
          {
            customer: {
              id: 46,
              first_name: 'Angelo',
              last_name: 'Argentieri',
              email: 'angelo@akasearchgroup.com',
            },
          },
        ],
      } as any,
      '+17164325422',
    );
    expect(body).toMatchObject({
      employeeFirstName: 'Cherie',
      employeeLastName: 'Silas',
      employeeFullName: 'Cherie Silas',
      customerFullName: 'Angelo Argentieri',
      customerPhone: '+17164325422',
    });
  });

  it('omits employee + phone when absent', () => {
    const body = buildApptRawBody({
      id: 71,
      status: 'approved',
      start_date_time: '2026-05-19T09:30:00-05:00',
      created_at: '2026-05-16T04:00:00+00:00',
      bookings: [{ customer: { id: 1, first_name: 'A', last_name: 'B' } }],
    } as any);
    expect(body.employeeFullName).toBeUndefined();
    expect(body.customerPhone).toBeUndefined();
  });

  it('handles missing customer gracefully', () => {
    const body = buildApptRawBody({
      id: 99,
      status: 'approved',
      start_date_time: '2026-05-01T11:30:00-05:00',
      created_at: '2026-04-23T05:21:03+00:00',
    } as any);
    expect(body.appointmentId).toBe('99');
    expect(body.customerId).toBeUndefined();
    expect(body.customerEmail).toBeUndefined();
  });
});

describe('buildCustRawBody', () => {
  it('preserves Trafft customer fields under expected keys', () => {
    const body = buildCustRawBody({
      id: 28,
      first_name: 'Jamie',
      last_name: 'Maak',
      email: 'jamie.maak@finvari.com',
    });
    expect(body).toEqual({
      event_type: 'customer_created',
      customerId: '28',
      customerEmail: 'jamie.maak@finvari.com',
      customerFirstName: 'Jamie',
      customerLastName: 'Maak',
      _synthetic: true,
    });
  });
});

describe('withRetry', () => {
  it('returns immediately on first success without retrying', async () => {
    const fn = vi.fn(async () => 'ok');
    const result = await withRetry(fn, { label: 't', sleepFn: noSleep });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries a transient failure and succeeds (one blip does not abort)', async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls === 1) throw new Error('HTTP 502: transient');
      return 'recovered';
    });
    const result = await withRetry(fn, { label: 't', sleepFn: noSleep });
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('exhausts all attempts then throws the last error (persistent failure)', async () => {
    const fn = vi.fn(async () => {
      throw new Error('HTTP 500: persistent');
    });
    await expect(
      withRetry(fn, { label: 't', maxRetries: 2, sleepFn: noSleep }),
    ).rejects.toThrow('HTTP 500: persistent');
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('applies exponential backoff between attempts', async () => {
    const delays: number[] = [];
    const sleepFn = async (ms: number) => {
      delays.push(ms);
    };
    const fn = vi.fn(async () => {
      throw new Error('boom');
    });
    await expect(
      withRetry(fn, { label: 't', maxRetries: 3, baseMs: 1000, sleepFn }),
    ).rejects.toThrow('boom');
    expect(delays).toEqual([1000, 2000, 4000]);
  });
});

describe('describeExecError', () => {
  it('surfaces the tool stderr instead of the opaque "Command failed"', () => {
    const execErr = Object.assign(new Error('Command failed: list-customers.sh'), {
      stderr: 'ERR API_ERROR HTTP 502: bad gateway\n',
      stdout: '',
    });
    const out = describeExecError(execErr, 'list-customers.sh --page 2');
    expect(out.message).toBe(
      'trafft list-customers.sh --page 2: ERR API_ERROR HTTP 502: bad gateway',
    );
  });

  it('falls back to stdout when stderr is empty', () => {
    const execErr = Object.assign(new Error('Command failed'), {
      stderr: '',
      stdout: 'ERR VALIDATION bad page\n',
    });
    const out = describeExecError(execErr, 'list-appointments.sh');
    expect(out.message).toBe('trafft list-appointments.sh: ERR VALIDATION bad page');
  });

  it('flags timeouts via the killed signal', () => {
    const execErr = Object.assign(new Error('Command failed'), { killed: true });
    const out = describeExecError(execErr, 'list-customers.sh --page 1');
    expect(out.message).toContain('(timed out)');
  });

  it('falls back to the error message when no streams are present', () => {
    const out = describeExecError(new Error('ENOENT'), 'missing.sh');
    expect(out.message).toBe('trafft missing.sh: ENOENT');
  });
});
