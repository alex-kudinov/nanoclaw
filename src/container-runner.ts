/**
 * Container Runner for NanoClaw
 * Spawns agent execution in containers and handles IPC
 */
import { ChildProcess, exec, spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import os from 'os';

import {
  CONTAINER_IMAGE,
  CONTAINER_MAX_OUTPUT_SIZE,
  CONTAINER_TIMEOUT,
  DATA_DIR,
  GROUPS_DIR,
  IDLE_TIMEOUT,
  SPAWN_TIMEOUT,
  TIMEZONE,
} from './config.js';
import { readEnvFile } from './env.js';
import { resolveGroupFolderPath, resolveGroupIpcPath } from './group-folder.js';
import { logger } from './logger.js';
import {
  CONTAINER_RUNTIME_BIN,
  readonlyMountArgs,
  stopContainer,
} from './container-runtime.js';
import { validateAdditionalMounts } from './mount-security.js';
import { RegisteredGroup } from './types.js';

/**
 * Resolve an OAuth token from the token pool via round-robin rotation.
 * Reads data/.token-pool.json (array of {name, token} entries) and
 * data/.token-cursor (integer index). Each call advances the cursor
 * so consecutive container spawns spread across all available tokens.
 * Returns undefined if the pool file is missing/empty.
 */
export function resolveOAuthToken(): string | undefined {
  const poolFile = path.join(process.cwd(), 'data', '.token-pool.json');
  const cursorFile = path.join(process.cwd(), 'data', '.token-cursor');

  try {
    const raw = fs.readFileSync(poolFile, 'utf-8');
    const pool: Array<{ name: string; token: string }> = JSON.parse(raw);
    if (!pool.length) return undefined;

    let cursor = 0;
    try {
      cursor = parseInt(fs.readFileSync(cursorFile, 'utf-8').trim(), 10) || 0;
    } catch {
      // first run — start at 0
    }

    const idx = cursor % pool.length;
    const entry = pool[idx];
    const next = (cursor + 1) % pool.length;

    try {
      fs.writeFileSync(cursorFile, String(next), 'utf-8');
    } catch {
      // non-fatal — rotation still works, just won't advance
    }

    logger.info(
      { account: entry.name, index: idx, poolSize: pool.length },
      'Token pool rotation',
    );
    return entry.token;
  } catch (err) {
    logger.debug({ err }, 'Token pool not available, will fall back to .env');
  }
  return undefined;
}

// Sentinel markers for robust output parsing (must match agent-runner)
const OUTPUT_START_MARKER = '---NANOCLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---NANOCLAW_OUTPUT_END---';
const HEARTBEAT_MARKER = '---NANOCLAW_HEARTBEAT---';

export interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  isScheduledTask?: boolean;
  assistantName?: string;
  secrets?: Record<string, string>;
}

export interface ContainerOutput {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
}

interface VolumeMount {
  hostPath: string;
  containerPath: string;
  readonly: boolean;
}

function computeDirHash(dir: string): string {
  const hash = crypto.createHash('md5');
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.ts') || f.endsWith('.json'))
    .sort();
  for (const file of files) {
    hash.update(`${file}\n`);
    hash.update(fs.readFileSync(path.join(dir, file), 'utf-8'));
  }
  return hash.digest('hex');
}

