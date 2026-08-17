/**
 * Bounded Company OS observer for already-claimed scheduled-task occurrences.
 *
 * The scheduler remains authoritative. This component receives only the
 * existing task identity, schedule shape, and exact pre-claim next_run value.
 * It never sees prompts, chats, results, agent state, or action arguments, and
 * it cannot create/resume a task or affect the scheduler claim.
 */

import { createHash } from 'crypto';

import {
  CompanyTriggerError,
  recordCompanyTrigger,
  type CompanyTriggerRecordResult,
} from './company-trigger.js';
import { readEnvFile } from './env.js';
import { logger } from './logger.js';
import type { ScheduledTask } from './types.js';

export const COMPANY_TIME_TRIGGER_ENV_KEYS = [
  'COMPANY_TIME_TRIGGER_ENABLED',
  'COMPANY_TIME_TRIGGER_TASK_ID',
  'COMPANY_TIME_TRIGGER_SCHEDULED_FOR',
] as const;

const TASK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,255}$/;
const ISO_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

export interface CompanyTimeTriggerConfig {
  enabled: boolean;
  active: boolean;
  taskId: string | null;
  scheduledFor: string | null;
  configurationError: string | null;
}

export type CompanyTimeTriggerOutcome =
  | 'disabled'
  | 'misconfigured'
  | 'out_of_scope'
  | 'outside_boundary'
  | 'applied'
  | 'duplicate'
  | 'failed';

export interface CompanyTimeTriggerObservation {
  outcome: CompanyTimeTriggerOutcome;
  occurrenceId: string | null;
  errorCode: string | null;
}

export interface CompanyTimeTriggerStatus {
  mode: 'disabled' | 'misconfigured' | 'armed';
  taskCount: number;
  scheduledFor: string | null;
  boundaryState: 'none' | 'pending' | 'reached';
  running: boolean;
  totalCalls: number;
  matchedCalls: number;
  applied: number;
  duplicates: number;
  failures: number;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastOutcome: CompanyTimeTriggerOutcome | null;
  lastErrorCode: string | null;
}

export interface CompanyTimeTriggerDeps {
  record(input: unknown): Promise<CompanyTriggerRecordResult>;
  now(): Date;
}

export type CompanyTimeTriggerTask = Pick<
  ScheduledTask,
  'id' | 'schedule_type' | 'schedule_value'
>;

function normalizeTimestamp(value: string | undefined): string | null {
  if (!value || !ISO_TIMESTAMP_PATTERN.test(value)) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  const normalized = new Date(parsed).toISOString();
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day
  ) {
    return null;
  }
  return normalized;
}

export function resolveCompanyTimeTriggerConfig(
  supplied?: Record<string, string | undefined>,
): CompanyTimeTriggerConfig {
  const fileValues: Record<string, string | undefined> = supplied
    ? {}
    : readEnvFile([...COMPANY_TIME_TRIGGER_ENV_KEYS]);
  const values =
    supplied ??
    Object.fromEntries(
      COMPANY_TIME_TRIGGER_ENV_KEYS.map((key) => [
        key,
        process.env[key] || fileValues[key],
      ]),
    );
  const enabled = values.COMPANY_TIME_TRIGGER_ENABLED === '1';
  const rawTaskId = values.COMPANY_TIME_TRIGGER_TASK_ID;
  const taskId =
    rawTaskId && TASK_ID_PATTERN.test(rawTaskId) ? rawTaskId : null;
  const scheduledFor = normalizeTimestamp(
    values.COMPANY_TIME_TRIGGER_SCHEDULED_FOR,
  );
  let configurationError: string | null = null;
  if (enabled && !taskId) configurationError = 'invalid_task_id';
  else if (enabled && !scheduledFor)
    configurationError = 'invalid_scheduled_boundary';
  return {
    enabled,
    active: enabled && configurationError === null,
    taskId,
    scheduledFor,
    configurationError,
  };
}

