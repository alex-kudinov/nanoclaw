import crypto from 'crypto';
import { describe, expect, it } from 'vitest';

import {
  HEARTBEAT_ACTIONS,
  STUDENT_LIFECYCLE_MAX_BODY_BYTES,
  StudentLifecyclePayloadError,
  StudentLifecycleSignatureError,
  defaultLifecycleProjection,
  prepareCommunityLifecycleEnvelope,
  parsePreparedCommunityLifecycleEnvelope,
  reduceLifecycleProjection,
  verifyCommunityLifecycleSignature,
} from './student-lifecycle.js';

const IDS = {
  delivery: '11111111-1111-4111-8111-111111111111',
  user: '22222222-2222-4222-8222-222222222222',
  user2: '33333333-3333-4333-8333-333333333333',
  group: '44444444-4444-4444-8444-444444444444',
  course: '55555555-5555-4555-8555-555555555555',
  event: '66666666-6666-4666-8666-666666666666',
  channel: '77777777-7777-4777-8777-777777777777',
  thread: '88888888-8888-4888-8888-888888888888',
  chat: '99999999-9999-4999-8999-999999999999',
  message: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  document: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  invitation: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
};

const SECRET = 'test-only-student-lifecycle-secret';

function envelope(action: string, data: Record<string, unknown>) {
  return {
    schema_version: 1,
    workspace: 'community',
    community_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    delivery_id: IDS.delivery,
    observed_at: '2026-08-24T15:00:00.000Z',
    action: { name: action },
    data,
  };
}

const FIXTURES: Record<string, Record<string, unknown>> = {
  USER_JOIN: { id: IDS.user, name: 'Student Name', email: 'USER@example.com' },
  USER_UPDATE: { id: IDS.user },
  EVENT_CREATE: { id: IDS.event },
  EVENT_RSVP: {
    eventID: IDS.event,
    email: 'user@example.com',
    userID: IDS.user,
  },
  THREAD_CREATE: { id: IDS.thread, channelID: IDS.channel },
  MENTION: {
    mentionedUsers: [{ id: IDS.user2, type: 'USER' }],
    userID: IDS.user,
    source: { type: 'THREAD', channelID: IDS.channel, threadID: IDS.thread },
  },
  DIRECT_MESSAGE: {
    senderUserID: IDS.user,
    receiverUserID: IDS.user2,
    chatID: IDS.chat,
    chatMessageID: IDS.message,
  },
  COURSE_COMPLETED: {
    courseID: IDS.course,
    courseName: 'Course Name',
    userID: IDS.user,
  },
  GROUP_JOIN: { userID: IDS.user, groupID: IDS.group },
  ABANDONED_CART: {
    email: 'user@example.com',
    invitationLinkID: IDS.invitation,
    groupIDs: [IDS.group],
  },
  DOCUMENT_CREATE: { id: IDS.document },
};