function buildVolumeMounts(
  group: RegisteredGroup,
  isMain: boolean,
): VolumeMount[] {
  const mounts: VolumeMount[] = [];
  const projectRoot = process.cwd();
  const groupDir = resolveGroupFolderPath(group.folder);

  if (isMain) {
    // Main gets the project root read-only. Writable paths the agent needs
    // (group folder, IPC, .claude/) are mounted separately below.
    // Read-only prevents the agent from modifying host application code
    // (src/, dist/, package.json, etc.) which would bypass the sandbox
    // entirely on next restart.
    mounts.push({
      hostPath: projectRoot,
      containerPath: '/workspace/project',
      readonly: true,
    });

    // Shadow .env so the agent cannot read secrets from the mounted project root.
    // Secrets are passed via stdin instead (see readSecrets()).
    const envFile = path.join(projectRoot, '.env');
    if (fs.existsSync(envFile)) {
      mounts.push({
        hostPath: '/dev/null',
        containerPath: '/workspace/project/.env',
        readonly: true,
      });
    }

    // Main also gets its group folder as the working directory
    mounts.push({
      hostPath: groupDir,
      containerPath: '/workspace/group',
      readonly: false,
    });
  } else {
    // Other groups only get their own folder
    mounts.push({
      hostPath: groupDir,
      containerPath: '/workspace/group',
      readonly: false,
    });

    // Global memory directory (read-only for non-main)
    // Only directory mounts are supported, not file mounts
    const globalDir = path.join(GROUPS_DIR, 'global');
    if (fs.existsSync(globalDir)) {
      mounts.push({
        hostPath: globalDir,
        containerPath: '/workspace/global',
        readonly: true,
      });
    }
  }

  // Per-group Claude sessions directory (isolated from other groups)
  // Each group gets their own .claude/ to prevent cross-group session access
  const groupSessionsDir = path.join(
    DATA_DIR,
    'sessions',
    group.folder,
    '.claude',
  );
  fs.mkdirSync(groupSessionsDir, { recursive: true });
  // Always overwrite settings.json to keep hooks and env current
  const settingsFile = path.join(groupSessionsDir, 'settings.json');
  fs.writeFileSync(
    settingsFile,
    JSON.stringify(
      {
        env: {
          CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
          CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: '1',
          CLAUDE_CODE_DISABLE_AUTO_MEMORY: '0',
        },
        hooks: {
          PreCompact: [
            {
              hooks: [
                {
                  type: 'command',
                  command: 'node /app/hooks/pre-compact-archive.js',
                  timeout: 30000,
                },
              ],
            },
          ],
          PreToolUse: [
            {
              matcher: 'Bash',
              hooks: [
                {
                  type: 'command',
                  command: 'node /app/hooks/sanitize-bash.js',
                  timeout: 5000,
                },
              ],
            },
          ],
        },
      },
      null,
      2,
    ) + '\n',
  );

  // Sync skills from container/skills/ into each group's .claude/skills/
  const skillsSrc = path.join(process.cwd(), 'container', 'skills');
  const skillsDst = path.join(groupSessionsDir, 'skills');
  if (fs.existsSync(skillsSrc)) {
    for (const skillDir of fs.readdirSync(skillsSrc)) {
      const srcDir = path.join(skillsSrc, skillDir);
      if (!fs.statSync(srcDir).isDirectory()) continue;
      const dstDir = path.join(skillsDst, skillDir);
      fs.cpSync(srcDir, dstDir, { recursive: true });
    }
  }
  mounts.push({
    hostPath: groupSessionsDir,
    containerPath: '/home/node/.claude',
    readonly: false,
  });

  // Per-group IPC namespace: each group gets its own IPC directory
  // This prevents cross-group privilege escalation via IPC
  const groupIpcDir = resolveGroupIpcPath(group.folder);
  fs.mkdirSync(path.join(groupIpcDir, 'messages'), { recursive: true });
  fs.mkdirSync(path.join(groupIpcDir, 'tasks'), { recursive: true });
  fs.mkdirSync(path.join(groupIpcDir, 'input'), { recursive: true });
  // ack/ — agent-runner writes one file per piped message it reads,
  // so the host can remove the message from its dead-letter tracking.
  fs.mkdirSync(path.join(groupIpcDir, 'ack'), { recursive: true });
  mounts.push({
    hostPath: groupIpcDir,
    containerPath: '/workspace/ipc',
    readonly: false,
  });

  // Copy agent-runner source into a per-group writable location so agents
  // can customize it (add tools, change behavior) without affecting other
  // groups. Recompiled on container startup via entrypoint.sh.
  // Version hash invalidates stale copies when source changes.
  const agentRunnerSrc = path.join(
    projectRoot,
    'container',
    'agent-runner',
    'src',
  );
  const groupAgentRunnerDir = path.join(
    DATA_DIR,
    'sessions',
    group.folder,
    'agent-runner-src',
  );
  if (fs.existsSync(agentRunnerSrc)) {
    const sourceHash = computeDirHash(agentRunnerSrc);
    const versionFile = path.join(groupAgentRunnerDir, '.version');
    const existingHash = fs.existsSync(versionFile)
      ? fs.readFileSync(versionFile, 'utf-8').trim()
      : '';
    if (sourceHash !== existingHash) {
      if (fs.existsSync(groupAgentRunnerDir)) {
        fs.rmSync(groupAgentRunnerDir, { recursive: true });
      }
      fs.cpSync(agentRunnerSrc, groupAgentRunnerDir, { recursive: true });
      fs.writeFileSync(path.join(groupAgentRunnerDir, '.version'), sourceHash);
      logger.debug(
        { group: group.name, hash: sourceHash },
        'Agent runner source updated',
      );
    }
  }
  mounts.push({
    hostPath: groupAgentRunnerDir,
    containerPath: '/app/src',
    readonly: false,
  });

  // Additional mounts validated against external allowlist (tamper-proof from containers)
  if (group.containerConfig?.additionalMounts) {
    const validatedMounts = validateAdditionalMounts(
      group.containerConfig.additionalMounts,
      group.name,
      isMain,
    );
    mounts.push(...validatedMounts);
  }

  return mounts;
}

