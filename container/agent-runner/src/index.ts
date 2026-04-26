/**
 * NanoClaw Agent Runner
 * Runs inside a container, receives config via stdin, outputs result to stdout.
 * Calls the Claude Print Bridge HTTP API for AI inference.
 * Tools, file access, and MCP run locally in the container via `claude --print`.
 *
 * Architecture:
 *   claude --print runs INSIDE the container (tools, bash, file access)
 *   but authenticates via CLAUDE_CODE_OAUTH_TOKEN from the bridge's
 *   token lifecycle (refreshed every 10 min, synced to .env).
 *
 * Input protocol:
 *   Stdin: Full ContainerInput JSON (read until EOF)
 *   IPC:   Follow-up messages as JSON files in /workspace/ipc/input/
 *          Sentinel: /workspace/ipc/input/_close — signals session end
 *
 * Stdout protocol:
 *   Each result wrapped in OUTPUT_START_MARKER / OUTPUT_END_MARKER pairs.
 */

import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

import { HEARTBEAT_MARKER } from './ipc-protocol.js';
import { fileURLToPath } from 'url';

interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  isScheduledTask?: boolean;
  assistantName?: string;
  secrets?: Record<string, string>;
}

interface ContainerOutput {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
}

const IPC_INPUT_DIR = '/workspace/ipc/input';
const IPC_INPUT_CLOSE_SENTINEL = path.join(IPC_INPUT_DIR, '_close');
const IPC_ACK_DIR = '/workspace/ipc/ack';
const IPC_POLL_MS = 500;

const OUTPUT_START_MARKER = '---NANOCLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---NANOCLAW_OUTPUT_END---';
const HEARTBEAT_INTERVAL_MS = 30_000;

const ALLOWED_TOOLS = [
  'Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep',
  'WebSearch', 'WebFetch',
  'Task', 'TaskOutput', 'TaskStop',
  'TeamCreate', 'TeamDelete', 'SendMessage',
  'TodoWrite', 'ToolSearch', 'Skill',
  'NotebookEdit',
  'mcp__nanoclaw__*',
];

function writeOutput(output: ContainerOutput): void {
  console.log(OUTPUT_START_MARKER);
  console.log(JSON.stringify(output));
  console.log(OUTPUT_END_MARKER);
}

function log(message: string): void {
  console.error(`[agent-runner] ${message}`);
}

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

// ── IPC helpers ──────────────────────────────────────────────────────────────

function shouldClose(): boolean {
  if (fs.existsSync(IPC_INPUT_CLOSE_SENTINEL)) {
    try { fs.unlinkSync(IPC_INPUT_CLOSE_SENTINEL); } catch { /* ignore */ }
    return true;
  }
  return false;
}

