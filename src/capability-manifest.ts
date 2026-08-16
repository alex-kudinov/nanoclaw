import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { readEnvFile } from './env.js';
import type { AdditionalMount, RegisteredGroup } from './types.js';

export const CAPABILITY_MANIFEST_VERSION = 1;
export const CAPABILITY_MANIFEST_ENV_KEY =
  'CAPABILITY_MANIFEST_ENFORCEMENT_ENABLED';
export const CAPABILITY_MANIFEST_GROUPS_ENV_KEY =
  'CAPABILITY_MANIFEST_ENFORCED_GROUPS';

export const CLAUDE_TOOL_NAMES = [
  'Bash',
  'Read',
  'Write',
  'Edit',
  'Glob',
  'Grep',
  'WebSearch',
  'WebFetch',
  'Task',
  'TaskOutput',
  'TaskStop',
  'TeamCreate',
  'TeamDelete',
  'SendMessage',
  'TodoWrite',
  'ToolSearch',
  'Skill',
  'NotebookEdit',
] as const;

export const MCP_TOOL_NAMES = [
  'send_message',
  'send_grader_file',
  'schedule_task',
  'list_tasks',
  'pause_task',
  'resume_task',
  'cancel_task',
  'register_group',
  'gmail_reply',
  'gmail_send',
  'gmail_search',
  'gmail_read',
  'gmail_get_thread',
  'procurement_queue',
  'procurement_caleprocure_ingest',
  'procurement_pursuit_queue',
  'procurement_review_card',
  'jobs',
] as const;

export const HOST_OPERATION_NAMES = [
  'message',
  'slack_file_message',
  'schedule_task',
  'pause_task',
  'resume_task',
  'cancel_task',
  'register_group',
  'gmail_reply',
  'gmail_send',
  'gmail_search',
  'gmail_read',
  'gmail_get_thread',
  'procurement_queue',
  'procurement_caleprocure_ingest',
  'procurement_pursuit_queue',
  'procurement_review_card',
  'jobs_mutate',
  'learn_lesson',
  'route_lesson',
  'classify_label_write',
  'classify_backfill_pending',
  'classify_backfill_confirm',
  'classify_correction_detected',
] as const;

export const MANIFEST_ACTION_CLASSES = [
  'c1_read',
  'c2_external_write',
  'c3_external_communication',
  'c4_financial',
  'c5_destructive',
] as const;

export const MANIFEST_CREDENTIAL_FAMILIES = [
  'business_db',
  'heartbeat',
  'obsidian',
  'plutio',
  'sheets',
  'smtp',
  'stripe',
  'trafft',
] as const;

export const TRACKED_AGENT_FOLDERS = [
  'archivarista',
  'booking',
  'campanero',
  'certifier',
  'chief',
  'cnpc',
  'contador',
  'courses',
  'grader',
  'heartbeat',
  'inbox',
  'mailman',
  'main',
  'newsroom',
  'procurement',
  'sales',
  'social',
] as const;

export type ClaudeToolName = (typeof CLAUDE_TOOL_NAMES)[number];
export type McpToolName = (typeof MCP_TOOL_NAMES)[number];
export type HostOperationName = (typeof HOST_OPERATION_NAMES)[number];
export type ManifestActionClass = (typeof MANIFEST_ACTION_CLASSES)[number];
export type ManifestCredentialFamily =
  (typeof MANIFEST_CREDENTIAL_FAMILIES)[number];

const MCP_HOST_OPERATION: Partial<Record<McpToolName, HostOperationName>> = {
  send_message: 'message',
  send_grader_file: 'slack_file_message',
  schedule_task: 'schedule_task',
  pause_task: 'pause_task',
  resume_task: 'resume_task',
  cancel_task: 'cancel_task',
  register_group: 'register_group',
  gmail_reply: 'gmail_reply',
  gmail_send: 'gmail_send',
  gmail_search: 'gmail_search',
  gmail_read: 'gmail_read',
  gmail_get_thread: 'gmail_get_thread',
  procurement_queue: 'procurement_queue',
  procurement_caleprocure_ingest: 'procurement_caleprocure_ingest',
  procurement_pursuit_queue: 'procurement_pursuit_queue',
  procurement_review_card: 'procurement_review_card',
  jobs: 'jobs_mutate',
};