/**
 * Build secrets payload for the container.
 * Auth: CLAUDE_CODE_OAUTH_TOKEN resolved from cctoken rotation
 * (~/.shared/.claude-tokens.json), falling back to .env.
 * CLAUDE_CONFIG_DIR points to the mounted .claude dir for settings/skills.
 */
async function readSecrets(
  groupFolder?: string,
): Promise<Record<string, string>> {
  const configured = readEnvFile([
    'CLAUDE_CODE_OAUTH_TOKEN',
    'BUSINESS_DB_HOST',
    'BUSINESS_DB_PORT',
    'BUSINESS_DB_NAME',
    'BUSINESS_DB_ROLE_INBOX',
    'BUSINESS_DB_PASS_INBOX',
    'BUSINESS_DB_ROLE_SALES',
    'BUSINESS_DB_PASS_SALES',
    'BUSINESS_DB_ROLE_CHIEF',
    'BUSINESS_DB_PASS_CHIEF',
    'BUSINESS_DB_ROLE_ADMIN',
    'BUSINESS_DB_PASS_ADMIN',
    'BUSINESS_DB_ROLE_CONTADOR',
    'BUSINESS_DB_PASS_CONTADOR',
    'BUSINESS_DB_ROLE_MAILMAN',
    'BUSINESS_DB_PASS_MAILMAN',
    'STRIPE_RESTRICTED_KEY',
    'STRIPE_SECRET_KEY_ALT',
    'SHEETS_PAYMENTS_ID',
    'SHEETS_ROSTER_ID',
    'OBSIDIAN_API_KEY',
    'BUSINESS_DB_ROLE_BOOKING',
    'BUSINESS_DB_PASS_BOOKING',
    'BUSINESS_DB_ROLE_PROCUREMENT',
    'BUSINESS_DB_PASS_PROCUREMENT',
    'TRAFFT_API_URL',
    'TRAFFT_CLIENT_ID',
    'TRAFFT_CLIENT_SECRET',
    'PLUTIO_API_CLIENTID',
    'PLUTIO_API_CLIENTSECRET',
    'PLUTIO_SUBDOMAIN',
    'BONFIRE_USERNAME',
    'BONFIRE_PASSWORD',
    'HEARTBEAT_API_KEY',
    'EMAIL_USER',
    'EMAIL_PASS',
  ]);

  const oauthToken = resolveOAuthToken() || configured.CLAUDE_CODE_OAUTH_TOKEN;
  if (!oauthToken) {
    throw new Error(
      'CLAUDE_CODE_OAUTH_TOKEN not resolved — ensure ~/.shared/.claude-tokens.json exists (source ~/.shared/.shared_shell.sh) or set in .env',
    );
  }

  // Pass the full token pool so the container can retry on rate-limit
  let tokenPool = '';
  try {
    tokenPool = fs.readFileSync(
      path.join(process.cwd(), 'data', '.token-pool.json'),
      'utf-8',
    );
  } catch {
    // pool unavailable — single-token mode
  }

  const secrets: Record<string, string> = {
    CLAUDE_CONFIG_DIR: '/home/node/.claude',
    CLAUDE_CODE_OAUTH_TOKEN: oauthToken,
    ...(tokenPool ? { CLAUDE_TOKEN_POOL: tokenPool } : {}),
  };

  // Add per-agent business DB credentials
  const dbHost = configured.BUSINESS_DB_HOST;
  const dbPort = configured.BUSINESS_DB_PORT;
  const dbName = configured.BUSINESS_DB_NAME;
  if (dbHost && dbName && groupFolder) {
    const roleMap: Record<string, { role: string; pass: string }> = {
      inbox: {
        role: configured.BUSINESS_DB_ROLE_INBOX || '',
        pass: configured.BUSINESS_DB_PASS_INBOX || '',
      },
      sales: {
        role: configured.BUSINESS_DB_ROLE_SALES || '',
        pass: configured.BUSINESS_DB_PASS_SALES || '',
      },
      chief: {
        role: configured.BUSINESS_DB_ROLE_CHIEF || '',
        pass: configured.BUSINESS_DB_PASS_CHIEF || '',
      },
      main: {
        role: configured.BUSINESS_DB_ROLE_ADMIN || '',
        pass: configured.BUSINESS_DB_PASS_ADMIN || '',
      },
      contador: {
        role: configured.BUSINESS_DB_ROLE_CONTADOR || '',
        pass: configured.BUSINESS_DB_PASS_CONTADOR || '',
      },
      mailman: {
        role: configured.BUSINESS_DB_ROLE_MAILMAN || '',
        pass: configured.BUSINESS_DB_PASS_MAILMAN || '',
      },
      booking: {
        role: configured.BUSINESS_DB_ROLE_BOOKING || '',
        pass: configured.BUSINESS_DB_PASS_BOOKING || '',
      },
      procurement: {
        role: configured.BUSINESS_DB_ROLE_PROCUREMENT || '',
        pass: configured.BUSINESS_DB_PASS_PROCUREMENT || '',
      },
    };
    const creds = roleMap[groupFolder];
    if (creds?.role && creds?.pass) {
      secrets.BUSINESS_DB_URL = `postgresql://${creds.role}:${encodeURIComponent(creds.pass)}@${dbHost}:${dbPort || '5432'}/${dbName}`;
      const agent = groupFolder ?? 'unknown';
      if (!/^[a-z0-9_-]+$/i.test(agent)) {
        throw new Error(`Unsafe groupFolder for PGOPTIONS: ${agent}`);
      }
      const q = (v: string) =>
        `'${v.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
      secrets.PGOPTIONS = `-c app.current_agent=${q(agent)} -c app.current_agent_role=${q(creds.role)}`;
    }
  }

  // Inject Obsidian REST API key for El Archivarista
  if (groupFolder === 'archivarista') {
    const obsidianKey = configured.OBSIDIAN_API_KEY;
    if (obsidianKey) {
      secrets.OBSIDIAN_API_KEY = obsidianKey;
    }
  }

  // Inject Trafft API credentials for Booking Coordinator
  if (groupFolder === 'booking') {
    if (configured.TRAFFT_API_URL) {
      secrets.TRAFFT_API_URL = configured.TRAFFT_API_URL;
    }
    if (configured.TRAFFT_CLIENT_ID) {
      secrets.TRAFFT_CLIENT_ID = configured.TRAFFT_CLIENT_ID;
    }
    if (configured.TRAFFT_CLIENT_SECRET) {
      secrets.TRAFFT_CLIENT_SECRET = configured.TRAFFT_CLIENT_SECRET;
    }
  }

  // Inject credentials + path overrides for Course Session Coordinator
  if (groupFolder === 'courses') {
    const hbKey = configured.HEARTBEAT_API_KEY;
    if (hbKey) secrets.HEARTBEAT_API_KEY = hbKey;
    if (configured.EMAIL_USER) secrets.EMAIL_USER = configured.EMAIL_USER;
    if (configured.EMAIL_PASS) secrets.EMAIL_PASS = configured.EMAIL_PASS;
    // Container path overrides for distribute_session.py
    secrets.INSTRUCTORS_DIR = '/workspace/extra/instructors';
    secrets.EMAIL_TOOL = '/workspace/extra/email/send-email.sh';
    secrets.TOOLBOX_ROOT = '/workspace/extra';
  }

  // Inject Plutio credentials for agents that use Plutio tools
  if (['inbox', 'booking', 'sales', 'certifier'].includes(groupFolder || '')) {
    for (const key of [
      'PLUTIO_API_CLIENTID',
      'PLUTIO_API_CLIENTSECRET',
      'PLUTIO_SUBDOMAIN',
    ] as const) {
      if (configured[key]) secrets[key] = configured[key];
    }
  }

  // Inject Bonfire credentials + browser stealth config for Procurement Scout
  if (groupFolder === 'procurement') {
    if (configured.BONFIRE_USERNAME) {
      secrets.BONFIRE_USERNAME = configured.BONFIRE_USERNAME;
    }
    if (configured.BONFIRE_PASSWORD) {
      secrets.BONFIRE_PASSWORD = configured.BONFIRE_PASSWORD;
    }
    // CDP bridge: connect to a real Chrome on the Mac Mini host.
    // Chrome runs with a persistent profile (cookies, history, cache) which
    // bypasses Cloudflare bot detection on Bonfire agency subdomains.
    // Port 9250 is forwarded to the container network via socat.
    // Fetch the dynamic WebSocket URL from Chrome's /json/version endpoint.
    const CDP_HOST = '192.168.64.1';
    const CDP_PORT = 9250;
    let cdpUrl = '';
    try {
      const resp = await fetch(`http://${CDP_HOST}:${CDP_PORT}/json/version`);
      const data = (await resp.json()) as { webSocketDebuggerUrl?: string };
      cdpUrl = data.webSocketDebuggerUrl || '';
    } catch {
      logger.warn(
        'Procurement CDP bridge unreachable — browser scraping will fall back to in-container',
      );
    }
    if (cdpUrl) {
      const procGroupDir = resolveGroupFolderPath(groupFolder);
      const browserConfigPath = path.join(procGroupDir, 'agent-browser.json');
      // Downloads save to the HOST filesystem (Chrome runs on host).
      // Point to the host vault path so PDFs land where the container can read them.
      const hostVaultPath = path.join(
        os.homedir(),
        'Vaults',
        'My Notes',
        'Tandem',
        'Procurement',
      );
      fs.writeFileSync(
        browserConfigPath,
        JSON.stringify({ cdp: cdpUrl, downloadPath: hostVaultPath }, null, 2) +
          '\n',
      );
      secrets.AGENT_BROWSER_CONFIG = '/workspace/group/agent-browser.json';
    }
  }

  // Inject Stripe + Sheets secrets for El Contador
  if (groupFolder === 'contador') {
    if (configured.STRIPE_RESTRICTED_KEY) {
      secrets.STRIPE_RESTRICTED_KEY = configured.STRIPE_RESTRICTED_KEY;
    }
    if (configured.STRIPE_SECRET_KEY_ALT) {
      secrets.STRIPE_SECRET_KEY_ALT = configured.STRIPE_SECRET_KEY_ALT;
    }
    if (configured.SHEETS_PAYMENTS_ID) {
      secrets.SHEETS_PAYMENTS_ID = configured.SHEETS_PAYMENTS_ID;
    }
    if (configured.SHEETS_ROSTER_ID) {
      secrets.SHEETS_ROSTER_ID = configured.SHEETS_ROSTER_ID;
    }
  }

  return secrets;
}

