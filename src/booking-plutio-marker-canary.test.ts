import { describe, expect, it, vi } from 'vitest';

import {
  BOOKING_PLUTIO_MARKER_CANARY_PAYLOAD,
  runBookingPlutioMarkerCanary,
} from './booking-plutio-marker-canary.js';
import { parseBookingPlutioEvent } from './booking-plutio-host.js';

const event = parseBookingPlutioEvent(BOOKING_PLUTIO_MARKER_CANARY_PAYLOAD);
const persistedNote = JSON.stringify([
  {
    _id: 'note_1',
    title: 'Activity Log',
    descriptionHTML: `<p>stored ${event.marker}</p>`,
  },
]);

describe('runBookingPlutioMarkerCanary', () => {
  it('uses a visible text-safe marker that Plutio can preserve', () => {
    expect(event.marker).toMatch(/^\[nanoclaw-booking:[0-9a-f]{64}\]$/);
    expect(event.marker).not.toMatch(/[<>]/);
    expect(event.activityEntry).toContain(event.marker);
  });

  it('records once, reads the marker back, and replays without another write', async () => {
    const callTool = vi
      .fn()
      .mockResolvedValueOnce('{"_id":"person_1","created":true}')
      .mockResolvedValueOnce('OK []')
      .mockResolvedValueOnce('{"note_id":"note_1"}')
      .mockResolvedValueOnce(persistedNote)
      .mockResolvedValueOnce('{"_id":"person_1","created":false}')
      .mockResolvedValueOnce(persistedNote);

    const result = await runBookingPlutioMarkerCanary({ callTool });

    expect(result).toMatchObject({
      eventId: event.eventId,
      marker: event.marker,
      plutioPersonId: 'person_1',
      noteId: 'note_1',
      initialStatus: 'recorded',
      replayStatus: 'already_recorded',
      markerConfirmed: true,
      firstPassScripts: [
        'upsert-person.sh',
        'list-notes.sh',
        'log-activity.sh',
      ],
      confirmationScripts: ['list-notes.sh'],
      replayScripts: ['upsert-person.sh', 'list-notes.sh'],
    });
    expect(callTool).toHaveBeenCalledTimes(6);
  });

  it('refuses replay when the external marker cannot be read back', async () => {
    const callTool = vi
      .fn()
      .mockResolvedValueOnce('{"_id":"person_1","created":true}')
      .mockResolvedValueOnce('[]')
      .mockResolvedValueOnce('{"note_id":"note_1"}')
      .mockResolvedValueOnce('[]');

    await expect(runBookingPlutioMarkerCanary({ callTool })).rejects.toThrow(
      /read back 0 marker occurrences; replay refused/,
    );
    expect(callTool.mock.calls.map((call) => call[0])).toEqual([
      'upsert-person.sh',
      'list-notes.sh',
      'log-activity.sh',
      'list-notes.sh',
    ]);
  });

  it('refuses replay when the synthetic marker is already duplicated', async () => {
    const duplicatedNote = JSON.stringify([
      {
        _id: 'note_1',
        title: 'Activity Log',
        descriptionHTML: `<p>${event.marker}</p><p>${event.marker}</p>`,
      },
    ]);
    const callTool = vi
      .fn()
      .mockResolvedValueOnce('{"_id":"person_1","created":false}')
      .mockResolvedValueOnce(duplicatedNote)
      .mockResolvedValueOnce(duplicatedNote);

    await expect(runBookingPlutioMarkerCanary({ callTool })).rejects.toThrow(
      /read back 2 marker occurrences; replay refused/,
    );
    expect(callTool.mock.calls.map((call) => call[0])).toEqual([
      'upsert-person.sh',
      'list-notes.sh',
      'list-notes.sh',
    ]);
  });

  it('blocks the duplicate write if the marker disappears between confirmation and replay', async () => {
    const callTool = vi
      .fn()
      .mockResolvedValueOnce('{"_id":"person_1","created":true}')
      .mockResolvedValueOnce('[]')
      .mockResolvedValueOnce('{"note_id":"note_1"}')
      .mockResolvedValueOnce(persistedNote)
      .mockResolvedValueOnce('{"_id":"person_1","created":false}')
      .mockResolvedValueOnce('[]');

    await expect(runBookingPlutioMarkerCanary({ callTool })).rejects.toThrow(
      /attempted a duplicate activity write/,
    );
    expect(callTool.mock.calls.map((call) => call[0])).toEqual([
      'upsert-person.sh',
      'list-notes.sh',
      'log-activity.sh',
      'list-notes.sh',
      'upsert-person.sh',
      'list-notes.sh',
    ]);
  });
});
