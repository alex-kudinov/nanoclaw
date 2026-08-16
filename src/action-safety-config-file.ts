import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  ACTION_SAFETY_ENV_KEYS,
  ACTION_SYSTEMS,
  resolveActionSafetyConfig,
  type ActionSafetyConfig,
  type ActionSystem,
} from './action-safety.js';

export type ActionSafetyMode = 'off' | 'global' | 'systems';

export interface ActionSafetyConfigFileOptions {
  envFile: string;
  mode: ActionSafetyMode;
  systems?: string;
  apply: boolean;
  confirmHost?: string;
  now?: Date;
}

export interface ActionSafetyConfigFileResult {
  mode: 'dry-run' | 'applied' | 'unchanged';
  current: ActionSafetyConfig;
  target: ActionSafetyConfig;
  backupPath: string | null;
}

export interface RestoreActionSafetyConfigOptions {
  envFile: string;
  backupFile: string;
  confirmHost: string;
}

export interface RestoreActionSafetyConfigResult {
  mode: 'restored' | 'unchanged';
  restored: ActionSafetyConfig;
  backupPath: string;
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

function configFromContents(contents: string): ActionSafetyConfig {
  return resolveActionSafetyConfig(
    Object.fromEntries(
      ACTION_SAFETY_ENV_KEYS.map((key) => [
        key,
        readSingleValue(contents, key),
      ]),
    ),
  );
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

function renderTarget(
  contents: string,
  mode: ActionSafetyMode,
  systems: ActionSystem[],
): string {
  const globalValue = mode === 'global' ? '1' : '0';
  const disabledValue = mode === 'systems' ? systems.join(',') : '';
  return replaceSingleValue(
    replaceSingleValue(contents, 'EXTERNAL_WRITE_SAFE_MODE', globalValue),
    'EXTERNAL_WRITE_DISABLED_SYSTEMS',
    disabledValue,
  );
}

function parseSystems(raw: string | undefined): ActionSystem[] {
  const requested = (raw ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (new Set(requested).size !== requested.length) {
    throw new Error('disabled systems list contains duplicates');
  }
  const unknown = requested.filter(
    (value) => !ACTION_SYSTEMS.includes(value as ActionSystem),
  );
  if (unknown.length > 0) {
    throw new Error(`unknown disabled system: ${unknown.join(',')}`);
  }
  return [...requested].sort() as ActionSystem[];
}

function backupName(envFile: string, now: Date): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  return `${envFile}.rollback-action-safety-${stamp}`;
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

function publicConfig(config: ActionSafetyConfig): ActionSafetyConfig {
  return {
    enforcementEnabled: config.enforcementEnabled,
    globalSafeMode: config.globalSafeMode,
    disabledSystems: [...config.disabledSystems],
    valid: config.valid,
    ...(config.errorCode ? { errorCode: config.errorCode } : {}),
  };
}

export function setActionSafetyMode(
  options: ActionSafetyConfigFileOptions,
): ActionSafetyConfigFileResult {
  const stat = assertAbsoluteRegularFile(options.envFile, 'environment file');
  const contents = fs.readFileSync(options.envFile, 'utf8');
  const current = configFromContents(contents);
  if (!current.valid) {
    throw new Error(
      `current action-safety configuration is invalid: ${current.errorCode}`,
    );
  }
  if (current.enforcementEnabled) {
    throw new Error(
      'refusing safe-mode edit while action-envelope enforcement is enabled',
    );
  }

  const systems = parseSystems(options.systems);
  if (options.mode === 'systems' && systems.length === 0) {
    throw new Error('systems mode requires at least one disabled system');
  }
  if (options.mode !== 'systems' && systems.length > 0) {
    throw new Error(`${options.mode} mode does not accept --systems`);
  }
  const rendered = renderTarget(contents, options.mode, systems);
  const target = configFromContents(rendered);
  if (!target.valid || target.enforcementEnabled) {
    throw new Error(
      `target action-safety configuration is invalid: ${target.errorCode ?? 'enforcement_enabled'}`,
    );
  }

  const baseResult = {
    current: publicConfig(current),
    target: publicConfig(target),
  };
  if (rendered === contents) {
    return { mode: 'unchanged', ...baseResult, backupPath: null };
  }
  if (!options.apply) {
    return { mode: 'dry-run', ...baseResult, backupPath: null };
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
      throw new Error('action-safety environment write verification failed');
    }
  } catch (error) {
    atomicWrite(options.envFile, contents, stat.mode);
    throw error;
  }
  return { mode: 'applied', ...baseResult, backupPath };
}

export function restoreActionSafetyConfig(
  options: RestoreActionSafetyConfigOptions,
): RestoreActionSafetyConfigResult {
  const envStat = assertAbsoluteRegularFile(
    options.envFile,
    'environment file',
  );
  const backupStat = assertAbsoluteRegularFile(options.backupFile, 'backup');
  const expectedPrefix = `${options.envFile}.rollback-action-safety-`;
  if (!options.backupFile.startsWith(expectedPrefix)) {
    throw new Error('backup path is not an action-safety backup for this file');
  }
  if (options.confirmHost !== os.hostname()) {
    throw new Error(`restore requires --confirm-host ${os.hostname()}`);
  }
  const backupContents = fs.readFileSync(options.backupFile, 'utf8');
  const restored = configFromContents(backupContents);
  if (!restored.valid) {
    throw new Error(
      `backup action-safety configuration is invalid: ${restored.errorCode}`,
    );
  }
  const currentContents = fs.readFileSync(options.envFile, 'utf8');
  if (currentContents === backupContents) {
    return {
      mode: 'unchanged',
      restored: publicConfig(restored),
      backupPath: options.backupFile,
    };
  }
  atomicWrite(options.envFile, backupContents, backupStat.mode || envStat.mode);
  if (fs.readFileSync(options.envFile, 'utf8') !== backupContents) {
    throw new Error('action-safety environment restore verification failed');
  }
  return {
    mode: 'restored',
    restored: publicConfig(restored),
    backupPath: options.backupFile,
  };
}