function buildContainerArgs(
  mounts: VolumeMount[],
  containerName: string,
): string[] {
  const args: string[] = ['run', '-i', '--rm', '--name', containerName];

  // Apple Container's VM network doesn't inherit host DNS — specify explicitly.
  args.push('--dns', '192.168.1.1');

  // Pass host timezone so container's local time matches the user's
  args.push('-e', `TZ=${TIMEZONE}`);

  // Run as host user so bind-mounted files are accessible.
  // Skip when running as root (uid 0), as the container's node user (uid 1000),
  // or when getuid is unavailable (native Windows without WSL).
  const hostUid = process.getuid?.();
  const hostGid = process.getgid?.();
  if (hostUid != null && hostUid !== 0 && hostUid !== 1000) {
    args.push('--user', `${hostUid}:${hostGid}`);
    args.push('-e', 'HOME=/home/node');
  }

  for (const mount of mounts) {
    if (mount.readonly) {
      args.push(...readonlyMountArgs(mount.hostPath, mount.containerPath));
    } else {
      args.push('-v', `${mount.hostPath}:${mount.containerPath}`);
    }
  }

  args.push(CONTAINER_IMAGE);

  return args;
}

export async function runContainerAgent(
  group: RegisteredGroup,
  input: ContainerInput,
  onProcess: (proc: ChildProcess, containerName: string) => void,
  onOutput?: (output: ContainerOutput) => Promise<void>,
  onActivity?: () => void,
): Promise<ContainerOutput> {
  const startTime = Date.now();

  const groupDir = resolveGroupFolderPath(group.folder);
  fs.mkdirSync(groupDir, { recursive: true });

  const mounts = buildVolumeMounts(group, input.isMain);
  const safeName = group.folder.replace(/[^a-zA-Z0-9-]/g, '-');
  const containerName = `nanoclaw-${safeName}-${Date.now()}`;
  const containerArgs = buildContainerArgs(mounts, containerName);

  logger.debug(
    {
      group: group.name,
      containerName,
      mounts: mounts.map(
        (m) =>
          `${m.hostPath} -> ${m.containerPath}${m.readonly ? ' (ro)' : ''}`,
      ),
      containerArgs: containerArgs.join(' '),
    },
    'Container mount configuration',
  );

  logger.info(
    {
      group: group.name,
      containerName,
      mountCount: mounts.length,
      isMain: input.isMain,
    },
    'Spawning container agent',
  );

  const logsDir = path.join(groupDir, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });

  // Resolve secrets before spawning (async for CDP URL fetch)
  const resolvedSecrets = await readSecrets(input.groupFolder);

  return new Promise((resolve) => {
    const container = spawn(CONTAINER_RUNTIME_BIN, containerArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    onProcess(container, containerName);

    let stdout = '';
    let stderr = '';
    let stdoutTruncated = false;
    let stderrTruncated = false;

    // Pass secrets via stdin (never written to disk or mounted as files)
    input.secrets = resolvedSecrets;
    container.stdin.write(JSON.stringify(input));
    container.stdin.end();
    // Remove secrets from input so they don't appear in logs
    delete input.secrets;

    // Streaming output: parse OUTPUT_START/END marker pairs as they arrive
    let parseBuffer = '';
    let newSessionId: string | undefined;
    let outputChain = Promise.resolve();

    container.stdout.on('data', (data) => {
      const chunk = data.toString();

      // Any stdout chunk (heartbeat, output, log line) is proof-of-life for
      // the GroupQueue freeze detector. The agent-runner emits a heartbeat
      // every 30s; this guarantees lastOutputAt updates well within the
      // STALE_OUTPUT_THRESHOLD_MS window even when the agent is busy thinking.
      if (onActivity) {
        try {
          onActivity();
        } catch (err) {
          logger.debug({ err }, 'onActivity callback threw');
        }
      }

      // Strip heartbeat markers before accumulating into stdout (prevents log pollution)
      const cleanChunk = chunk.replace(/---NANOCLAW_HEARTBEAT---\n?/g, '');

      // Always accumulate for logging (using cleaned chunk)
      if (!stdoutTruncated) {
        const remaining = CONTAINER_MAX_OUTPUT_SIZE - stdout.length;
        if (cleanChunk.length > remaining) {
          stdout += cleanChunk.slice(0, remaining);
          stdoutTruncated = true;
          logger.warn(
            { group: group.name, size: stdout.length },
            'Container stdout truncated due to size limit',
          );
        } else {
          stdout += cleanChunk;
        }
      }

      // Stream-parse for output markers
      if (onOutput) {
        parseBuffer += chunk;

        // Strip heartbeat markers and reset timers (proves agent is alive)
        if (parseBuffer.includes(HEARTBEAT_MARKER)) {
          parseBuffer = parseBuffer.split(HEARTBEAT_MARKER + '\n').join('');
          if (!hadStreamingOutput && !spawnTimedOut) {
            clearTimeout(spawnTimer);
            spawnTimer = setTimeout(spawnTimeoutFn, spawnTimeoutMs);
            logger.debug(
              { group: group.name },
              'Heartbeat received, reset spawn timer',
            );
          }
          resetTimeout();
        }

        let startIdx: number;
        while ((startIdx = parseBuffer.indexOf(OUTPUT_START_MARKER)) !== -1) {
          const endIdx = parseBuffer.indexOf(OUTPUT_END_MARKER, startIdx);
          if (endIdx === -1) break; // Incomplete pair, wait for more data

          const jsonStr = parseBuffer
            .slice(startIdx + OUTPUT_START_MARKER.length, endIdx)
            .trim();
          parseBuffer = parseBuffer.slice(endIdx + OUTPUT_END_MARKER.length);

          try {
            const parsed: ContainerOutput = JSON.parse(jsonStr);
            if (parsed.newSessionId) {
              newSessionId = parsed.newSessionId;
            }
            if (!hadStreamingOutput) {
              clearTimeout(spawnTimer);
            }
            hadStreamingOutput = true;
            // Activity detected — reset the hard timeout
            resetTimeout();
            // Call onOutput for all markers (including null results)
            // so idle timers start even for "silent" query completions.
            outputChain = outputChain.then(() => onOutput(parsed));
          } catch (err) {
            logger.warn(
              { group: group.name, error: err },
              'Failed to parse streamed output chunk',
            );
          }
        }
      }
    });

    container.stderr.on('data', (data) => {
      const chunk = data.toString();
      const lines = chunk.trim().split('\n');
      for (const line of lines) {
        if (line) logger.debug({ container: group.folder }, line);
      }
      // Don't reset timeout on stderr — SDK writes debug logs continuously.
      // Timeout only resets on actual output (OUTPUT_MARKER in stdout).
      if (stderrTruncated) return;
      const remaining = CONTAINER_MAX_OUTPUT_SIZE - stderr.length;
      if (chunk.length > remaining) {
        stderr += chunk.slice(0, remaining);
        stderrTruncated = true;
        logger.warn(
          { group: group.name, size: stderr.length },
          'Container stderr truncated due to size limit',
        );
      } else {
        stderr += chunk;
      }
    });

    let timedOut = false;
    let spawnTimedOut = false;
    let hadStreamingOutput = false;
    const configTimeout = group.containerConfig?.timeout || CONTAINER_TIMEOUT;
    // Grace period: hard timeout must be at least IDLE_TIMEOUT + 30s so the
    // graceful _close sentinel has time to trigger before the hard kill fires.
    const timeoutMs = Math.max(configTimeout, IDLE_TIMEOUT + 30_000);

    const killOnTimeout = () => {
      timedOut = true;
      logger.error(
        { group: group.name, containerName },
        'Container timeout, stopping gracefully',
      );
      exec(stopContainer(containerName), { timeout: 15000 }, (err) => {
        if (err) {
          logger.warn(
            { group: group.name, containerName, err },
            'Graceful stop failed, force killing',
          );
          container.kill('SIGKILL');
        }
      });
    };

    let timeout = setTimeout(killOnTimeout, timeoutMs);

    // Spawn timeout: fail fast if no output markers arrive within window.
    // This catches containers that boot but never produce output (bad image,
    // missing auth, agent-runner crash). Cleared on first streaming output
    // or heartbeat. Per-group override via containerConfig.spawnTimeout.
    const spawnTimeoutMs = group.containerConfig?.spawnTimeout || SPAWN_TIMEOUT;
    const spawnTimeoutFn = () => {
      if (!hadStreamingOutput) {
        spawnTimedOut = true;
        logger.error(
          { group: group.name, containerName, spawnTimeoutMs },
          'Spawn timeout — no output markers within window, killing container',
        );
        exec(stopContainer(containerName), { timeout: 15000 }, (err) => {
          if (err) container.kill('SIGKILL');
        });
      }
    };
    let spawnTimer = setTimeout(spawnTimeoutFn, spawnTimeoutMs);

    // Reset the timeout whenever there's activity (streaming output)
    const resetTimeout = () => {
      clearTimeout(timeout);
      timeout = setTimeout(killOnTimeout, timeoutMs);
    };

    container.on('close', (code) => {
      clearTimeout(timeout);
      clearTimeout(spawnTimer);
      const duration = Date.now() - startTime;

      if (spawnTimedOut) {
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        fs.writeFileSync(
          path.join(logsDir, `container-${ts}.log`),
          [
            `=== Container Run Log (SPAWN TIMEOUT) ===`,
            `Timestamp: ${new Date().toISOString()}`,
            `Group: ${group.name}`,
            `Container: ${containerName}`,
            `Duration: ${duration}ms`,
            `Exit Code: ${code}`,
            `Spawn Timeout: ${spawnTimeoutMs}ms`,
          ].join('\n'),
        );
        logger.error(
          { group: group.name, containerName, duration, code },
          'Container killed by spawn timeout',
        );
        resolve({
          status: 'error',
          result: null,
          error: `Container produced no output within ${spawnTimeoutMs}ms spawn window`,
        });
        return;
      }

      if (timedOut) {
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const timeoutLog = path.join(logsDir, `container-${ts}.log`);
        fs.writeFileSync(
          timeoutLog,
          [
            `=== Container Run Log (TIMEOUT) ===`,
            `Timestamp: ${new Date().toISOString()}`,
            `Group: ${group.name}`,
            `Container: ${containerName}`,
            `Duration: ${duration}ms`,
            `Exit Code: ${code}`,
            `Had Streaming Output: ${hadStreamingOutput}`,
          ].join('\n'),
        );

        // Timeout after output = idle cleanup, not failure.
        // The agent already sent its response; this is just the
        // container being reaped after the idle period expired.
        if (hadStreamingOutput) {
          logger.info(
            { group: group.name, containerName, duration, code },
            'Container timed out after output (idle cleanup)',
          );
          outputChain.then(() => {
            resolve({
              status: 'success',
              result: null,
              newSessionId,
            });
          });
          return;
        }

        logger.error(
          { group: group.name, containerName, duration, code },
          'Container timed out with no output',
        );

        resolve({
          status: 'error',
          result: null,
          error: `Container timed out after ${configTimeout}ms`,
        });
        return;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const logFile = path.join(logsDir, `container-${timestamp}.log`);
      const isVerbose =
        process.env.LOG_LEVEL === 'debug' || process.env.LOG_LEVEL === 'trace';

      const logLines = [
        `=== Container Run Log ===`,
        `Timestamp: ${new Date().toISOString()}`,
        `Group: ${group.name}`,
        `IsMain: ${input.isMain}`,
        `Duration: ${duration}ms`,
        `Exit Code: ${code}`,
        `Stdout Truncated: ${stdoutTruncated}`,
        `Stderr Truncated: ${stderrTruncated}`,
        ``,
      ];

      const isError = code !== 0;

      if (isVerbose || isError) {
        logLines.push(
          `=== Input ===`,
          JSON.stringify(input, null, 2),
          ``,
          `=== Container Args ===`,
          containerArgs.join(' '),
          ``,
          `=== Mounts ===`,
          mounts
            .map(
              (m) =>
                `${m.hostPath} -> ${m.containerPath}${m.readonly ? ' (ro)' : ''}`,
            )
            .join('\n'),
          ``,
          `=== Stderr${stderrTruncated ? ' (TRUNCATED)' : ''} ===`,
          stderr,
          ``,
          `=== Stdout${stdoutTruncated ? ' (TRUNCATED)' : ''} ===`,
          stdout,
        );
      } else {
        logLines.push(
          `=== Input Summary ===`,
          `Prompt length: ${input.prompt.length} chars`,
          `Session ID: ${input.sessionId || 'new'}`,
          ``,
          `=== Mounts ===`,
          mounts
            .map((m) => `${m.containerPath}${m.readonly ? ' (ro)' : ''}`)
            .join('\n'),
          ``,
        );
      }

      fs.writeFileSync(logFile, logLines.join('\n'));
      logger.debug({ logFile, verbose: isVerbose }, 'Container log written');

      if (code !== 0) {
        logger.error(
          {
            group: group.name,
            code,
            duration,
            stderr,
            stdout,
            logFile,
          },
          'Container exited with error',
        );

        resolve({
          status: 'error',
          result: null,
          error: `Container exited with code ${code}: ${stderr.slice(-200)}`,
        });
        return;
      }

      // Streaming mode: wait for output chain to settle, return completion marker
      if (onOutput) {
        outputChain.then(() => {
          logger.info(
            { group: group.name, duration, newSessionId },
            'Container completed (streaming mode)',
          );
          resolve({
            status: 'success',
            result: null,
            newSessionId,
          });
        });
        return;
      }

      // Legacy mode: parse the last output marker pair from accumulated stdout
      try {
        // Extract JSON between sentinel markers for robust parsing
        const startIdx = stdout.indexOf(OUTPUT_START_MARKER);
        const endIdx = stdout.indexOf(OUTPUT_END_MARKER);

        let jsonLine: string;
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          jsonLine = stdout
            .slice(startIdx + OUTPUT_START_MARKER.length, endIdx)
            .trim();
        } else {
          // Fallback: last non-empty line (backwards compatibility)
          const lines = stdout.trim().split('\n');
          jsonLine = lines[lines.length - 1];
        }

        const output: ContainerOutput = JSON.parse(jsonLine);

        logger.info(
          {
            group: group.name,
            duration,
            status: output.status,
            hasResult: !!output.result,
          },
          'Container completed',
        );

        resolve(output);
      } catch (err) {
        logger.error(
          {
            group: group.name,
            stdout,
            stderr,
            error: err,
          },
          'Failed to parse container output',
        );

        resolve({
          status: 'error',
          result: null,
          error: `Failed to parse container output: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    });

    container.on('error', (err) => {
      clearTimeout(timeout);
      logger.error(
        { group: group.name, containerName, error: err },
        'Container spawn error',
      );
      resolve({
        status: 'error',
        result: null,
        error: `Container spawn error: ${err.message}`,
      });
    });
  });
}

export function writeTasksSnapshot(
  groupFolder: string,
  isMain: boolean,
  tasks: Array<{
    id: string;
    groupFolder: string;
    prompt: string;
    schedule_type: string;
    schedule_value: string;
    status: string;
    next_run: string | null;
  }>,
): void {
  // Write filtered tasks to the group's IPC directory
  const groupIpcDir = resolveGroupIpcPath(groupFolder);
  fs.mkdirSync(groupIpcDir, { recursive: true });

  // Main sees all tasks, others only see their own
  const filteredTasks = isMain
    ? tasks
    : tasks.filter((t) => t.groupFolder === groupFolder);

  const tasksFile = path.join(groupIpcDir, 'current_tasks.json');
  fs.writeFileSync(tasksFile, JSON.stringify(filteredTasks, null, 2));
}

export interface AvailableGroup {
  jid: string;
  name: string;
  lastActivity: string;
  isRegistered: boolean;
}

/**
 * Write available groups snapshot for the container to read.
 * Only main group can see all available groups (for activation).
 * Non-main groups only see their own registration status.
 */
export function writeGroupsSnapshot(
  groupFolder: string,
  isMain: boolean,
  groups: AvailableGroup[],
  registeredJids: Set<string>,
): void {
  const groupIpcDir = resolveGroupIpcPath(groupFolder);
  fs.mkdirSync(groupIpcDir, { recursive: true });

  // Main sees all groups; others see nothing (they can't activate groups)
  const visibleGroups = isMain ? groups : [];

  const groupsFile = path.join(groupIpcDir, 'available_groups.json');
  fs.writeFileSync(
    groupsFile,
    JSON.stringify(
      {
        groups: visibleGroups,
        lastSync: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}