export interface CapabilityManifestV1 {
  version: typeof CAPABILITY_MANIFEST_VERSION;
  agent: {
    folder: string;
    owner: string;
    purpose: string;
  };
  inputs: string[];
  dataDomains: string[];
  credentials: {
    families: ManifestCredentialFamily[];
  };
  tools: {
    claude: ClaudeToolName[];
    mcp: McpToolName[];
    hostOperations: HostOperationName[];
  };
  mounts: {
    base: Array<'group' | 'project' | 'global' | 'session' | 'ipc' | 'runner'>;
    additional: Array<{
      target: string;
      access: 'read_only' | 'read_write';
    }>;
  };
  network: {
    mode: 'none' | 'unrestricted_current';
    services: string[];
  };
  actions: {
    classes: ManifestActionClass[];
    approval: 'none' | 'domain_policy' | 'named_human';
  };
  runtime: {
    models: string[];
    timeoutMsMax: number;
    spawnTimeoutMsMax: number;
    idleTimeoutMsMax: number;
    memoryMbMax: number;
    cpusMax: number;
  };
  slo: {
    name: string;
    target: string;
  };
}

export interface CapabilityManifestConfig {
  enforcementEnabled: boolean;
  enforcedGroups?: string[];
  valid: boolean;
  errorCode?: 'invalid_boolean' | 'invalid_group_list';
}

export interface CapabilityProjection {
  enforced: boolean;
  manifestFolder: string | null;
  manifestFingerprint: string | null;
  fingerprint: string;
  claudeTools: string[];
  mcpTools: string[];
  hostOperations: string[];
  additionalMounts: AdditionalMount[];
  credentialFamilies: ManifestCredentialFamily[];
}

export class CapabilityManifestError extends Error {
  constructor(
    readonly code:
      | 'manifest_missing'
      | 'manifest_invalid'
      | 'manifest_runtime_drift'
      | 'manifest_operation_denied',
    readonly groupFolder: string,
    detail: string,
  ) {
    super(`Capability manifest ${code} for ${groupFolder}: ${detail}`);
    this.name = 'CapabilityManifestError';
  }
}

const ID_RE = /^[a-z][a-z0-9_-]{1,63}$/;
const TARGET_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}

function fingerprint(value: unknown): string {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex');
}

function strictBoolean(
  raw: string | undefined,
): { ok: true; value: boolean } | { ok: false } {
  if (raw === undefined || raw === '' || raw === '0' || raw === 'false') {
    return { ok: true, value: false };
  }
  if (raw === '1' || raw === 'true') return { ok: true, value: true };
  return { ok: false };
}

export function resolveCapabilityManifestConfig(
  env: Record<string, string | undefined>,
): CapabilityManifestConfig {
  const enabled = strictBoolean(env[CAPABILITY_MANIFEST_ENV_KEY]);
  if (!enabled.ok) {
    return {
      enforcementEnabled: true,
      enforcedGroups: [],
      valid: false,
      errorCode: 'invalid_boolean',
    };
  }
  const rawGroups = env[CAPABILITY_MANIFEST_GROUPS_ENV_KEY]?.trim() ?? '';
  const enforcedGroups = rawGroups
    ? rawGroups.split(',').map((value) => value.trim())
    : [];
  if (
    enforcedGroups.some(
      (folder) =>
        !ID_RE.test(folder) ||
        !TRACKED_AGENT_FOLDERS.includes(
          folder as (typeof TRACKED_AGENT_FOLDERS)[number],
        ),
    ) ||
    new Set(enforcedGroups).size !== enforcedGroups.length
  ) {
    return {
      enforcementEnabled: enabled.value,
      enforcedGroups: [],
      valid: false,
      errorCode: 'invalid_group_list',
    };
  }
  return {
    enforcementEnabled: enabled.value,
    enforcedGroups: enforcedGroups.sort(),
    valid: true,
  };
}

