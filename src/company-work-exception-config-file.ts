import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  COMPANY_WORK_EXCEPTION_LOOP_ENV_KEYS,
  resolveCompanyWorkExceptionLoopConfig,
} from './company-work-exception-loop.js';

const ALLOWED_OPERATOR_SOURCE_KEYS = new Set([
  'PROCUREMENT_OPERATOR_UIDS',
  'HEALER_OPERATOR_UIDS',
  'HEALER_OPERATOR_UID',
]);
const SLACK_UID_PATTERN = /^[UW][A-Z0-9]{6,31}$/;
const MAX_OPERATOR_UID_FILE_BYTES = 128;

export interface CompanyWorkExceptionConfigFileOptions {
  envFile: string;
  mode: 'off' | 'on';
  operatorSourceKey?: string;
  operatorUidFile?: string;
  intervalMs?: number;
  reportLimit?: number;
  staleAfterHours?: number;
  apply: boolean;
  confirmHost?: string;
  now?: Date;
}

export interface CompanyWorkExceptionPublicConfig {
  enabled: boolean;
  active: boolean;
  valid: boolean;
  operatorCount: number;
  intervalMs: number;
  reportLimit: number;
  staleAfterHours: number;
  configurationError: string | null;
}

export interface CompanyWorkExceptionConfigFileResult {
  mode: 'dry-run' | 'applied' | 'unchanged';
  current: CompanyWorkExceptionPublicConfig;
  target: CompanyWorkExceptionPublicConfig;
  backupPath: string | null;
}

