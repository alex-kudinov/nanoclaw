import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readEnvFile } from './env.js';

export const ACADEMY_CAPACITY_OPERATOR_ENV_KEY =
  'ACADEMY_CAPACITY_OPERATOR_ENABLED';

export interface AcademyCapacityOperatorConfig {
  enabled: boolean;
  valid: boolean;
  reason: 'enabled' | 'disabled' | 'invalid_boolean';
}

export function resolveAcademyCapacityOperatorConfig(
  value: string | undefined,
): AcademyCapacityOperatorConfig {
  if (value === '1' || value === 'true')
    return { enabled: true, valid: true, reason: 'enabled' };
  if (value === undefined || value === '' || value === '0' || value === 'false')
    return { enabled: false, valid: true, reason: 'disabled' };
  return { enabled: false, valid: false, reason: 'invalid_boolean' };
}

export function academyCapacityOperatorConfig(
  env: NodeJS.ProcessEnv = process.env,
): AcademyCapacityOperatorConfig {
  const file = readEnvFile([ACADEMY_CAPACITY_OPERATOR_ENV_KEY]);
  const value = Object.prototype.hasOwnProperty.call(
    env,
    ACADEMY_CAPACITY_OPERATOR_ENV_KEY,
  )
    ? env[ACADEMY_CAPACITY_OPERATOR_ENV_KEY]
    : file[ACADEMY_CAPACITY_OPERATOR_ENV_KEY];
  return resolveAcademyCapacityOperatorConfig(value);
}

function readSingleValue(contents: string): string | undefined {
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
    .filter(([key]) => key === ACADEMY_CAPACITY_OPERATOR_ENV_KEY)
    .map(([, value]) => value);
  if (values.length > 1)
    throw new Error(
      `${ACADEMY_CAPACITY_OPERATOR_ENV_KEY} appears more than once`,
    );
  return values[0];
}

function render(contents: string, enabled: boolean): string {
  const line = `${ACADEMY_CAPACITY_OPERATOR_ENV_KEY}=${enabled ? '1' : '0'}`;
  const expression = new RegExp(
    `(^|\\n)[ \\t]*${ACADEMY_CAPACITY_OPERATOR_ENV_KEY}[ \\t]*=[^\\r\\n]*`,
    'm',
  );
  if (expression.test(contents))
    return contents.replace(
      expression,
      (_match, prefix: string) => `${prefix}${line}`,
    );
  const suffix = contents.endsWith('\n') ? '' : '\n';
  return `${contents}${suffix}${line}\n`;
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

export function setAcademyCapacityOperatorConfig(options: {
  envFile: string;
  enabled: boolean;
  apply: boolean;
  confirmHost?: string;
  now?: Date;
}): {
  mode: 'dry-run' | 'applied' | 'unchanged';
  current: AcademyCapacityOperatorConfig;
  target: AcademyCapacityOperatorConfig;
  backupPath: string | null;
} {
  if (!path.isAbsolute(options.envFile))
    throw new Error('environment file path must be absolute');
  const stat = fs.lstatSync(options.envFile);
  if (!stat.isFile())
    throw new Error('environment file must be a regular file');
  const contents = fs.readFileSync(options.envFile, 'utf8');
  const current = resolveAcademyCapacityOperatorConfig(
    readSingleValue(contents),
  );
  if (!current.valid)
    throw new Error('current Capacity operator configuration is invalid');
  const rendered = render(contents, options.enabled);
  const target = resolveAcademyCapacityOperatorConfig(
    readSingleValue(rendered),
  );
  if (rendered === contents)
    return { mode: 'unchanged', current, target, backupPath: null };
  if (!options.apply)
    return { mode: 'dry-run', current, target, backupPath: null };
  if (options.confirmHost !== os.hostname())
    throw new Error(`--apply requires --confirm-host ${os.hostname()}`);
  const stamp = (options.now ?? new Date()).toISOString().replace(/[:.]/g, '-');
  const backupPath = `${options.envFile}.rollback-academy-capacity-${stamp}`;
  fs.copyFileSync(options.envFile, backupPath, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(backupPath, stat.mode);
  try {
    atomicWrite(options.envFile, rendered, stat.mode);
    if (fs.readFileSync(options.envFile, 'utf8') !== rendered)
      throw new Error(
        'Capacity operator environment write verification failed',
      );
  } catch (error) {
    atomicWrite(options.envFile, contents, stat.mode);
    throw error;
  }
  return { mode: 'applied', current, target, backupPath };
}