export function loadCapabilityManifestConfig(): CapabilityManifestConfig {
  const keys = [
    CAPABILITY_MANIFEST_ENV_KEY,
    CAPABILITY_MANIFEST_GROUPS_ENV_KEY,
  ];
  const file = readEnvFile(keys);
  const valueFor = (key: string): string | undefined =>
    Object.prototype.hasOwnProperty.call(process.env, key)
      ? process.env[key]
      : file[key];
  return resolveCapabilityManifestConfig({
    [CAPABILITY_MANIFEST_ENV_KEY]: valueFor(CAPABILITY_MANIFEST_ENV_KEY),
    [CAPABILITY_MANIFEST_GROUPS_ENV_KEY]: valueFor(
      CAPABILITY_MANIFEST_GROUPS_ENV_KEY,
    ),
  });
}

export function capabilityManifestIsEnforced(
  config: CapabilityManifestConfig,
  manifestFolder: string,
): boolean {
  return (
    config.enforcementEnabled ||
    (config.enforcedGroups ?? []).includes(manifestFolder)
  );
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  record: Record<string, unknown>,
  allowed: string[],
  label: string,
): void {
  const unexpected = Object.keys(record).filter(
    (key) => !allowed.includes(key),
  );
  const missing = allowed.filter(
    (key) => !Object.prototype.hasOwnProperty.call(record, key),
  );
  if (unexpected.length || missing.length) {
    throw new Error(
      `${label} keys differ (missing=${missing.join(',') || 'none'} unexpected=${unexpected.join(',') || 'none'})`,
    );
  }
}

function stringField(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return Number(value);
}