export interface RestoreCompanyWorkExceptionConfigOptions {
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

function publicConfig(contents: string): CompanyWorkExceptionPublicConfig {
  const resolved = resolveCompanyWorkExceptionLoopConfig(
    Object.fromEntries(
      COMPANY_WORK_EXCEPTION_LOOP_ENV_KEYS.map((key) => [
        key,
        readSingleValue(contents, key),
      ]),
    ),
  );
  return {
    enabled: resolved.enabled,
    active: resolved.active,
    valid: !resolved.enabled || resolved.configurationError === null,
    operatorCount: resolved.operatorUids.length,
    intervalMs: resolved.intervalMs,
    reportLimit: resolved.reportLimit,
    staleAfterHours: resolved.staleAfterHours,
    configurationError: resolved.configurationError,
  };
}

function positiveInteger(
  value: number | undefined,
  fallback: number,
  label: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return resolved;
}

function readOperatorUidFile(file: string): string {
  const initialStat = assertAbsoluteRegularFile(file, 'operator UID file');
  const descriptor = fs.openSync(
    file,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
  );
  try {
    const stat = fs.fstatSync(descriptor);
    if (
      !stat.isFile() ||
      stat.dev !== initialStat.dev ||
      stat.ino !== initialStat.ino
    ) {
      throw new Error('operator UID file changed during validation');
    }
    if ((stat.mode & 0o077) !== 0 || (stat.mode & 0o400) === 0) {
      throw new Error(
        'operator UID file must be owner-readable and owner-only',
      );
    }
    const uid = process.getuid?.();
    if (uid !== undefined && stat.uid !== uid) {
      throw new Error('operator UID file must be owned by the current user');
    }
    if (stat.size <= 0 || stat.size > MAX_OPERATOR_UID_FILE_BYTES) {
      throw new Error('operator UID file has an invalid size');
    }
    const value = fs.readFileSync(descriptor, 'utf8').trim();
    if (!SLACK_UID_PATTERN.test(value)) {
      throw new Error(
        'operator UID file must contain exactly one valid Slack UID',
      );
    }
    return value;
  } finally {
    fs.closeSync(descriptor);
  }
}

function renderTarget(
  contents: string,
  options: CompanyWorkExceptionConfigFileOptions,
): string {
  if (options.mode === 'off') {
    return replaceSingleValue(
      contents,
      'COMPANY_WORK_EXCEPTION_BRIEF_ENABLED',
      '0',
    );
  }
  const sourceKey = options.operatorSourceKey;
  const sourceFile = options.operatorUidFile;
  if (Boolean(sourceKey) === Boolean(sourceFile)) {
    throw new Error(
      'on mode requires exactly one named-operator source key or UID file',
    );
  }
  let operatorUids: string;
  if (sourceFile) {
    operatorUids = readOperatorUidFile(sourceFile);
  } else {
    if (!sourceKey || !ALLOWED_OPERATOR_SOURCE_KEYS.has(sourceKey)) {
      throw new Error('on mode requires an allowed named-operator source key');
    }
    const existingOperatorUids = readSingleValue(contents, sourceKey);
    if (!existingOperatorUids?.trim()) {
      throw new Error(`${sourceKey} is absent or empty`);
    }
    operatorUids = existingOperatorUids;
  }
  let rendered = contents;
  const values: Record<string, string> = {
    COMPANY_WORK_EXCEPTION_BRIEF_ENABLED: '1',
    COMPANY_WORK_EXCEPTION_OPERATOR_UIDS: operatorUids,
    COMPANY_WORK_EXCEPTION_BRIEF_INTERVAL_MS: String(
      positiveInteger(options.intervalMs, 86_400_000, 'intervalMs'),
    ),
    COMPANY_WORK_EXCEPTION_REPORT_LIMIT: String(
      positiveInteger(options.reportLimit, 100, 'reportLimit'),
    ),
    COMPANY_WORK_EXCEPTION_STALE_AFTER_HOURS: String(
      positiveInteger(options.staleAfterHours, 24, 'staleAfterHours'),
    ),
  };
  for (const [key, value] of Object.entries(values)) {
    rendered = replaceSingleValue(rendered, key, value);
  }
  return rendered;
}

function backupName(envFile: string, now: Date): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  return `${envFile}.rollback-company-work-exceptions-${stamp}`;
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

export function setCompanyWorkExceptionConfig(
  options: CompanyWorkExceptionConfigFileOptions,
): CompanyWorkExceptionConfigFileResult {
  const stat = assertAbsoluteRegularFile(options.envFile, 'environment file');
  const contents = fs.readFileSync(options.envFile, 'utf8');
  const current = publicConfig(contents);
  const rendered = renderTarget(contents, options);
  const target = publicConfig(rendered);
  if (!target.valid) {
    throw new Error(
      `target exception-loop configuration is invalid: ${target.configurationError}`,
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
      throw new Error('exception-loop environment write verification failed');
    }
  } catch (error) {
    atomicWrite(options.envFile, contents, stat.mode);
    throw error;
  }
  return { mode: 'applied', ...base, backupPath };
}

export function restoreCompanyWorkExceptionConfig(
  options: RestoreCompanyWorkExceptionConfigOptions,
): CompanyWorkExceptionConfigFileResult {
  const envStat = assertAbsoluteRegularFile(
    options.envFile,
    'environment file',
  );
  const backupStat = assertAbsoluteRegularFile(options.backupFile, 'backup');
  const expectedPrefix = `${options.envFile}.rollback-company-work-exceptions-`;
  if (!options.backupFile.startsWith(expectedPrefix)) {
    throw new Error('backup is not an exception-loop backup for this file');
  }
  if (options.confirmHost !== os.hostname()) {
    throw new Error(`restore requires --confirm-host ${os.hostname()}`);
  }
  const currentContents = fs.readFileSync(options.envFile, 'utf8');
  const backupContents = fs.readFileSync(options.backupFile, 'utf8');
  const restored = publicConfig(backupContents);
  if (!restored.valid) {
    throw new Error('backup exception-loop configuration is invalid');
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
    throw new Error('exception-loop environment restore verification failed');
  }
  return {
    mode: 'applied',
    current,
    target: restored,
    backupPath: options.backupFile,
  };
}