function hash(parts: readonly unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

export function buildCompanyTimeTriggerInput(
  task: CompanyTimeTriggerTask,
  scheduledFor: string,
): Record<string, unknown> {
  const definitionAlias = `task:${hash([
    'company-time-trigger-task:v1',
    task.id,
  ])}`;
  const workAlias = `claim:${hash([
    'company-time-trigger-work:v1',
    task.id,
    scheduledFor,
  ])}`;
  return {
    kind: 'time',
    sourceSystem: 'scheduled_task',
    sourceKey: definitionAlias,
    occurrenceKey: scheduledFor,
    observedAt: scheduledFor,
    payloadSha256: hash([
      'company-time-trigger-evidence:v1',
      task.id,
      task.schedule_type,
      task.schedule_value,
      scheduledFor,
    ]),
    workRequest: {
      operation: 'create',
      workflowType: 'scheduled_task',
      sourceSystem: 'scheduled_task',
      sourceKey: workAlias,
    },
  };
}

export class CompanyTimeTriggerObserver {
  private running = false;
  private totalCalls = 0;
  private matchedCalls = 0;
  private applied = 0;
  private duplicates = 0;
  private failures = 0;
  private lastAttemptAt: string | null = null;
  private lastSuccessAt: string | null = null;
  private lastOutcome: CompanyTimeTriggerOutcome | null = null;
  private lastErrorCode: string | null = null;

  constructor(
    private readonly deps: CompanyTimeTriggerDeps = {
      record: recordCompanyTrigger,
      now: () => new Date(),
    },
    private readonly getConfig: () => CompanyTimeTriggerConfig = () =>
      resolveCompanyTimeTriggerConfig(),
  ) {}

  getStatus(): CompanyTimeTriggerStatus {
    const config = this.getConfig();
    const now = this.deps.now().getTime();
    const boundary = config.scheduledFor
      ? Date.parse(config.scheduledFor)
      : Number.NaN;
    return {
      mode: !config.enabled
        ? 'disabled'
        : config.active
          ? 'armed'
          : 'misconfigured',
      taskCount: config.active ? 1 : 0,
      scheduledFor: config.active ? config.scheduledFor : null,
      boundaryState: !config.active
        ? 'none'
        : now < boundary
          ? 'pending'
          : 'reached',
      running: this.running,
      totalCalls: this.totalCalls,
      matchedCalls: this.matchedCalls,
      applied: this.applied,
      duplicates: this.duplicates,
      failures: this.failures,
      lastAttemptAt: this.lastAttemptAt,
      lastSuccessAt: this.lastSuccessAt,
      lastOutcome: this.lastOutcome,
      lastErrorCode: this.lastErrorCode,
    };
  }

  async observeClaim(
    task: CompanyTimeTriggerTask,
    scheduledFor: string,
  ): Promise<CompanyTimeTriggerObservation> {
    this.totalCalls++;
    const config = this.getConfig();
    if (!config.enabled) return this.finish('disabled');
    if (!config.active || !config.taskId || !config.scheduledFor) {
      return this.finish('misconfigured', null, config.configurationError);
    }
    if (task.id !== config.taskId) return this.finish('out_of_scope');

    const normalizedBoundary = normalizeTimestamp(scheduledFor);
    if (normalizedBoundary !== config.scheduledFor) {
      return this.finish('outside_boundary');
    }

    this.matchedCalls++;
    this.running = true;
    this.lastAttemptAt = this.deps.now().toISOString();
    try {
      const result = await this.deps.record(
        buildCompanyTimeTriggerInput(task, normalizedBoundary),
      );
      this.lastSuccessAt = this.deps.now().toISOString();
      if (result.applied) {
        this.applied++;
        this.lastErrorCode = null;
        return this.finish('applied', result.occurrence.occurrenceId);
      }
      this.duplicates++;
      this.lastErrorCode = null;
      return this.finish('duplicate', result.occurrence.occurrenceId);
    } catch (error) {
      this.failures++;
      const code =
        error instanceof CompanyTriggerError ? error.code : 'record_failed';
      logger.error(
        { err: error, code },
        'Company time trigger observation failed without affecting task claim',
      );
      return this.finish('failed', null, code);
    } finally {
      this.running = false;
    }
  }

  private finish(
    outcome: CompanyTimeTriggerOutcome,
    occurrenceId: string | null = null,
    errorCode: string | null = null,
  ): CompanyTimeTriggerObservation {
    this.lastOutcome = outcome;
    if (errorCode !== null) this.lastErrorCode = errorCode;
    return { outcome, occurrenceId, errorCode };
  }
}