function enumArray<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const entries = value.map((entry) => stringField(entry, label));
  if (entries.some((entry) => !allowed.includes(entry as T))) {
    throw new Error(`${label} contains an unknown value`);
  }
  if (new Set(entries).size !== entries.length) {
    throw new Error(`${label} contains duplicates`);
  }
  return entries as T[];
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array`);
  }
  const entries = value.map((entry) => stringField(entry, label));
  if (new Set(entries).size !== entries.length) {
    throw new Error(`${label} contains duplicates`);
  }
  return entries;
}

export function validateCapabilityManifest(
  value: unknown,
  expectedFolder?: string,
): CapabilityManifestV1 {
  const root = expectRecord(value, 'manifest');
  exactKeys(
    root,
    [
      'version',
      'agent',
      'inputs',
      'dataDomains',
      'credentials',
      'tools',
      'mounts',
      'network',
      'actions',
      'runtime',
      'slo',
    ],
    'manifest',
  );
  if (root.version !== CAPABILITY_MANIFEST_VERSION) {
    throw new Error(`manifest version must be ${CAPABILITY_MANIFEST_VERSION}`);
  }

  const agent = expectRecord(root.agent, 'agent');
  exactKeys(agent, ['folder', 'owner', 'purpose'], 'agent');
  const folder = stringField(agent.folder, 'agent.folder');
  if (!ID_RE.test(folder) || (expectedFolder && folder !== expectedFolder)) {
    throw new Error('agent.folder does not match the manifest filename');
  }

  const tools = expectRecord(root.tools, 'tools');
  exactKeys(tools, ['claude', 'mcp', 'hostOperations'], 'tools');
  const credentials = expectRecord(root.credentials, 'credentials');
  exactKeys(credentials, ['families'], 'credentials');
  const mounts = expectRecord(root.mounts, 'mounts');
  exactKeys(mounts, ['base', 'additional'], 'mounts');
  if (!Array.isArray(mounts.additional)) {
    throw new Error('mounts.additional must be an array');
  }
  const additional = mounts.additional.map((entry, index) => {
    const item = expectRecord(entry, `mounts.additional[${index}]`);
    exactKeys(item, ['target', 'access'], `mounts.additional[${index}]`);
    const target = stringField(item.target, 'mount target');
    if (!TARGET_RE.test(target)) throw new Error('mount target is invalid');
    if (item.access !== 'read_only' && item.access !== 'read_write') {
      throw new Error('mount access is invalid');
    }
    return {
      target,
      access: item.access as 'read_only' | 'read_write',
    };
  });
  if (
    new Set(additional.map((mount) => mount.target)).size !== additional.length
  ) {
    throw new Error('mounts.additional contains duplicate targets');
  }

  const network = expectRecord(root.network, 'network');
  exactKeys(network, ['mode', 'services'], 'network');
  if (network.mode !== 'none' && network.mode !== 'unrestricted_current') {
    throw new Error('network.mode is invalid');
  }

  const actions = expectRecord(root.actions, 'actions');
  exactKeys(actions, ['classes', 'approval'], 'actions');
  if (
    actions.approval !== 'none' &&
    actions.approval !== 'domain_policy' &&
    actions.approval !== 'named_human'
  ) {
    throw new Error('actions.approval is invalid');
  }

  const runtime = expectRecord(root.runtime, 'runtime');
  exactKeys(
    runtime,
    [
      'models',
      'timeoutMsMax',
      'spawnTimeoutMsMax',
      'idleTimeoutMsMax',
      'memoryMbMax',
      'cpusMax',
    ],
    'runtime',
  );
  const slo = expectRecord(root.slo, 'slo');
  exactKeys(slo, ['name', 'target'], 'slo');
  const claudeTools = enumArray(
    tools.claude,
    CLAUDE_TOOL_NAMES,
    'tools.claude',
  );
  const mcpTools = enumArray(tools.mcp, MCP_TOOL_NAMES, 'tools.mcp');
  const hostOperations = enumArray(
    tools.hostOperations,
    HOST_OPERATION_NAMES,
    'tools.hostOperations',
  );
  for (const tool of mcpTools) {
    const requiredOperation = MCP_HOST_OPERATION[tool];
    if (requiredOperation && !hostOperations.includes(requiredOperation)) {
      throw new Error(
        `tools.mcp ${tool} requires host operation ${requiredOperation}`,
      );
    }
  }

  return {
    version: CAPABILITY_MANIFEST_VERSION,
    agent: {
      folder,
      owner: stringField(agent.owner, 'agent.owner'),
      purpose: stringField(agent.purpose, 'agent.purpose'),
    },
    inputs: stringArray(root.inputs, 'inputs'),
    dataDomains: stringArray(root.dataDomains, 'dataDomains'),
    credentials: {
      families: enumArray(
        credentials.families,
        MANIFEST_CREDENTIAL_FAMILIES,
        'credentials.families',
      ),
    },
    tools: {
      claude: claudeTools,
      mcp: mcpTools,
      hostOperations,
    },
    mounts: {
      base: enumArray(
        mounts.base,
        ['group', 'project', 'global', 'session', 'ipc', 'runner'] as const,
        'mounts.base',
      ),
      additional,
    },
    network: {
      mode: network.mode,
      services: enumArray(
        network.services,
        ['internet'] as const,
        'network.services',
      ),
    },
    actions: {
      classes: enumArray(
        actions.classes,
        MANIFEST_ACTION_CLASSES,
        'actions.classes',
      ),
      approval: actions.approval,
    },
    runtime: {
      models: stringArray(runtime.models, 'runtime.models'),
      timeoutMsMax: positiveInteger(
        runtime.timeoutMsMax,
        'runtime.timeoutMsMax',
      ),
      spawnTimeoutMsMax: positiveInteger(
        runtime.spawnTimeoutMsMax,
        'runtime.spawnTimeoutMsMax',
      ),
      idleTimeoutMsMax: positiveInteger(
        runtime.idleTimeoutMsMax,
        'runtime.idleTimeoutMsMax',
      ),
      memoryMbMax: positiveInteger(runtime.memoryMbMax, 'runtime.memoryMbMax'),
      cpusMax: positiveInteger(runtime.cpusMax, 'runtime.cpusMax'),
    },
    slo: {
      name: stringField(slo.name, 'slo.name'),
      target: stringField(slo.target, 'slo.target'),
    },
  };
}

export function capabilityManifestDirectory(codeRoot = process.cwd()): string {
  return path.join(codeRoot, 'capabilities');
}

export function loadCapabilityManifest(
  folder: string,
  codeRoot = process.env.NANOCLAW_CODE_ROOT || process.cwd(),
): CapabilityManifestV1 {
  if (!ID_RE.test(folder)) {
    throw new CapabilityManifestError(
      'manifest_invalid',
      folder,
      'unsafe folder name',
    );
  }
  const manifestPath = path.join(
    capabilityManifestDirectory(codeRoot),
    `${folder}.json`,
  );
  if (!fs.existsSync(manifestPath)) {
    throw new CapabilityManifestError(
      'manifest_missing',
      folder,
      'tracked manifest not found',
    );
  }
  try {
    return validateCapabilityManifest(
      JSON.parse(fs.readFileSync(manifestPath, 'utf8')),
      folder,
    );
  } catch (error) {
    if (error instanceof CapabilityManifestError) throw error;
    throw new CapabilityManifestError(
      'manifest_invalid',
      folder,
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function loadCapabilityCatalog(
  codeRoot = process.env.NANOCLAW_CODE_ROOT || process.cwd(),
): CapabilityManifestV1[] {
  return TRACKED_AGENT_FOLDERS.map((folder) =>
    loadCapabilityManifest(folder, codeRoot),
  );
}

export function capabilityManifestFingerprint(
  manifest: CapabilityManifestV1,
): string {
  return fingerprint(manifest);
}

function manifestFolderFor(groupFolder: string, isMain: boolean): string {
  return isMain ? 'main' : groupFolder;
}

export interface CapabilityRuntimeDefaults {
  model: string;
  timeoutMs: number;
  spawnTimeoutMs: number;
  idleTimeoutMs: number;
  memoryMb: number;
  cpus: number;
}

function configuredMountTarget(mount: AdditionalMount): string {
  return (mount.containerPath || path.basename(mount.hostPath))
    .replace(/^\/workspace\/extra\//, '')
    .replace(/^\/+/, '');
}

export function parseContainerMemoryMb(raw: string): number | null {
  const match = raw.trim().match(/^(\d+(?:\.\d+)?)\s*([kmgt]?)b?$/i);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier =
    unit === 't'
      ? 1024 * 1024
      : unit === 'g'
        ? 1024
        : unit === 'k'
          ? 1 / 1024
          : 1;
  const memoryMb = value * multiplier;
  return Number.isFinite(memoryMb) && memoryMb > 0 ? Math.ceil(memoryMb) : null;
}

function assertRuntimeWithinManifest(
  group: RegisteredGroup,
  manifest: CapabilityManifestV1,
  defaults: CapabilityRuntimeDefaults,
): void {
  const model = group.containerConfig?.model?.trim() || defaults.model;
  const configuredMemory = group.containerConfig?.memory
    ? parseContainerMemoryMb(group.containerConfig.memory)
    : defaults.memoryMb;
  if (configuredMemory === null) {
    throw new CapabilityManifestError(
      'manifest_runtime_drift',
      group.folder,
      'memory configuration is invalid',
    );
  }
  const checks: Array<[boolean, string]> = [
    [manifest.runtime.models.includes(model), `model ${model}`],
    [
      (group.containerConfig?.timeout ?? defaults.timeoutMs) <=
        manifest.runtime.timeoutMsMax,
      'timeout',
    ],
    [
      (group.containerConfig?.spawnTimeout ?? defaults.spawnTimeoutMs) <=
        manifest.runtime.spawnTimeoutMsMax,
      'spawn timeout',
    ],
    [
      (group.containerConfig?.idleTimeout ?? defaults.idleTimeoutMs) <=
        manifest.runtime.idleTimeoutMsMax,
      'idle timeout',
    ],
    [configuredMemory <= manifest.runtime.memoryMbMax, 'memory'],
    [
      (group.containerConfig?.cpus ?? defaults.cpus) <=
        manifest.runtime.cpusMax,
      'CPU',
    ],
  ];
  const failed = checks.find(([ok]) => !ok);
  if (failed) {
    throw new CapabilityManifestError(
      'manifest_runtime_drift',
      group.folder,
      `${failed[1]} exceeds the declared ceiling`,
    );
  }
}

export function projectGroupCapabilities(opts: {
  group: RegisteredGroup;
  isMain: boolean;
  defaults: CapabilityRuntimeDefaults;
  codeRoot?: string;
  config?: CapabilityManifestConfig;
}): CapabilityProjection {
  const config = opts.config ?? loadCapabilityManifestConfig();
  const selectedFolder = manifestFolderFor(opts.group.folder, opts.isMain);
  const enforced = capabilityManifestIsEnforced(config, selectedFolder);
  let manifest: CapabilityManifestV1 | null = null;
  let manifestError: unknown;
  try {
    manifest = loadCapabilityManifest(selectedFolder, opts.codeRoot);
  } catch (error) {
    manifestError = error;
  }

  if (!config.valid || (enforced && !manifest)) {
    if (manifestError instanceof CapabilityManifestError) throw manifestError;
    throw new CapabilityManifestError(
      'manifest_invalid',
      selectedFolder,
      config.errorCode ?? 'configuration is invalid',
    );
  }

  const additionalMounts = opts.group.containerConfig?.additionalMounts ?? [];
  if (!enforced) {
    const manifestFingerprint = manifest
      ? capabilityManifestFingerprint(manifest)
      : null;
    return {
      enforced: false,
      manifestFolder: manifest?.agent.folder ?? null,
      manifestFingerprint,
      fingerprint: fingerprint({
        mode: 'compatibility',
        manifestFingerprint,
        claudeTools: CLAUDE_TOOL_NAMES,
        mcpTools: MCP_TOOL_NAMES,
        credentialFamilies: MANIFEST_CREDENTIAL_FAMILIES,
      }),
      claudeTools: [...CLAUDE_TOOL_NAMES],
      mcpTools: [...MCP_TOOL_NAMES],
      hostOperations: [...HOST_OPERATION_NAMES],
      additionalMounts,
      credentialFamilies: [...MANIFEST_CREDENTIAL_FAMILIES],
    };
  }

  const exactManifest = manifest!;
  assertRuntimeWithinManifest(opts.group, exactManifest, opts.defaults);
  const expectedBaseMounts = opts.isMain
    ? ['group', 'project', 'session', 'ipc', 'runner']
    : ['group', 'global', 'session', 'ipc', 'runner'];
  if (
    stableJson([...exactManifest.mounts.base].sort()) !==
    stableJson(expectedBaseMounts.sort())
  ) {
    throw new CapabilityManifestError(
      'manifest_runtime_drift',
      opts.group.folder,
      'base mounts differ from the host launch plan',
    );
  }
  const declaredMounts = new Map(
    exactManifest.mounts.additional.map((mount) => [
      mount.target,
      mount.access,
    ]),
  );
  for (const mount of additionalMounts) {
    const target = configuredMountTarget(mount);
    const declared = declaredMounts.get(target);
    const requested = mount.readonly === false ? 'read_write' : 'read_only';
    if (
      !declared ||
      (requested === 'read_write' && declared !== 'read_write')
    ) {
      throw new CapabilityManifestError(
        'manifest_runtime_drift',
        opts.group.folder,
        `mount ${target}/${requested} is not declared`,
      );
    }
  }
  const manifestFingerprint = capabilityManifestFingerprint(exactManifest);
  return {
    enforced: true,
    manifestFolder: exactManifest.agent.folder,
    manifestFingerprint,
    fingerprint: fingerprint({
      mode: 'enforced',
      manifestFingerprint,
      claudeTools: exactManifest.tools.claude,
      mcpTools: exactManifest.tools.mcp,
      credentialFamilies: exactManifest.credentials.families,
      mounts: additionalMounts.map((mount) => ({
        target: configuredMountTarget(mount),
        access: mount.readonly === false ? 'read_write' : 'read_only',
      })),
    }),
    claudeTools: [...exactManifest.tools.claude],
    mcpTools: [...exactManifest.tools.mcp],
    hostOperations: [...exactManifest.tools.hostOperations],
    additionalMounts,
    credentialFamilies: [...exactManifest.credentials.families],
  };
}

export function manifestAllowsHostOperation(
  groupFolder: string,
  isMain: boolean,
  operation: string,
  opts?: {
    codeRoot?: string;
    config?: CapabilityManifestConfig;
  },
): boolean {
  const config = opts?.config ?? loadCapabilityManifestConfig();
  if (!config.valid) return false;
  if (
    !capabilityManifestIsEnforced(
      config,
      manifestFolderFor(groupFolder, isMain),
    )
  )
    return true;
  try {
    const manifest = loadCapabilityManifest(
      manifestFolderFor(groupFolder, isMain),
      opts?.codeRoot,
    );
    return manifest.tools.hostOperations.includes(
      operation as HostOperationName,
    );
  } catch {
    return false;
  }
}

export function assertManifestHostOperation(
  groupFolder: string,
  isMain: boolean,
  operation: string,
  opts?: {
    codeRoot?: string;
    config?: CapabilityManifestConfig;
  },
): void {
  if (!manifestAllowsHostOperation(groupFolder, isMain, operation, opts)) {
    throw new CapabilityManifestError(
      'manifest_operation_denied',
      groupFolder,
      operation,
    );
  }
}

export function capabilityFingerprintIsCurrent(opts: {
  group: RegisteredGroup;
  isMain: boolean;
  recordedFingerprint?: string | null;
  defaults: CapabilityRuntimeDefaults;
  codeRoot?: string;
  config?: CapabilityManifestConfig;
}): boolean {
  const config = opts.config ?? loadCapabilityManifestConfig();
  if (!config.valid) return false;
  if (
    !capabilityManifestIsEnforced(
      config,
      manifestFolderFor(opts.group.folder, opts.isMain),
    )
  )
    return true;
  if (!opts.recordedFingerprint) return false;
  try {
    return (
      projectGroupCapabilities({
        group: opts.group,
        isMain: opts.isMain,
        defaults: opts.defaults,
        codeRoot: opts.codeRoot,
        config,
      }).fingerprint === opts.recordedFingerprint
    );
  } catch {
    return false;
  }
}

export function assertCapabilityCatalogForGroups(
  groups: Record<string, RegisteredGroup>,
  opts?: {
    codeRoot?: string;
    config?: CapabilityManifestConfig;
  },
): void {
  const config = opts?.config ?? loadCapabilityManifestConfig();
  if (!config.valid) {
    throw new CapabilityManifestError(
      'manifest_invalid',
      'catalog',
      config.errorCode ?? 'configuration is invalid',
    );
  }
  const registeredFolders = new Set(
    Object.values(groups).map((group) =>
      manifestFolderFor(group.folder, group.isMain === true),
    ),
  );
  for (const folder of config.enforcedGroups ?? []) {
    if (!registeredFolders.has(folder)) {
      throw new CapabilityManifestError(
        'manifest_invalid',
        folder,
        'configured group is not registered',
      );
    }
  }
  if (!config.enforcementEnabled && !(config.enforcedGroups ?? []).length)
    return;
  for (const group of Object.values(groups)) {
    const folder = manifestFolderFor(group.folder, group.isMain === true);
    if (capabilityManifestIsEnforced(config, folder)) {
      loadCapabilityManifest(folder, opts?.codeRoot);
    }
  }
}

export function getCapabilityManifestStatus(
  codeRoot = process.env.NANOCLAW_CODE_ROOT || process.cwd(),
): {
  config: CapabilityManifestConfig;
  trackedManifestCount: number;
  validManifestCount: number;
  invalidManifestCount: number;
} {
  const config = loadCapabilityManifestConfig();
  let validManifestCount = 0;
  for (const folder of TRACKED_AGENT_FOLDERS) {
    try {
      loadCapabilityManifest(folder, codeRoot);
      validManifestCount++;
    } catch {
      // Aggregate only: do not put manifest contents or host paths in health.
    }
  }
  return {
    config,
    trackedManifestCount: TRACKED_AGENT_FOLDERS.length,
    validManifestCount,
    invalidManifestCount: TRACKED_AGENT_FOLDERS.length - validManifestCount,
  };
}