function writeAckFile(messageId: string): void {
  try {
    fs.mkdirSync(IPC_ACK_DIR, { recursive: true });
    const ackPath = path.join(IPC_ACK_DIR, `${messageId}.json`);
    const tempPath = `${ackPath}.tmp`;
    const payload = JSON.stringify({
      message_id: messageId,
      acked_at_ms: Date.now(),
    });
    fs.writeFileSync(tempPath, payload);
    fs.renameSync(tempPath, ackPath);
  } catch (err) {
    log(`Failed to write ack file for ${messageId}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function drainIpcInput(): string[] {
  try {
    fs.mkdirSync(IPC_INPUT_DIR, { recursive: true });
    const files = fs.readdirSync(IPC_INPUT_DIR)
      .filter(f => f.endsWith('.json'))
      .sort();

    const messages: string[] = [];
    for (const file of files) {
      const filePath = path.join(IPC_INPUT_DIR, file);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        fs.unlinkSync(filePath);
        if (data.type === 'message' && data.text) {
          messages.push(data.text);
          // Ack fires on READ (before Claude responds). The host uses this
          // to remove the message from dead-letter tracking. If message_id
          // is missing (legacy format during rolling deploy), skip ack.
          if (data.message_id) {
            writeAckFile(data.message_id);
          }
        }
      } catch (err) {
        log(`Failed to process input file ${file}: ${err instanceof Error ? err.message : String(err)}`);
        try { fs.unlinkSync(filePath); } catch { /* ignore */ }
      }
    }
    return messages;
  } catch (err) {
    log(`IPC drain error: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

// ── Claude --print via stdin streaming ──────────────────────────────────────

function writeUserMessage(proc: ChildProcess, text: string): void {
  if (proc.stdin!.destroyed) return;
  const msg = {
    type: 'user',
    message: { role: 'user', content: text },
    parent_tool_use_id: null,
    session_id: '',
  };
  try {
    proc.stdin!.write(JSON.stringify(msg) + '\n');
  } catch {
    // Process already exited
  }
}

async function runAgent(
  containerInput: ContainerInput,
  env: Record<string, string | undefined>,
): Promise<{ rateLimited: boolean }> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const mcpServerPath = path.join(__dirname, 'ipc-mcp-stdio.js');

  // Write non-auth secrets to /tmp/.nanoclaw-env so scripts can source them
  // (claude --print may not pass process env to Bash tool commands)
  const scriptSecrets = Object.entries(containerInput.secrets || {})
    .filter(([k]) => !k.startsWith('CLAUDE_') && k !== 'CLAUDE_CONFIG_DIR')
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  if (scriptSecrets) {
    fs.writeFileSync('/tmp/.nanoclaw-env', scriptSecrets, { mode: 0o600 });
    log(`Wrote ${scriptSecrets.split('\n').length} secret(s) to /tmp/.nanoclaw-env`);
  }

  // Write MCP config for --mcp-config
  const mcpConfig = {
    mcpServers: {
      nanoclaw: {
        command: 'node',
        args: [mcpServerPath],
        env: {
          NANOCLAW_CHAT_JID: containerInput.chatJid,
          NANOCLAW_GROUP_FOLDER: containerInput.groupFolder,
          NANOCLAW_IS_MAIN: containerInput.isMain ? '1' : '0',
        },
      },
    },
  };
  const mcpConfigPath = '/tmp/mcp-config.json';
  fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig));

  // Discover additional directories mounted at /workspace/extra/*
  const extraDirs: string[] = [];
  const extraBase = '/workspace/extra';
  if (fs.existsSync(extraBase)) {
    for (const entry of fs.readdirSync(extraBase)) {
      const fullPath = path.join(extraBase, entry);
      if (fs.statSync(fullPath).isDirectory()) {
        extraDirs.push(fullPath);
      }
    }
  }
  if (extraDirs.length > 0) {
    log(`Additional directories: ${extraDirs.join(', ')}`);
  }

  // Load global CLAUDE.md for --append-system-prompt
  const globalClaudeMdPath = '/workspace/global/CLAUDE.md';
  let globalClaudeMd: string | undefined;
  if (!containerInput.isMain && fs.existsSync(globalClaudeMdPath)) {
    globalClaudeMd = fs.readFileSync(globalClaudeMdPath, 'utf-8');
  }

  // Build CLI args — claude --print runs locally in the container
  // Auth via CLAUDE_CODE_OAUTH_TOKEN env var (managed by bridge token lifecycle)
  const args: string[] = [
    '--print',
    '--output-format', 'stream-json',
    '--input-format', 'stream-json',
    '--verbose',
    '--dangerously-skip-permissions',
    '--model', 'sonnet',
    '--mcp-config', mcpConfigPath,
    '--allowedTools', ALLOWED_TOOLS.join(','),
  ];

  if (containerInput.sessionId) {
    args.push('--resume', containerInput.sessionId);
  }

  if (globalClaudeMd) {
    args.push('--append-system-prompt', globalClaudeMd);
  }

  for (const dir of extraDirs) {
    args.push('--add-dir', dir);
  }

  env.NANOCLAW_ASSISTANT_NAME = containerInput.assistantName || '';

  log(`Spawning claude ${args.slice(0, 6).join(' ')} ... (${args.length} args)`);

  const claude = spawn('claude', args, {
    cwd: '/workspace/group',
    env: env as Record<string, string>,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Register close listener BEFORE the for-await loop to avoid race condition
  const exitPromise = new Promise<number>(resolve => {
    claude.on('close', code => resolve(code ?? 1));
  });

  // Log stderr and accumulate for rate-limit detection
  let stderrBuf = '';
  const stderrRl = readline.createInterface({ input: claude.stderr! });
  stderrRl.on('line', line => {
    log(`[claude] ${line}`);
    // Keep last 2KB for error pattern matching
    stderrBuf += line + '\n';
    if (stderrBuf.length > 2048) stderrBuf = stderrBuf.slice(-2048);
  });

  // Build initial prompt
  let prompt = containerInput.prompt;
  if (containerInput.isScheduledTask) {
    prompt = `[SCHEDULED TASK - The following message was sent automatically and is not coming directly from the user or group.]\n\n${prompt}`;
  }
  const pending = drainIpcInput();
  if (pending.length > 0) {
    log(`Draining ${pending.length} pending IPC messages into initial prompt`);
    prompt += '\n' + pending.join('\n');
  }

  // Send initial prompt
  writeUserMessage(claude, prompt);

  // Poll IPC for follow-up messages during execution
  let ipcPolling = true;
  const pollIpc = () => {
    if (!ipcPolling) return;
    if (shouldClose()) {
      log('Close sentinel detected, ending stdin');
      try { claude.stdin!.end(); } catch { /* ignore */ }
      ipcPolling = false;
      return;
    }
    const messages = drainIpcInput();
    for (const text of messages) {
      log(`Piping IPC message into active query (${text.length} chars)`);
      writeUserMessage(claude, text);
    }
    setTimeout(pollIpc, IPC_POLL_MS);
  };
  setTimeout(pollIpc, IPC_POLL_MS);

  // Emit periodic heartbeat to stdout so host can distinguish
  // "agent is working" from "agent is dead" during long tool-call sequences.
  const heartbeatInterval = setInterval(() => {
    try {
      process.stdout.write(HEARTBEAT_MARKER + '\n');
    } catch {
      // Pipe broken — container shutting down, safe to ignore
      clearInterval(heartbeatInterval);
    }
  }, HEARTBEAT_INTERVAL_MS);

  // Process streaming JSON output
  let newSessionId: string | undefined;
  let messageCount = 0;
  let resultCount = 0;

  const stdoutRl = readline.createInterface({ input: claude.stdout! });
  for await (const line of stdoutRl) {
    if (!line.trim()) continue;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line);
    } catch {
      log(`Non-JSON stdout: ${line.slice(0, 200)}`);
      continue;
    }

    messageCount++;
    const msgType = msg.type === 'system'
      ? `system/${msg.subtype}`
      : String(msg.type || 'unknown');
    log(`[msg #${messageCount}] type=${msgType}`);

    if (msg.type === 'system' && msg.subtype === 'init') {
      newSessionId = msg.session_id as string;
      log(`Session initialized: ${newSessionId}`);
    }

    if (msg.type === 'system' && msg.subtype === 'task_notification') {
      const tn = msg as Record<string, unknown>;
      log(`Task notification: task=${tn.task_id} status=${tn.status} summary=${tn.summary}`);
    }

    if (msg.type === 'result') {
      resultCount++;
      const textResult = (msg.result as string) ?? null;
      log(`Result #${resultCount}: subtype=${msg.subtype}${textResult ? ` text=${textResult.slice(0, 200)}` : ''}`);
      writeOutput({
        status: 'success',
        result: textResult,
        newSessionId,
      });
    }
  }

  ipcPolling = false;
  clearInterval(heartbeatInterval);

  const exitCode = await exitPromise;
  log(`Claude exited with code ${exitCode}. Messages: ${messageCount}, results: ${resultCount}`);

  if (exitCode !== 0 && resultCount === 0) {
    // Check stderr for rate-limit indicators before writing output
    const isRateLimit = /rate.?limit|limit.?reached|too many|overloaded|529/i.test(stderrBuf);
    if (isRateLimit) {
      return { rateLimited: true };
    }
    writeOutput({
      status: 'error',
      result: null,
      newSessionId,
      error: `claude --print exited with code ${exitCode}`,
    });
  } else if (resultCount === 0) {
    // Exited cleanly but produced no result — emit empty success for host tracking
    writeOutput({ status: 'success', result: null, newSessionId });
  }
  return { rateLimited: false };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  let containerInput: ContainerInput;

  try {
    const stdinData = await readStdin();
    containerInput = JSON.parse(stdinData);
    try { fs.unlinkSync('/tmp/input.json'); } catch { /* may not exist */ }
    log(`Received input for group: ${containerInput.groupFolder}`);
  } catch (err) {
    writeOutput({
      status: 'error',
      result: null,
      error: `Failed to parse input: ${err instanceof Error ? err.message : String(err)}`,
    });
    process.exit(1);
  }

  // Build env for claude subprocess: process.env + secrets
  // CLAUDE_CODE_OAUTH_TOKEN comes from the bridge's token lifecycle
  // (synced to .env every 10 min by sync-token-to-env.sh)
  const cliEnv: Record<string, string | undefined> = { ...process.env };
  for (const [key, value] of Object.entries(containerInput.secrets || {})) {
    cliEnv[key] = value;
  }

  // Set up PostgreSQL access — in cliEnv only, not process.env
  const businessDbUrl = containerInput.secrets?.BUSINESS_DB_URL;
  if (businessDbUrl) {
    try {
      const url = new URL(businessDbUrl);
      cliEnv.PGHOST = url.hostname;
      cliEnv.PGPORT = url.port || '5432';
      cliEnv.PGDATABASE = url.pathname.slice(1);
      cliEnv.PGUSER = decodeURIComponent(url.username);
      cliEnv.PGPASSWORD = decodeURIComponent(url.password);
    } catch (err) {
      log(`business DB URL parse: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Tool-specific env vars — in cliEnv only
  for (const key of ['STRIPE_RESTRICTED_KEY', 'SHEETS_PAYMENTS_ID', 'SHEETS_ROSTER_ID']) {
    const val = containerInput.secrets?.[key];
    if (val) cliEnv[key] = val;
  }

  // Verify auth token is present
  if (!cliEnv.CLAUDE_CODE_OAUTH_TOKEN) {
    writeOutput({
      status: 'error',
      result: null,
      error: 'CLAUDE_CODE_OAUTH_TOKEN not set — check bridge token lifecycle',
    });
    process.exit(1);
  }

  // Parse token pool for rate-limit retry
  let tokenPool: Array<{ name: string; token: string }> = [];
  try {
    if (cliEnv.CLAUDE_TOKEN_POOL) {
      tokenPool = JSON.parse(cliEnv.CLAUDE_TOKEN_POOL);
    }
  } catch {
    log('Failed to parse CLAUDE_TOKEN_POOL, retries disabled');
  }
  // Remove pool from env so it doesn't leak into claude subprocess
  delete cliEnv.CLAUDE_TOKEN_POOL;

  fs.mkdirSync(IPC_INPUT_DIR, { recursive: true });
  try { fs.unlinkSync(IPC_INPUT_CLOSE_SENTINEL); } catch { /* ignore */ }

  try {
    const result = await runAgent(containerInput, cliEnv);

    if (result.rateLimited && tokenPool.length > 1) {
      const currentToken = cliEnv.CLAUDE_CODE_OAUTH_TOKEN;
      const remaining = tokenPool.filter(t => t.token !== currentToken);
      for (const candidate of remaining) {
        log(`Rate-limited, retrying with token: ${candidate.name}`);
        cliEnv.CLAUDE_CODE_OAUTH_TOKEN = candidate.token;
        const retry = await runAgent(containerInput, cliEnv);
        if (!retry.rateLimited) return; // success or non-rate-limit error
        log(`Token ${candidate.name} also rate-limited`);
      }
      log('All tokens exhausted — all rate-limited');
      writeOutput({
        status: 'error',
        result: null,
        error: 'All tokens rate-limited',
      });
      process.exit(1);
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log(`Agent error: ${errorMessage}`);
    writeOutput({
      status: 'error',
      result: null,
      error: errorMessage,
    });
    process.exit(1);
  }
}

main();
