import {
  executeBookingPlutioActivity,
  parseBookingPlutioEvent,
  type BookingPlutioReceipt,
} from './booking-plutio-host.js';
import { callPlutioTool, stripToJson } from './plutio-cli.js';

type ToolCaller = (
  script: string,
  args: string[],
  timeoutMs?: number,
) => Promise<string>;

export const BOOKING_PLUTIO_MARKER_CANARY_PAYLOAD = Object.freeze({
  event_type: 'rescheduled',
  appointmentId: 'nanoclaw-marker-canary-v1',
  customerEmail: 'nanoclaw-booking-marker-canary@example.invalid',
  customerFirstName: 'NanoClaw',
  customerLastName: 'Marker Canary',
  serviceName: 'NanoClaw Booking Boundary Canary',
  appointmentStartDateTime: '2026-08-16T00:00:00Z',
});

export interface BookingPlutioMarkerCanaryResult {
  eventId: string;
  marker: string;
  plutioPersonId: string;
  noteId: string | null;
  initialStatus: BookingPlutioReceipt['remoteStatus'];
  replayStatus: 'already_recorded';
  markerConfirmed: true;
  firstPassScripts: string[];
  confirmationScripts: string[];
  replayScripts: string[];
}

function parseNotes(raw: string): Record<string, unknown>[] {
  const parsed = JSON.parse(stripToJson(raw)) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(
      'Booking Plutio marker canary note lookup was not an array',
    );
  }
  return parsed.filter(
    (value): value is Record<string, unknown> =>
      Boolean(value) && typeof value === 'object' && !Array.isArray(value),
  );
}

function markerOccurrenceCount(
  notes: Record<string, unknown>[],
  marker: string,
): number {
  return notes.reduce((count, note) => {
    if (
      note.title !== 'Activity Log' ||
      typeof note.descriptionHTML !== 'string'
    ) {
      return count;
    }
    return count + note.descriptionHTML.split(marker).length - 1;
  }, 0);
}

/**
 * Perform one stable synthetic Plutio marker canary.
 *
 * The explicit confirmation read happens before replay. Replay additionally
 * refuses log-activity at the injected caller, so a failed marker check cannot
 * create a second activity while diagnosing the boundary.
 */
export async function runBookingPlutioMarkerCanary(deps?: {
  callTool?: ToolCaller;
}): Promise<BookingPlutioMarkerCanaryResult> {
  const realCallTool = deps?.callTool ?? callPlutioTool;
  const event = parseBookingPlutioEvent(BOOKING_PLUTIO_MARKER_CANARY_PAYLOAD);

  const firstPassScripts: string[] = [];
  const first = await executeBookingPlutioActivity(event, {
    callTool: async (script, args, timeoutMs) => {
      firstPassScripts.push(script);
      return realCallTool(script, args, timeoutMs);
    },
  });

  const confirmationScripts: string[] = [];
  const confirmationRaw = await realCallTool('list-notes.sh', [
    '--entity-type',
    'person',
    '--entity-id',
    first.plutioPersonId,
    '--search',
    '^Activity Log$',
    '--limit',
    '1',
  ]);
  confirmationScripts.push('list-notes.sh');
  const markerCount = markerOccurrenceCount(
    parseNotes(confirmationRaw),
    event.marker,
  );
  if (markerCount !== 1) {
    throw new Error(
      `Booking Plutio marker canary read back ${markerCount} marker occurrences; replay refused`,
    );
  }

  const replayScripts: string[] = [];
  const replay = await executeBookingPlutioActivity(event, {
    callTool: async (script, args, timeoutMs) => {
      replayScripts.push(script);
      if (script === 'log-activity.sh') {
        throw new Error(
          'Booking Plutio marker canary replay attempted a duplicate activity write',
        );
      }
      return realCallTool(script, args, timeoutMs);
    },
  });
  if (replay.remoteStatus !== 'already_recorded') {
    throw new Error(
      `Booking Plutio marker canary replay returned ${replay.remoteStatus}`,
    );
  }

  return {
    eventId: event.eventId,
    marker: event.marker,
    plutioPersonId: first.plutioPersonId,
    noteId: replay.noteId ?? first.noteId,
    initialStatus: first.remoteStatus,
    replayStatus: replay.remoteStatus,
    markerConfirmed: true,
    firstPassScripts,
    confirmationScripts,
    replayScripts,
  };
}
