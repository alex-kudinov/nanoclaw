/*
 * Forward a booked Trafft appointment to the Chaos tracker so the booking is
 * attached to the on-site visitor who made it.
 *
 * The booking link on tandemcoach.co is decorated with cid=<chaos fingerprint>;
 * page JS writes that cid into a hidden Trafft custom field, so it rides through
 * the webhook as a `cid` custom field. Here we pull it out and call the Chaos
 * `record-external-event` toolbox tool, which resolves the fingerprint to a
 * visitor and records a `call_booked` event (carrying the full booking payload)
 * plus a conversion row.
 *
 * Convention: Chaos is reached through the toolbox tool (mirrors
 * chaos-reconciler.ts), not an inline HTTP call. Every failure mode is
 * non-fatal — booking persistence must never depend on Chaos being reachable.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink } from 'fs/promises';
import os from 'os';
import path from 'path';

import type { BookedInput } from './booking-host-write.js';
import { isInternalCustomField } from './trafft-custom-fields.js';

const execFileAsync = promisify(execFile);

const TOOLBOX_DIR =
  process.env.TOOLBOX_DIR || path.join(process.env.HOME || '', 'dev/toolbox');
const CHAOS_RECORD_TOOL = path.join(
  TOOLBOX_DIR,
  'shared/chaos/tools/chaos/record-external-event.sh',
);

export type ChaosBookingStatus =
  | 'recorded'
  | 'skipped'
  | 'visitor_not_found'
  | 'duplicate'
  | 'degraded';

export interface ChaosBookingResult {
  status: ChaosBookingStatus;
  reason?: string;
  visitor_id?: number;
}

/** Pull the cid (Chaos fingerprint) out of the booking's custom fields. */
export function extractCid(
  booking: Pick<BookedInput, 'customFields'>,
): string | undefined {
  // The cid rides through Trafft as the internal "Tandem Customer ID" (or bare
  // "cid") custom field — the same labels classifyCustomFields suppresses from
  // operator-facing notices. Single source of truth: trafft-custom-fields.ts.
  const field = booking.customFields.find((cf) => isInternalCustomField(cf.label));
  const value = field?.value?.trim();
  // Trafft renders an empty hidden field as "/"; treat that as no cid.
  return value && value !== '/' ? value : undefined;
}

/** Shape the booking detail stored as the Chaos event's data_json. */
export function buildChaosData(
  booking: BookedInput,
  partyId?: string | number,
): Record<string, unknown> {
  const customerName =
    booking.customerFullName ||
    [booking.customerFirstName, booking.customerLastName]
      .filter(Boolean)
      .join(' ') ||
    undefined;

  // Omit undefined keys so the stored payload stays clean.
  const data: Record<string, unknown> = {
    appointment_id: booking.appointmentId,
    service: booking.serviceName,
    start_time: booking.startDateTime,
    customer_email: booking.customerEmail,
    custom_fields: booking.customFields,
  };
  if (booking.employeeName) data.employee = booking.employeeName;
  if (booking.status) data.status = booking.status;
  if (customerName) data.customer_name = customerName;
  if (booking.customerPhone) data.customer_phone = booking.customerPhone;
  if (partyId) data.party_id = partyId;
  return data;
}

/**
 * Record a booked appointment against its Chaos visitor. No-ops (returns
 * `skipped`) when the booking carries no cid. Never throws — all errors are
 * mapped to a `degraded` result for the caller to log.
 */
export async function recordChaosBooking(
  booking: BookedInput,
  partyId?: string | number,
): Promise<ChaosBookingResult> {
  const cid = extractCid(booking);
  if (!cid) return { status: 'skipped', reason: 'no_cid' };

  const data = buildChaosData(booking, partyId);
  const tmp = path.join(
    os.tmpdir(),
    `chaos-booking-${booking.appointmentId || 'x'}-${process.pid}.json`,
  );

  try {
    await writeFile(tmp, JSON.stringify(data), 'utf-8');
    const env = { ...process.env, TOOLBOX_LIB: path.join(TOOLBOX_DIR, 'lib') };
    const { stdout } = await execFileAsync(
      CHAOS_RECORD_TOOL,
      ['--fingerprint', cid, '--event-type', 'call_booked', '--data-file', tmp],
      { env, timeout: 30_000, maxBuffer: 4 * 1024 * 1024 },
    );

    const trimmed = stdout.trim();
    const start = trimmed.search(/[[{]/);
    if (start < 0) {
      return {
        status: 'degraded',
        reason: trimmed.slice(0, 200) || 'no output',
      };
    }
    const parsed = JSON.parse(trimmed.slice(start)) as Record<string, unknown>;
    if (parsed.degraded) {
      return { status: 'degraded', reason: String(parsed.error ?? 'unknown') };
    }

    const visitor_id =
      typeof parsed.visitor_id === 'number' ? parsed.visitor_id : undefined;
    const status = String(parsed.status ?? '');
    if (status === 'visitor_not_found') {
      return { status: 'visitor_not_found' };
    }
    if (status === 'duplicate') {
      return { status: 'duplicate', visitor_id };
    }
    return { status: 'recorded', visitor_id };
  } catch (err) {
    return {
      status: 'degraded',
      reason: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await unlink(tmp).catch(() => {});
  }
}
