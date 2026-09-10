import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  ProjectionAcceptanceUncertainError,
  projectionHash,
  type ExistingProjectionEffect,
  type ProjectionApplyResult,
  type ProjectionEnvelope,
  type ProviderProjectionDriver,
} from './student-enrollment-projection.js';

const ROSTER_HEADERS = [
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
] as const;

interface PreimageRecord {
  version: 1;
  operationId: string;
  idempotencyKey: string;
  target: 'student_roster' | 'heartbeat';
  destinationKey: string;
  state: 'prepared' | 'applied';
  before: unknown;
  after: unknown;
  createdAt: string;
}

export interface ProjectionPreimageStore {
  get(idempotencyKey: string): Promise<PreimageRecord | null>;
  put(record: PreimageRecord): Promise<void>;
}

function fileKey(idempotencyKey: string): string {
  return createHash('sha256').update(idempotencyKey).digest('hex');
}

export class FileProjectionPreimageStore implements ProjectionPreimageStore {
  constructor(private readonly directory: string) {}

  async get(idempotencyKey: string): Promise<PreimageRecord | null> {
    const target = path.join(this.directory, `${fileKey(idempotencyKey)}.json`);
    try {
      const value = JSON.parse(
        fs.readFileSync(target, 'utf8'),
      ) as PreimageRecord;
      return value.idempotencyKey === idempotencyKey ? value : null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async put(record: PreimageRecord): Promise<void> {
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const target = path.join(
      this.directory,
      `${fileKey(record.idempotencyKey)}.json`,
    );
    const temp = `${target}.${process.pid}.${randomUUID()}.tmp`;
    const descriptor = fs.openSync(temp, 'wx', 0o600);
    try {
      fs.writeFileSync(descriptor, `${JSON.stringify(record)}\n`, 'utf8');
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    fs.renameSync(temp, target);
    fs.chmodSync(target, 0o600);
    const directory = fs.openSync(this.directory, 'r');
    try {
      fs.fsyncSync(directory);
    } finally {
      fs.closeSync(directory);
    }
  }
}

export interface StudentRosterApi {
  read(range: string): Promise<string[][]>;
  update(range: string, values: string[][]): Promise<void>;
  append(range: string, values: string[][]): Promise<{ updatedRange: string }>;
  clear(range: string): Promise<void>;
}

type RosterBefore = { row: number | null; values: string[]; appended: boolean };

function stringCell(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

function normalizeEmail(value: unknown): string {
  return stringCell(value).toLowerCase();
}

function rowNumber(updatedRange: string): number | null {
  const match = updatedRange.match(/![A-Z]+(\d+):[A-Z]+(\d+)$/);
  if (!match || match[1] !== match[2]) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value > 1 ? value : null;
}

function rosterPostimage(
  envelope: ProjectionEnvelope,
  before: string[],
): string[] {
  const p = envelope.payload;
  const row = Array.from({ length: 13 }, (_, index) => before[index] ?? '');
  row[0] = normalizeEmail(p.participant_email);
  if (!stringCell(row[1]) || stringCell(row[1]).toLowerCase() === 'unknown')
    row[1] = stringCell(p.participant_name);
  row[2] = stringCell(p.delivery_starts_at).slice(0, 10);
  row[5] = stringCell(p.projection_key);
  row[6] = stringCell(p.projection_version);
  row[7] = stringCell(p.enrollment_key);
  row[8] = stringCell(p.assignment_key);
  row[9] = stringCell(p.participant_key);
  row[10] = stringCell(p.offer_key);
  row[11] = stringCell(p.delivery_block_key);
  row[12] = stringCell(p.delivery_starts_at);
  return row;
}

function rosterReadback(row: string[], envelope: ProjectionEnvelope) {
  const p = envelope.payload;
  return {
    projection_key: row[5] ?? '',
    projection_version: Number(row[6]),
    participant_key: row[9] ?? '',
    participant_email: normalizeEmail(row[0]),
    participant_name: stringCell(row[1]),
    offer_key: row[10] ?? '',
    offer_version: p.offer_version,
    enrollment_key: row[7] ?? '',
    assignment_key: row[8] ?? '',
    delivery_block_key: row[11] ?? '',
    delivery_starts_at: row[12] ?? '',
  };
}

export class StudentRosterProjectionDriver implements ProviderProjectionDriver {
  readonly target = 'student_roster' as const;

  constructor(
    private readonly api: StudentRosterApi,
    private readonly preimages: ProjectionPreimageStore,
    private readonly tab = 'CSS',
  ) {}

  private async header(): Promise<void> {
    const rows = await this.api.read(`${this.tab}!A1:M1`);
    if (
      rows.length !== 1 ||
      ROSTER_HEADERS.some((header, index) => rows[0]?.[index] !== header)
    )
      throw new Error('student_roster_header_drift');
  }

  private async locate(envelope: ProjectionEnvelope): Promise<number | null> {
    await this.header();
    const rows = await this.api.read(`${this.tab}!A2:M`);
    const email = normalizeEmail(envelope.payload.participant_email);
    const key = stringCell(envelope.payload.projection_key);
    const byEmail: number[] = [];
    const byKey: number[] = [];
    rows.forEach((row, index) => {
      if (normalizeEmail(row[0]) === email) byEmail.push(index + 2);
      if (stringCell(row[5]) === key) byKey.push(index + 2);
    });
    if (byEmail.length > 1 || byKey.length > 1)
      throw new Error('student_roster_identity_ambiguous');
    if (byKey.length === 1 && byEmail.length === 1 && byKey[0] !== byEmail[0])
      throw new Error('student_roster_identity_conflict');
    return byKey[0] ?? byEmail[0] ?? null;
  }

  async findByIdempotencyKey(
    idempotencyKey: string,
    _destinationKey: string,
  ): Promise<ExistingProjectionEffect | null> {
    const record = await this.preimages.get(idempotencyKey);
    return record?.state === 'applied'
      ? { operationId: record.operationId }
      : null;
  }

  async apply(envelope: ProjectionEnvelope): Promise<ProjectionApplyResult> {
    const existing = await this.preimages.get(envelope.idempotencyKey);
    if (existing) {
      if (
        existing.destinationKey !== envelope.destinationKey ||
        projectionHash(existing.after) !== projectionHash(envelope.payload)
      )
        throw new Error('student_roster_preimage_conflict');
      if (existing.state === 'applied')
        return { operationId: existing.operationId };
      throw new ProjectionAcceptanceUncertainError();
    }
    const row = await this.locate(envelope);
    const before = row
      ? ((await this.api.read(`${this.tab}!A${row}:M${row}`))[0] ?? [])
      : [];
    const after = rosterPostimage(envelope, before);
    const operationId = `student-roster:${fileKey(envelope.idempotencyKey)}`;
    const prepared: PreimageRecord = {
      version: 1,
      operationId,
      idempotencyKey: envelope.idempotencyKey,
      target: this.target,
      destinationKey: envelope.destinationKey,
      state: 'prepared',
      before: {
        row,
        values: before,
        appended: row === null,
      } satisfies RosterBefore,
      after: envelope.payload,
      createdAt: new Date().toISOString(),
    };
    await this.preimages.put(prepared);
    try {
      if (row) {
        const fillName =
          !stringCell(before[1]) ||
          stringCell(before[1]).toLowerCase() === 'unknown';
        await this.api.update(
          fillName ? `${this.tab}!B${row}:C${row}` : `${this.tab}!C${row}`,
          [fillName ? after.slice(1, 3) : [after[2]]],
        );
        await this.api.update(`${this.tab}!F${row}:M${row}`, [after.slice(5)]);
      } else {
        const appended = await this.api.append(`${this.tab}!A:M`, [after]);
        const inserted = rowNumber(appended.updatedRange);
        if (!inserted) throw new ProjectionAcceptanceUncertainError();
        (prepared.before as RosterBefore).row = inserted;
        // Persist the provider-assigned locator before calling the operation
        // fully applied. A crash between these writes remains reconcilable and
        // compensatable without appending a second row.
        await this.preimages.put(prepared);
      }
      prepared.state = 'applied';
      await this.preimages.put(prepared);
      return { operationId };
    } catch (error) {
      if (error instanceof ProjectionAcceptanceUncertainError) throw error;
      throw new ProjectionAcceptanceUncertainError();
    }
  }

  async readback(envelope: ProjectionEnvelope): Promise<unknown | null> {
    const row = await this.locate(envelope);
    if (!row) return null;
    const values =
      (await this.api.read(`${this.tab}!A${row}:M${row}`))[0] ?? [];
    return rosterReadback(values, envelope);
  }

  async rollback(
    envelope: ProjectionEnvelope,
    operationId: string,
  ): Promise<void> {
    const record = await this.preimages.get(envelope.idempotencyKey);
    if (
      !record ||
      record.operationId !== operationId ||
      record.target !== this.target
    )
      throw new Error('student_roster_rollback_receipt_missing');
    const before = record.before as RosterBefore;
    if (!before.row && before.appended) {
      before.row = await this.locate(envelope);
      if (before.row) await this.preimages.put({ ...record, before });
    }
    if (!before.row) throw new Error('student_roster_rollback_row_missing');
    const current =
      (await this.api.read(`${this.tab}!A${before.row}:M${before.row}`))[0] ??
      [];
    const expected = rosterPostimage(envelope, before.values);
    if (projectionHash(current) !== projectionHash(expected))
      throw new Error('student_roster_rollback_postimage_changed');
    if (before.appended)
      await this.api.clear(`${this.tab}!A${before.row}:M${before.row}`);
    else {
      const restoredName = before.values[1] ?? '';
      const projectedName = rosterPostimage(envelope, before.values)[1] ?? '';
      const nameWasChanged = restoredName !== projectedName;
      await this.api.update(
        nameWasChanged
          ? `${this.tab}!B${before.row}:C${before.row}`
          : `${this.tab}!C${before.row}`,
        [
          nameWasChanged
            ? [restoredName, before.values[2] ?? '']
            : [before.values[2] ?? ''],
        ],
      );
      await this.api.update(`${this.tab}!F${before.row}:M${before.row}`, [
        before.values.slice(5, 13),
      ]);
    }
    const restored =
      (await this.api.read(`${this.tab}!A${before.row}:M${before.row}`))[0] ??
      [];
    if (projectionHash(restored) !== projectionHash(before.values))
      throw new Error('student_roster_rollback_readback_mismatch');
  }
}

export interface HeartbeatProjectionUser {
  id: string;
  email: string;
  groupIds: string[];
}

export interface HeartbeatProjectionApi {
  findExactUser(email: string): Promise<HeartbeatProjectionUser | null>;
  addMembership(groupId: string, email: string): Promise<void>;
  removeMembership(groupId: string, email: string): Promise<void>;
}

type HeartbeatBefore = {
  email: string;
  accessGroupId: string;
  markerGroupId: string;
  accessPresent: boolean;
  markerPresent: boolean;
};

export class HeartbeatProjectionDriver implements ProviderProjectionDriver {
  readonly target = 'heartbeat' as const;

  constructor(
    private readonly api: HeartbeatProjectionApi,
    private readonly preimages: ProjectionPreimageStore,
  ) {}

  async findByIdempotencyKey(
    idempotencyKey: string,
    _destinationKey: string,
  ): Promise<ExistingProjectionEffect | null> {
    const record = await this.preimages.get(idempotencyKey);
    return record?.state === 'applied'
      ? { operationId: record.operationId }
      : null;
  }

  async apply(envelope: ProjectionEnvelope): Promise<ProjectionApplyResult> {
    const prior = await this.preimages.get(envelope.idempotencyKey);
    if (prior) {
      if (prior.state === 'applied') return { operationId: prior.operationId };
      throw new ProjectionAcceptanceUncertainError();
    }
    const email = normalizeEmail(envelope.payload.participant_email);
    const accessGroupId = stringCell(envelope.payload.course_access_group_key);
    const markerGroupId = stringCell(
      envelope.payload.delivery_marker_group_key,
    );
    const user = await this.api.findExactUser(email);
    if (!user || normalizeEmail(user.email) !== email)
      throw new Error('heartbeat_participant_not_found');
    const before: HeartbeatBefore = {
      email,
      accessGroupId,
      markerGroupId,
      accessPresent: user.groupIds.includes(accessGroupId),
      markerPresent: user.groupIds.includes(markerGroupId),
    };
    const operationId = `heartbeat:${fileKey(envelope.idempotencyKey)}`;
    const record: PreimageRecord = {
      version: 1,
      operationId,
      idempotencyKey: envelope.idempotencyKey,
      target: this.target,
      destinationKey: envelope.destinationKey,
      state: 'prepared',
      before,
      after: envelope.payload,
      createdAt: new Date().toISOString(),
    };
    await this.preimages.put(record);
    try {
      if (!before.accessPresent)
        await this.api.addMembership(accessGroupId, email);
      if (!before.markerPresent)
        await this.api.addMembership(markerGroupId, email);
      record.state = 'applied';
      await this.preimages.put(record);
      return { operationId };
    } catch {
      throw new ProjectionAcceptanceUncertainError();
    }
  }

  async readback(envelope: ProjectionEnvelope): Promise<unknown | null> {
    const email = normalizeEmail(envelope.payload.participant_email);
    const user = await this.api.findExactUser(email);
    if (!user) return null;
    const access = stringCell(envelope.payload.course_access_group_key);
    const marker = stringCell(envelope.payload.delivery_marker_group_key);
    if (!user.groupIds.includes(access) || !user.groupIds.includes(marker))
      return null;
    return {
      participant_key: envelope.payload.participant_key,
      participant_email: email,
      course_access_group_key: access,
      delivery_marker_group_key: marker,
      marker_hidden: true,
      marker_admin_controlled: true,
      marker_has_content: false,
      marker_proves_payment: false,
      marker_proves_entitlement: false,
    };
  }

  async rollback(
    envelope: ProjectionEnvelope,
    operationId: string,
  ): Promise<void> {
    const record = await this.preimages.get(envelope.idempotencyKey);
    if (
      !record ||
      record.operationId !== operationId ||
      record.target !== this.target
    )
      throw new Error('heartbeat_rollback_receipt_missing');
    const before = record.before as HeartbeatBefore;
    const current = await this.api.findExactUser(before.email);
    if (!current) throw new Error('heartbeat_rollback_user_missing');
    if (
      !before.markerPresent &&
      current.groupIds.includes(before.markerGroupId)
    )
      await this.api.removeMembership(before.markerGroupId, before.email);
    if (
      !before.accessPresent &&
      current.groupIds.includes(before.accessGroupId)
    )
      await this.api.removeMembership(before.accessGroupId, before.email);
    const restored = await this.api.findExactUser(before.email);
    if (
      !restored ||
      (!before.markerPresent &&
        restored.groupIds.includes(before.markerGroupId)) ||
      (!before.accessPresent &&
        restored.groupIds.includes(before.accessGroupId))
    )
      throw new Error('heartbeat_rollback_readback_mismatch');
  }
}
