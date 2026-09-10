/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';

import {
  HeartbeatProjectionDriver,
  StudentRosterProjectionDriver,
  type HeartbeatProjectionUser,
  type ProjectionPreimageStore,
  type StudentRosterApi,
} from './student-enrollment-provider-drivers.js';
import {
  buildHeartbeatProjection,
  buildStudentRosterProjection,
  ProjectionAcceptanceUncertainError,
} from './student-enrollment-projection.js';

const subject = {
  offerKey: 'supervision-inaugural' as const,
  offerVersion: 1,
  fundingStatus: 'settled' as const,
  payerRelationship: 'self_purchase_explicit' as const,
  sourceAdmissionAuthenticated: true,
  openBlockingExceptions: 0,
  enrollmentKey: 'enrollment:pilot',
  enrollmentVersion: 0,
  assignmentKey: 'assignment:pilot',
  assignmentVersion: 0,
  participantKey: 'party:42',
  participantEmail: 'Student@Example.com',
  participantName: 'Student Name',
  deliveryBlockKey: 'supervision:2026-10-07',
  deliveryStartsAt: '2026-10-07T14:00:00.000Z',
  courseAccessGroupKey: 'fa5f5f09-a10e-4dfd-8bf2-0451f7cffa83',
  deliveryMarkerGroupKey: '11111111-1111-4111-8111-111111111111',
};

class MemoryPreimages implements ProjectionPreimageStore {
  records = new Map<string, any>();
  async get(key: string) {
    return this.records.get(key) ?? null;
  }
  async put(record: any) {
    this.records.set(record.idempotencyKey, structuredClone(record));
  }
}

function rosterApi() {
  const column = (letters: string) =>
    [...letters].reduce(
      (value, letter) => value * 26 + letter.charCodeAt(0) - 64,
      0,
    ) - 1;
  const header = [
    'Email',
    'Name',
    'Coaching Supervision Mastery',
    'Refunded',
    'Joined',
    'Company OS Projection Key',
    'Company OS Projection Version',
    'Company OS Enrollment Key',
    'Company OS Assignment Key',
    'Company OS Participant Key',
    'Company OS Offer',
    'Company OS Delivery Block',
    'Company OS Delivery Starts At',
  ];
  const rows = [
    header,
    ['student@example.com', '', '', '', '', '', '', '', '', '', '', '', ''],
  ];
  const api: StudentRosterApi = {
    read: vi.fn(async (range) => {
      if (range.endsWith('A1:M1')) return [[...rows[0]]];
      if (range.endsWith('A2:M')) return rows.slice(1).map((row) => [...row]);
      const match = range.match(/A(\d+):M\d+$/);
      return match ? [[...(rows[Number(match[1]) - 1] ?? [])]] : [];
    }),
    update: vi.fn(async (range, values) => {
      const match = range.match(/!([A-Z]+)(\d+)(?::([A-Z]+)\d+)?$/);
      if (!match) throw new Error('bad range');
      const row = Number(match[2]) - 1;
      const start = column(match[1]);
      rows[row] ??= [];
      values[0].forEach((value: string, index: number) => {
        rows[row][start + index] = value;
      });
    }),
    append: vi.fn(async (_range, values) => {
      rows.push([...values[0]]);
      return { updatedRange: `CSS!A${rows.length}:M${rows.length}` };
    }),
    clear: vi.fn(async (range) => {
      const match = range.match(/A(\d+):M\d+$/);
      if (match) rows[Number(match[1]) - 1] = [];
    }),
  };
  return { api, rows };
}

