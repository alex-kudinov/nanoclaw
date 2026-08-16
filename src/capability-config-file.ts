import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  CAPABILITY_MANIFEST_ENV_KEY,
  CAPABILITY_MANIFEST_GROUPS_ENV_KEY,
  resolveCapabilityManifestConfig,
} from './capability-manifest.js';

export interface CapabilityGroupConfigOptions {
  envFile: string;
  groups: string;
  apply: boolean;
  confirmHost?: string;
  now?: Date;
}

export interface CapabilityGroupConfigResult {
  mode: 'dry-run' | 'applied' | 'unchanged';
  currentGroups: string[];
  targetGroups: string[];
  globalEnforcementEnabled: boolean;
  backupPath: string | null;
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
  const lines = contents.split(/\r?\n/);
  const index = lines.findIndex((line) => {
    if (line.trimStart().startsWith('#')) return false;
    const separator = line.indexOf('=');
    return separator !== -1 && line.slice(0, separator).trim() === key;
  });
  if (index === -1) {
    const suffix = contents.endsWith('\n') ? '' : '\n';
    return `${contents}${suffix}${key}=${value}\n`;
  }
  lines[index] = `${key}=${value}`;
  return lines.join('\n');
}

function backupName(envFile: string, now: Date): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  return `${envFile}.rollback-capabilities-${stamp}`;
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

export function setCapabilityEnforcedGroups(
  options: CapabilityGroupConfigOptions,
): CapabilityGroupConfigResult {
  if (!path.isAbsolute(options.envFile)) {
    throw new Error('environment file path must be absolute');
  }
  const stat = fs.lstatSync(options.envFile);
  if (!stat.isFile())
    throw new Error('environment file must be a regular file');
  const contents = fs.readFileSync(options.envFile, 'utf8');
  const globalValue = readSingleValue(contents, CAPABILITY_MANIFEST_ENV_KEY);
  const currentValue =
    readSingleValue(contents, CAPABILITY_MANIFEST_GROUPS_ENV_KEY) ?? '';
  const targetValue = options.groups.trim();
  const currentConfig = resolveCapabilityManifestConfig({
    [CAPABILITY_MANIFEST_ENV_KEY]: globalValue,
    [CAPABILITY_MANIFEST_GROUPS_ENV_KEY]: currentValue,
  });
  const targetConfig = resolveCapabilityManifestConfig({
    [CAPABILITY_MANIFEST_ENV_KEY]: globalValue,
    [CAPABILITY_MANIFEST_GROUPS_ENV_KEY]: targetValue,
  });
  if (!currentConfig.valid) {
    throw new Error(
      `current capability configuration is invalid: ${currentConfig.errorCode}`,
    );
  }
  if (currentConfig.enforcementEnabled) {
    throw new Error(
      'refusing staged activation while global enforcement is enabled',
    );
  }
  if (!targetConfig.valid) {
    throw new Error(
      `target capability configuration is invalid: ${targetConfig.errorCode}`,
    );
  }
  const currentGroups = currentConfig.enforcedGroups ?? [];
  const targetGroups = targetConfig.enforcedGroups ?? [];
  const baseResult = {
    currentGroups,
    targetGroups,
    globalEnforcementEnabled: false,
  };
  if (currentGroups.join(',') === targetGroups.join(',')) {
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
    atomicWrite(
      options.envFile,
      replaceSingleValue(
        contents,
        CAPABILITY_MANIFEST_GROUPS_ENV_KEY,
        targetGroups.join(','),
      ),
      stat.mode,
    );
  } catch (error) {
    fs.copyFileSync(backupPath, options.envFile);
    fs.chmodSync(options.envFile, stat.mode);
    throw error;
  }
  return { mode: 'applied', ...baseResult, backupPath };
}