describe('Community student lifecycle contract', () => {
  it.each(HEARTBEAT_ACTIONS)('parses and minimizes %s', (action) => {
    const result = prepareCommunityLifecycleEnvelope(
      envelope(action, FIXTURES[action]),
      SECRET,
    );
    expect(result.prepared.action).toBe(action);
    expect(result.prepared.workspace).toBe('community');
    expect(result.prepared.source_event_key).toContain('hb:v1:community');
    const serialized = JSON.stringify(result.prepared);
    expect(serialized).not.toContain('Student Name');
    expect(serialized).not.toContain('USER@example.com');
    expect(serialized).not.toContain('user@example.com');
  });

  it('never persists direct-message or thread content', () => {
    for (const action of ['DIRECT_MESSAGE', 'THREAD_CREATE', 'MENTION']) {
      const result = prepareCommunityLifecycleEnvelope(
        envelope(action, {
          ...FIXTURES[action],
          text: 'private message content',
          body: 'private thread content',
        }),
        SECRET,
      );
      expect(JSON.stringify(result.prepared)).not.toContain('private');
    }
  });

  it.each(['circle', 'Circle', 'community-circle', '', null])(
    'rejects non-Community workspace %j',
    (workspace) => {
      expect(() =>
        prepareCommunityLifecycleEnvelope(
          { ...envelope('USER_UPDATE', FIXTURES.USER_UPDATE), workspace },
          SECRET,
        ),
      ).toThrow('workspace must be community');
    },
  );

  it('rejects unknown actions and malformed required fields', () => {
    expect(() =>
      prepareCommunityLifecycleEnvelope(
        envelope('LESSON_COMPLETED', { id: IDS.user }),
        SECRET,
      ),
    ).toThrow('unsupported Heartbeat action');
    expect(() =>
      prepareCommunityLifecycleEnvelope(
        envelope('GROUP_JOIN', { userID: IDS.user, groupID: 'not-a-uuid' }),
        SECRET,
      ),
    ).toThrow('data.groupID must be a UUID');
  });

  it('uses stable business keys where Heartbeat supplies stable identity', () => {
    for (const action of ['USER_JOIN', 'GROUP_JOIN', 'COURSE_COMPLETED']) {
      const first = prepareCommunityLifecycleEnvelope(
        envelope(action, FIXTURES[action]),
        SECRET,
      ).prepared.source_event_key;
      const second = prepareCommunityLifecycleEnvelope(
        {
          ...envelope(action, FIXTURES[action]),
          delivery_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        },
        SECRET,
      ).prepared.source_event_key;
      expect(second).toBe(first);
    }
  });

  it('uses delivery identity for update-like facts without a provider event ID', () => {
    const first = prepareCommunityLifecycleEnvelope(
      envelope('USER_UPDATE', FIXTURES.USER_UPDATE),
      SECRET,
    ).prepared.source_event_key;
    const second = prepareCommunityLifecycleEnvelope(
      {
        ...envelope('USER_UPDATE', FIXTURES.USER_UPDATE),
        delivery_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      },
      SECRET,
    ).prepared.source_event_key;
    expect(second).not.toBe(first);
  });

  it.each(['MENTION', 'ABANDONED_CART'])(
    'deduplicates same-window %s redelivery independently of relay delivery ID',
    (action) => {
      const first = prepareCommunityLifecycleEnvelope(
        envelope(action, FIXTURES[action]),
        SECRET,
      ).prepared.source_event_key;
      const second = prepareCommunityLifecycleEnvelope(
        {
          ...envelope(action, FIXTURES[action]),
          delivery_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          observed_at: '2026-08-24T23:59:00.000Z',
        },
        SECRET,
      ).prepared.source_event_key;
      expect(second).toBe(first);
    },
  );

  it('opens a new abandonment window on the next UTC day', () => {
    const first = prepareCommunityLifecycleEnvelope(
      envelope('ABANDONED_CART', FIXTURES.ABANDONED_CART),
      SECRET,
    ).prepared.source_event_key;
    const nextDay = prepareCommunityLifecycleEnvelope(
      {
        ...envelope('ABANDONED_CART', FIXTURES.ABANDONED_CART),
        delivery_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        observed_at: '2026-08-25T15:00:00.000Z',
      },
      SECRET,
    ).prepared.source_event_key;
    expect(nextDay).not.toBe(first);
  });

  it('canonicalizes mention selections and abandoned groups before keying', () => {
    const mentionData = {
      ...FIXTURES.MENTION,
      mentionedUsers: [
        { id: IDS.user2, type: 'USER' },
        { id: IDS.group, type: 'GROUP' },
      ],
    };
    const firstMention = prepareCommunityLifecycleEnvelope(
      envelope('MENTION', mentionData),
      SECRET,
    ).prepared.source_event_key;
    const reversedMention = prepareCommunityLifecycleEnvelope(
      {
        ...envelope('MENTION', {
          ...mentionData,
          mentionedUsers: [...mentionData.mentionedUsers].reverse(),
        }),
        delivery_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      },
      SECRET,
    ).prepared.source_event_key;
    expect(reversedMention).toBe(firstMention);

    const firstAbandoned = prepareCommunityLifecycleEnvelope(
      envelope('ABANDONED_CART', {
        ...FIXTURES.ABANDONED_CART,
        groupIDs: [IDS.group, IDS.course],
      }),
      SECRET,
    ).prepared.source_event_key;
    const reversedAbandoned = prepareCommunityLifecycleEnvelope(
      {
        ...envelope('ABANDONED_CART', {
          ...FIXTURES.ABANDONED_CART,
          groupIDs: [IDS.course, IDS.group],
        }),
        delivery_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      },
      SECRET,
    ).prepared.source_event_key;
    expect(reversedAbandoned).toBe(firstAbandoned);
  });

  it('fingerprints email and keeps it transient only', () => {
    const result = prepareCommunityLifecycleEnvelope(
      envelope('USER_JOIN', FIXTURES.USER_JOIN),
      SECRET,
    );
    expect(result.transient_email).toBe('user@example.com');
    expect(result.prepared.identity_fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(result.prepared)).not.toContain('user@example.com');
  });

  it('accepts the privacy-minimized USER_JOIN fields emitted by the relay', () => {
    const result = prepareCommunityLifecycleEnvelope(
      envelope('USER_JOIN', { id: IDS.user, email: 'USER@example.com' }),
      SECRET,
    );
    expect(result.transient_email).toBe('user@example.com');
    expect(result.prepared.heartbeat.user_id).toBe(IDS.user);
    expect(JSON.stringify(result.prepared)).not.toContain('USER@example.com');
  });

  it('accepts the privacy-minimized COURSE_COMPLETED fields emitted by the relay', () => {
    const result = prepareCommunityLifecycleEnvelope(
      envelope('COURSE_COMPLETED', {
        courseID: IDS.course,
        userID: IDS.user,
      }),
      SECRET,
    );
    expect(result.prepared.action).toBe('COURSE_COMPLETED');
    expect(result.prepared.heartbeat.course_id).toBe(IDS.course);
    expect(result.prepared.heartbeat.user_id).toBe(IDS.user);
  });

  it('revalidates a minimized prepared envelope for replay', () => {
    const prepared = prepareCommunityLifecycleEnvelope(
      envelope('GROUP_JOIN', FIXTURES.GROUP_JOIN),
      SECRET,
    ).prepared;
    expect(parsePreparedCommunityLifecycleEnvelope(prepared)).toEqual(prepared);
    expect(() =>
      parsePreparedCommunityLifecycleEnvelope({
        ...prepared,
        facts: { email: 'student@example.com' },
      }),
    ).toThrow('forbidden content');
  });
});

