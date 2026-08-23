import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  COMPANY_HEALER_WORK_ENV_KEYS,
  resolveHealerCompanyWorkAdapterConfig,
} from './company-work-adapter.js';

export interface HealerCompanyWorkConfigFileOptions {
  envFile: string;
  mode: 'off' | 'on';
  sourceKey?: string;
  apply: boolean;
  confirmHost?: string;
  now?: Date;
}

export interface HealerCompanyWorkPublicConfig {
  enabled: boolean;
  active: boolean;
  valid: boolean;
  sourceCount: number;
  maxItems: number;
  configurationError: string | null;
}

export interface HealerCompanyWorkConfigFileResult {
  mode: 'dry-run' | 'applied' | 'unchanged';
  current: HealerCompanyWorkPublicConfig;
  target: HealerCompanyWorkPublicConfig;
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

function publicConfig(contents: string): HealerCompanyWorkPublicConfig {
  const config = resolveHealerCompanyWorkAdapterConfig(
    Object.fromEntries(
      COMPANY_HEALER_WORK_ENV_KEYS.map((key) => [
        key,
        readValue(contents, key),
      ]),
    ),
  );
  return {
    enabled: config.enabled,
    active: config.active,
    valid: config.valid,
    sourceCount: config.sourceKeys.length,
    maxItems: config.maxItems,
    configurationError: config.configurationError,
  };
}

function render(
  contents: string,
  options: HealerCompanyWorkConfigFileOptions,
): string {
  if (options.mode === 'off') {
    return replaceValue(contents, 'COMPANY_HEALER_WORK_ENABLED', '0');
  }
  if (!options.sourceKey) throw new Error('on mode requires sourceKey');
  let value = contents;
  for (const [key, entry] of Object.entries({
    COMPANY_HEALER_WORK_ENABLED: '1',
    COMPANY_HEALER_WORK_SOURCE_KEYS: options.sourceKey,
    COMPANY_HEALER_WORK_MAX_ITEMS: '1',
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

export function setHealerCompanyWorkConfig(
  options: HealerCompanyWorkConfigFileOptions,
): HealerCompanyWorkConfigFileResult {
  const stat = regularFile(options.envFile, 'environment file');
  const contents = fs.readFileSync(options.envFile, 'utf8');
  const current = publicConfig(contents);
  const rendered = render(contents, options);
  const target = publicConfig(rendered);
  if (!target.valid || (options.mode === 'on' && !target.active)) {
    throw new Error(
      `target healer Company Work configuration is invalid: ${target.configurationError}`,
    );
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
  const backupPath = `${options.envFile}.rollback-company-healer-work-${stamp}`;
  fs.copyFileSync(options.envFile, backupPath, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(backupPath, stat.mode);
  try {
    atomicWrite(options.envFile, rendered, stat.mode);
    if (fs.readFileSync(options.envFile, 'utf8') !== rendered) {
      throw new Error('healer Company Work environment verification failed');
    }
  } catch (error) {
    atomicWrite(options.envFile, contents, stat.mode);
    throw error;
  }
  return { mode: 'applied', current, target, backupPath };
}

export function restoreHealerCompanyWorkConfig(options: {
  envFile: string;
  backupFile: string;
  confirmHost: string;
}): HealerCompanyWorkConfigFileResult {
  const envStat = regularFile(options.envFile, 'environment file');
  const backupStat = regularFile(options.backupFile, 'backup');
  if (
    !options.backupFile.startsWith(
      `${options.envFile}.rollback-company-healer-work-`,
    )
  ) {
    throw new Error('backup is not a healer Company Work backup for this file');
  }
  if (options.confirmHost !== os.hostname()) {
    throw new Error(`restore requires --confirm-host ${os.hostname()}`);
  }
  const currentContents = fs.readFileSync(options.envFile, 'utf8');
  const backupContents = fs.readFileSync(options.backupFile, 'utf8');
  const current = publicConfig(currentContents);
  const target = publicConfig(backupContents);
  if (!target.valid) throw new Error('backup healer configuration is invalid');
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