describe('production Student Roster projection driver', () => {
  it('captures A:M, writes only the exact participant row, reads back, and restores', async () => {
    const { api, rows } = rosterApi();
    const preimages = new MemoryPreimages();
    const driver = new StudentRosterProjectionDriver(api, preimages);
    const envelope = buildStudentRosterProjection(
      subject,
      'student-roster:1796552584:css',
    );
    const applied = await driver.apply(envelope);
    expect(rows[1]).toEqual([
      'student@example.com',
      'Student Name',
      '2026-10-07',
      '',
      '',
      envelope.idempotencyKey,
      '0',
      'enrollment:pilot',
      'assignment:pilot',
      'party:42',
      'supervision-inaugural',
      'supervision:2026-10-07',
      '2026-10-07T14:00:00.000Z',
    ]);
    expect(await driver.readback(envelope)).toEqual(envelope.expectedReadback);
    expect(vi.mocked(api.update).mock.calls.map(([range]) => range)).toEqual([
      'CSS!B2:C2',
      'CSS!F2:M2',
    ]);
    expect(
      await driver.findByIdempotencyKey(
        envelope.idempotencyKey,
        envelope.destinationKey,
      ),
    ).toEqual(applied);
    await driver.rollback(envelope, applied.operationId);
    expect(vi.mocked(api.update).mock.calls.map(([range]) => range)).toEqual([
      'CSS!B2:C2',
      'CSS!F2:M2',
      'CSS!B2:C2',
      'CSS!F2:M2',
    ]);
    expect(rows[1]).toEqual([
      'student@example.com',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ]);
  });

  it('turns an ambiguous write response into a non-retryable acceptance hold', async () => {
    const { api } = rosterApi();
    vi.mocked(api.update).mockRejectedValueOnce(new Error('socket closed'));
    const driver = new StudentRosterProjectionDriver(
      api,
      new MemoryPreimages(),
    );
    await expect(
      driver.apply(
        buildStudentRosterProjection(subject, 'student-roster:1796552584:css'),
      ),
    ).rejects.toBeInstanceOf(ProjectionAcceptanceUncertainError);
  });

  it('never rewrites a real existing name or untouched A/D/E cells', async () => {
    const { api, rows } = rosterApi();
    rows[1][1] = 'Existing Name';
    rows[1][3] = 'refund-state';
    rows[1][4] = 'joined-state';
    const driver = new StudentRosterProjectionDriver(
      api,
      new MemoryPreimages(),
    );
    const envelope = buildStudentRosterProjection(
      subject,
      'student-roster:1796552584:css',
    );
    await driver.apply(envelope);
    expect(vi.mocked(api.update).mock.calls.map(([range]) => range)).toEqual([
      'CSS!C2',
      'CSS!F2:M2',
    ]);
    expect(rows[1].slice(0, 5)).toEqual([
      'student@example.com',
      'Existing Name',
      '2026-10-07',
      'refund-state',
      'joined-state',
    ]);
  });

  it('persists or re-discovers an appended row before receipt-owned rollback', async () => {
    const { api, rows } = rosterApi();
    rows.splice(1, 1);
    const preimages = new MemoryPreimages();
    let writes = 0;
    const originalPut = preimages.put.bind(preimages);
    preimages.put = async (record: any) => {
      writes += 1;
      if (writes === 3) throw new Error('crash before applied checkpoint');
      await originalPut(record);
    };
    const driver = new StudentRosterProjectionDriver(api, preimages);
    const envelope = buildStudentRosterProjection(
      subject,
      'student-roster:1796552584:css',
    );
    await expect(driver.apply(envelope)).rejects.toBeInstanceOf(
      ProjectionAcceptanceUncertainError,
    );
    const checkpoint = preimages.records.get(envelope.idempotencyKey);
    expect(checkpoint).toMatchObject({
      state: 'prepared',
      before: { row: 2, appended: true },
    });
    preimages.put = originalPut;
    await driver.rollback(envelope, checkpoint.operationId);
    expect(rows[1]).toEqual([]);

    const second = rosterApi();
    second.rows.splice(1, 1);
    const secondPreimages = new MemoryPreimages();
    const append = second.api.append.bind(second.api);
    vi.mocked(second.api.append).mockImplementationOnce(async (...args) => {
      await append(...args);
      throw new Error('response lost after accepted append');
    });
    const secondDriver = new StudentRosterProjectionDriver(
      second.api,
      secondPreimages,
    );
    await expect(secondDriver.apply(envelope)).rejects.toBeInstanceOf(
      ProjectionAcceptanceUncertainError,
    );
    const uncertain = secondPreimages.records.get(envelope.idempotencyKey);
    expect(uncertain.before.row).toBeNull();
    await secondDriver.rollback(envelope, uncertain.operationId);
    expect(second.rows[1]).toEqual([]);
  });
});

describe('production Heartbeat projection driver', () => {
  it('adds only missing exact memberships and removes only receipt-owned effects', async () => {
    let user: HeartbeatProjectionUser = {
      id: '22222222-2222-4222-8222-222222222222',
      email: 'student@example.com',
      groupIds: [subject.courseAccessGroupKey, 'sibling-group'],
    };
    const api = {
      findExactUser: vi.fn(async () => structuredClone(user)),
      addMembership: vi.fn(async (groupId: string) => {
        if (!user.groupIds.includes(groupId)) user.groupIds.push(groupId);
      }),
      removeMembership: vi.fn(async (groupId: string) => {
        user.groupIds = user.groupIds.filter((id) => id !== groupId);
      }),
    };
    const driver = new HeartbeatProjectionDriver(api, new MemoryPreimages());
    const envelope = buildHeartbeatProjection(
      subject,
      `heartbeat:main:${subject.courseAccessGroupKey}:${subject.deliveryMarkerGroupKey}`,
    );
    const applied = await driver.apply(envelope);
    expect(api.addMembership).toHaveBeenCalledExactlyOnceWith(
      subject.deliveryMarkerGroupKey,
      'student@example.com',
    );
    expect(await driver.readback(envelope)).toEqual(envelope.expectedReadback);
    await driver.rollback(envelope, applied.operationId);
    expect(user.groupIds).toEqual([
      subject.courseAccessGroupKey,
      'sibling-group',
    ]);
    expect(api.removeMembership).toHaveBeenCalledExactlyOnceWith(
      subject.deliveryMarkerGroupKey,
      'student@example.com',
    );
  });
});