describe('Community lifecycle HMAC', () => {
  function signed(rawBody: Buffer, timestamp = '1787583600') {
    const digest = crypto
      .createHmac('sha256', SECRET)
      .update(timestamp)
      .update('.')
      .update(rawBody)
      .digest('hex');
    return { timestamp, signature: `v1=${digest}` };
  }

  it('accepts an exact current body signature', () => {
    const rawBody = Buffer.from('{"ok":true}');
    const { timestamp, signature } = signed(rawBody);
    expect(() =>
      verifyCommunityLifecycleSignature({
        rawBody,
        timestampHeader: timestamp,
        signatureHeader: signature,
        secret: SECRET,
        nowMs: Number(timestamp) * 1000,
      }),
    ).not.toThrow();
  });

  it.each([
    ['missing timestamp', undefined, 'v1=' + '0'.repeat(64), SECRET],
    ['bad signature shape', '1787583600', 'nope', SECRET],
    ['missing secret', '1787583600', 'v1=' + '0'.repeat(64), ''],
  ])('rejects %s', (_name, timestamp, signature, secret) => {
    expect(() =>
      verifyCommunityLifecycleSignature({
        rawBody: Buffer.from('{}'),
        timestampHeader: timestamp,
        signatureHeader: signature,
        secret,
        nowMs: 1787583600 * 1000,
      }),
    ).toThrow(StudentLifecycleSignatureError);
  });

  it('rejects body mutation and expired timestamps', () => {
    const original = Buffer.from('{"ok":true}');
    const { timestamp, signature } = signed(original);
    expect(() =>
      verifyCommunityLifecycleSignature({
        rawBody: Buffer.from('{"ok":false}'),
        timestampHeader: timestamp,
        signatureHeader: signature,
        secret: SECRET,
        nowMs: Number(timestamp) * 1000,
      }),
    ).toThrow('webhook signature mismatch');
    expect(() =>
      verifyCommunityLifecycleSignature({
        rawBody: original,
        timestampHeader: timestamp,
        signatureHeader: signature,
        secret: SECRET,
        nowMs: (Number(timestamp) + 301) * 1000,
      }),
    ).toThrow('webhook timestamp is expired');
  });

  it('declares a bounded request ceiling', () => {
    expect(STUDENT_LIFECYCLE_MAX_BODY_BYTES).toBe(65_536);
  });
});

describe('independent lifecycle axes', () => {
  it('changes only activation for USER_JOIN', () => {
    const current = defaultLifecycleProjection();
    const event = prepareCommunityLifecycleEnvelope(
      envelope('USER_JOIN', FIXTURES.USER_JOIN),
      SECRET,
    ).prepared;
    const result = reduceLifecycleProjection(current, event);
    expect(result.changes).toEqual([
      {
        axis: 'activation',
        previous: 'unknown',
        next: 'activated',
        reason: 'heartbeat_user_join',
      },
    ]);
    expect(result.projection.finance).toBe('unknown');
    expect(result.projection.certificate).toBe('blocked');
  });

  it('changes only access for GROUP_JOIN', () => {
    const event = prepareCommunityLifecycleEnvelope(
      envelope('GROUP_JOIN', FIXTURES.GROUP_JOIN),
      SECRET,
    ).prepared;
    const result = reduceLifecycleProjection(
      defaultLifecycleProjection(),
      event,
    );
    expect(result.changes.map((change) => change.axis)).toEqual(['access']);
    expect(result.projection.access).toBe('provisioned');
  });

  it('completion does not imply grading, certificate, finance, or consent', () => {
    const event = prepareCommunityLifecycleEnvelope(
      envelope('COURSE_COMPLETED', FIXTURES.COURSE_COMPLETED),
      SECRET,
    ).prepared;
    const result = reduceLifecycleProjection(
      defaultLifecycleProjection(),
      event,
    );
    expect(result.changes.map((change) => change.axis)).toEqual(['learning']);
    expect(result.projection.learning).toBe('completed');
    expect(result.projection.grading).toBe('unknown');
    expect(result.projection.certificate).toBe('blocked');
    expect(result.projection.finance).toBe('unknown');
    expect(result.projection.marketing_consent).toBe('unknown');
  });

  it('leaves non-lifecycle actions unchanged', () => {
    const event = prepareCommunityLifecycleEnvelope(
      envelope('DOCUMENT_CREATE', FIXTURES.DOCUMENT_CREATE),
      SECRET,
    ).prepared;
    const current = defaultLifecycleProjection();
    expect(reduceLifecycleProjection(current, event)).toEqual({
      projection: current,
      changes: [],
    });
  });
});
