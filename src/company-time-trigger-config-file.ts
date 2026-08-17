import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  COMPANY_TIME_TRIGGER_ENV_KEYS,
  resolveCompanyTimeTriggerConfig,
} from './company-time-trigger.js';

export interface CompanyTimeTriggerConfigFileOptions {
  envFile: string;
  mode: 'off' | 'on';
  taskId?: string;
  scheduledFor?: string;
  apply: boolean;
  confirmHost?: string;
  now?: Date;
}

export interface CompanyTimeTriggerPublicConfig {
  enabled: boolean;
  active: boolean;
  valid: boolean;
  taskCount: number;
  scheduledFor: string | null;
  configurationError: string | null;
}

export interface CompanyTimeTriggerConfigFileResult {
  mode: 'dry-run' | 'applied' | 'unchanged';
  current: CompanyTimeTriggerPublicConfig;
  target: CompanyTimeTriggerPublicConfig;
  backupPath: string | null;
}

export interface RestoreCompanyTimeTriggerConfigOptions {
  envFile: string;
  backupFile: string;
  confirmHost: string;
}

function assertAbsoluteRegularFile(file: string, label: string): fs.Stats {
  if (!path.isAbsolute(file)) throw new Error(`${label} path must be absolute`);
  const stat = fs.lstatSync(file);
  if (!stat.isFile()) throw new Error(`${label} must be a regular file`);
  return stat;
}

function readSingleValue(contents: string, key: string): string | undefined {
  const values = contents
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('#'))
    .map((line) => {
      const separator = line.indexOf('=');
      return separator === -1
        ? null
        : ([
            line.slice(0, separator).trim(),
            line.slice(separator + 1),
          ] as const);
    })
    .filter((entry): entry is readonly [string, string] => entry !== null)
    .filter(([name]) => name === key)
    .map(([, value]) => value);
  if (values.length > 1) throw new Error(`${key} appears more than once`);
  return values[0];
}

function replaceSingleValue(
  contents: string,
  key: string,
  value: string,
): string {
  const expression = new RegExp(`(^|\\n)[ \\t]*${key}[ \\t]*=[^\\r\\n]*`, 'm');
  if (expression.test(contents)) {
    return contents.replace(
      expression,
      (_line, prefix: string) => `${prefix}${key}=${value}`,
    );
  }
  const newline = contents.includes('\r\n') ? '\r\n' : '\n';
  const suffix = contents.endsWith('\n') ? '' : newline;
  return `${contents}${suffix}${key}=${value}${newline}`;
}

function publicConfig(contents: string): CompanyTimeTriggerPublicConfig {
  const resolved = resolveCompanyTimeTriggerConfig(
    Object.fromEntries(
      COMPANY_TIME_TRIGGER_ENV_KEYS.map((key) => [
        key,
        readSingleValue(contents, key),
      ]),
    ),
  );
  return {
    enabled: resolved.enabled,
    active: resolved.active,
    valid: !resolved.enabled || resolved.configurationError === null,
    taskCount: resolved.active ? 1 : 0,
    scheduledFor: resolved.active ? resolved.scheduledFor : null,
    configurationError: resolved.configurationError,
  };
}

function renderTarget(
  contents: string,
  options: CompanyTimeTriggerConfigFileOptions,
): string {
  if (options.mode === 'off') {
    return replaceSingleValue(contents, 'COMPANY_TIME_TRIGGER_ENABLED', '0');
  }
  if (!options.taskId || !options.scheduledFor) {
    throw new Error('on mode requires taskId and scheduledFor');
  }
  let rendered = contents;
  for (const [key, value] of Object.entries({
    COMPANY_TIME_TRIGGER_ENABLED: '1',
    COMPANY_TIME_TRIGGER_TASK_ID: options.taskId,
    COMPANY_TIME_TRIGGER_SCHEDULED_FOR: options.scheduledFor,
  })) {
    rendered = replaceSingleValue(rendered, key, value);
  }
  return rendered;
}

function backupName(envFile: string, now: Date): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  return `${envFile}.rollback-company-time-trigger-${stamp}`;
}

function atomicWrite(file: string, contents: string, mode: number): void {
  const temporary = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    fs.writeFileSync(temporary, contents, { mode });
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

export function setCompanyTimeTriggerConfig(
  options: CompanyTimeTriggerConfigFileOptions,
): CompanyTimeTriggerConfigFileResult {
  const stat = assertAbsoluteRegularFile(options.envFile, 'environment file');
  const contents = fs.readFileSync(options.envFile, 'utf8');
  const current = publicConfig(contents);
  const rendered = renderTarget(contents, options);
  const target = publicConfig(rendered);
  if (!target.valid) {
    throw new Error(
      `target time-trigger configuration is invalid: ${target.configurationError}`,
    );
  }
  const base = { current, target };
  if (rendered === contents) {
    return { mode: 'unchanged', ...base, backupPath: null };
  }
  if (!options.apply) {
    return { mode: 'dry-run', ...base, backupPath: null };
  }
  if (options.confirmHost !== os.hostname()) {
    throw new Error(`--apply requires --confirm-host ${os.hostname()}`);
  }
  const backupPath = backupName(options.envFile, options.now ?? new Date());
  fs.copyFileSync(options.envFile, backupPath, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(backupPath, stat.mode);
  try {
    atomicWrite(options.envFile, rendered, stat.mode);
    if (fs.readFileSync(options.envFile, 'utf8') !== rendered) {
      throw new Error('time-trigger environment write verification failed');
    }
  } catch (error) {
    atomicWrite(options.envFile, contents, stat.mode);
    throw error;
  }
  return { mode: 'applied', ...base, backupPath };
}

export function restoreCompanyTimeTriggerConfig(
  options: RestoreCompanyTimeTriggerConfigOptions,
): CompanyTimeTriggerConfigFileResult {
  const envStat = assertAbsoluteRegularFile(
    options.envFile,
    'environment file',
  );
  const backupStat = assertAbsoluteRegularFile(options.backupFile, 'backup');
  const expectedPrefix = `${options.envFile}.rollback-company-time-trigger-`;
  if (!options.backupFile.startsWith(expectedPrefix)) {
    throw new Error('backup is not a time-trigger backup for this file');
  }
  if (options.confirmHost !== os.hostname()) {
    throw new Error(`restore requires --confirm-host ${os.hostname()}`);
  }
  const currentContents = fs.readFileSync(options.envFile, 'utf8');
  const backupContents = fs.readFileSync(options.backupFile, 'utf8');
  const restored = publicConfig(backupContents);
  if (!restored.valid) {
    throw new Error('backup time-trigger configuration is invalid');
  }
  const current = publicConfig(currentContents);
  if (currentContents === backupContents) {
    return {
      mode: 'unchanged',
      current,
      target: restored,
      backupPath: options.backupFile,
    };
  }
  atomicWrite(options.envFile, backupContents, backupStat.mode || envStat.mode);
  if (fs.readFileSync(options.envFile, 'utf8') !== backupContents) {
    throw new Error('time-trigger environment restore verification failed');
  }
  return {
    mode: 'applied',
    current,
    target: restored,
    backupPath: options.backupFile,
  };
}
