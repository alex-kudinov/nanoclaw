import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { resolveTandemIdentityD2Config } from './d2-student-lifecycle-shadow.js';

export interface D2ConfigFileResult {
  mode: 'dry-run' | 'applied' | 'unchanged';
  current: ReturnType<typeof publicConfig>;
  target: ReturnType<typeof publicConfig>;
  backupPath: string | null;
}

function regularFile(file: string, label: string): fs.Stats {
  if (!path.isAbsolute(file)) throw new Error(`${label} path must be absolute`);
  const stat = fs.lstatSync(file);
  if (!stat.isFile()) throw new Error(`${label} must be a regular file`);
  return stat;
}

function readValue(contents: string, key: string): string | undefined {
  const values = contents
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('#'))
    .flatMap((line) => {
      const separator = line.indexOf('=');
      return separator === -1
        ? []
        : [[line.slice(0, separator).trim(), line.slice(separator + 1)]];
    })
    .filter(([name]) => name === key)
    .map(([, value]) => value);
  if (values.length > 1) throw new Error(`${key} appears more than once`);
  return values[0];
}

function replaceValue(contents: string, key: string, value: string): string {
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

function publicConfig(contents: string) {
  const config = resolveTandemIdentityD2Config({
    TANDEM_IDENTITY_D2_SHADOW_ENABLED: readValue(
      contents,
      'TANDEM_IDENTITY_D2_SHADOW_ENABLED',
    ),
    TANDEM_IDENTITY_D2_BATCH_LIMIT: readValue(
      contents,
      'TANDEM_IDENTITY_D2_BATCH_LIMIT',
    ),
    TANDEM_IDENTITY_D2_INTERVAL_MS: readValue(
      contents,
      'TANDEM_IDENTITY_D2_INTERVAL_MS',
    ),
  });
  return {
    enabled: config.enabled,
    valid: config.valid,
    reason: config.reason,
    batchLimit: config.batchLimit,
    intervalMs: config.intervalMs,
  };
}

function render(contents: string, mode: 'off' | 'on'): string {
  if (mode === 'off') {
    return replaceValue(contents, 'TANDEM_IDENTITY_D2_SHADOW_ENABLED', '0');
  }
  let value = contents;
  for (const [key, entry] of Object.entries({
    TANDEM_IDENTITY_D2_SHADOW_ENABLED: '1',
    TANDEM_IDENTITY_D2_BATCH_LIMIT: '500',
    TANDEM_IDENTITY_D2_INTERVAL_MS: '300000',
  })) {
    value = replaceValue(value, key, entry);
  }
  return value;
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

export function setTandemIdentityD2Config(options: {
  envFile: string;
  mode: 'off' | 'on';
  apply: boolean;
  confirmHost?: string;
  now?: Date;
}): D2ConfigFileResult {
  const stat = regularFile(options.envFile, 'environment file');
  const contents = fs.readFileSync(options.envFile, 'utf8');
  const current = publicConfig(contents);
  const rendered = render(contents, options.mode);
  const target = publicConfig(rendered);
  if (!target.valid || (options.mode === 'on' && !target.enabled)) {
    throw new Error('target Tandem Identity D2 configuration is invalid');
  }
  if (rendered === contents) {
    return { mode: 'unchanged', current, target, backupPath: null };
  }
  if (!options.apply) {
    return { mode: 'dry-run', current, target, backupPath: null };
  }
  if (options.confirmHost !== os.hostname()) {
    throw new Error(`--apply requires --confirm-host ${os.hostname()}`);
  }
  const stamp = (options.now ?? new Date()).toISOString().replace(/[:.]/g, '-');
  const backupPath = `${options.envFile}.rollback-tandem-identity-d2-${stamp}`;
  fs.copyFileSync(options.envFile, backupPath, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(backupPath, stat.mode);
  try {
    atomicWrite(options.envFile, rendered, stat.mode);
    if (fs.readFileSync(options.envFile, 'utf8') !== rendered) {
      throw new Error('Tandem Identity D2 environment verification failed');
    }
  } catch (error) {
    atomicWrite(options.envFile, contents, stat.mode);
    throw error;
  }
  return { mode: 'applied', current, target, backupPath };
}

export function restoreTandemIdentityD2Config(options: {
  envFile: string;
  backupFile: string;
  confirmHost: string;
}): D2ConfigFileResult {
  const envStat = regularFile(options.envFile, 'environment file');
  const backupStat = regularFile(options.backupFile, 'backup');
  if (
    !options.backupFile.startsWith(
      `${options.envFile}.rollback-tandem-identity-d2-`,
    )
  ) {
    throw new Error('backup is not a Tandem Identity D2 backup for this file');
  }
  if (options.confirmHost !== os.hostname()) {
    throw new Error(`restore requires --confirm-host ${os.hostname()}`);
  }
  const currentContents = fs.readFileSync(options.envFile, 'utf8');
  const backupContents = fs.readFileSync(options.backupFile, 'utf8');
  const current = publicConfig(currentContents);
  const target = publicConfig(backupContents);
  if (!target.valid)
    throw new Error('backup Tandem Identity D2 configuration is invalid');
  if (currentContents === backupContents) {
    return {
      mode: 'unchanged',
      current,
      target,
      backupPath: options.backupFile,
    };
  }
  atomicWrite(options.envFile, backupContents, backupStat.mode || envStat.mode);
  return { mode: 'applied', current, target, backupPath: options.backupFile };
}
