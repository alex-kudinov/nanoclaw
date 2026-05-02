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

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

import { HEARTBEAT_MARKER } from './ipc-protocol.js';
import { detectRateLimit } from './rate-limit.js';
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

// ── Claude --print, one-shot per IPC message ────────────────────────────────
//
// Each IPC message gets its own `claude --print --output-format json` invocation.
// Session continuity across messages within a container: capture session_id from
// the first run, pass --resume <id> on subsequent runs.
//
// This is the deliberate non-stream design. Stream-json mode kept claude alive
// across turns but turned out to be a deadlock trap on rate-limit: claude does
// not exit when it hits a usage cap (it streams the limit message and waits for
// stdin), so the wrapper had no path back to the rotation logic in main().
// Per-message spawn = claude exits naturally each turn, exit-code-driven
// rotation works, no hidden "claude alive but doing nothing" state.

interface RunAgentResult {
  rateLimited: boolean;
  rateLimitMessage?: string;
}

async function runAgent(
  containerInput: ContainerInput,
  env: Record<string, string | undefined>,
): Promise<RunAgentResult> {
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

  // Write MCP config for --mcp-config (read by claude on each spawn)
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

  env.NANOCLAW_ASSISTANT_NAME = containerInput.assistantName || '';

  // Base CLI args — claude exits after the result; --resume <session> attaches subsequent turns.
  const baseArgs: string[] = [
    '--print',
    '--output-format', 'json',
    '--verbose',
    '--dangerously-skip-permissions',
    '--model', 'sonnet',
    '--mcp-config', mcpConfigPath,
    '--allowedTools', ALLOWED_TOOLS.join(','),
  ];
  if (globalClaudeMd) baseArgs.push('--append-system-prompt', globalClaudeMd);
  for (const dir of extraDirs) baseArgs.push('--add-dir', dir);

  // Heartbeat to stdout so host knows the wrapper is alive between messages
  // and during long claude runs. claude's stdout is on a separate pipe, so
  // these markers don't interleave with claude's JSON output.
  const heartbeatInterval = setInterval(() => {
    try { process.stdout.write(HEARTBEAT_MARKER + '\n'); } catch {
      clearInterval(heartbeatInterval);
    }
  }, HEARTBEAT_INTERVAL_MS);

  // Build initial prompt (drained-IPC-included, scheduled-task prefix if needed)
  let pendingPrompt: string | undefined = containerInput.prompt;
  if (containerInput.isScheduledTask) {
    pendingPrompt = `[SCHEDULED TASK - The following message was sent automatically and is not coming directly from the user or group.]\n\n${pendingPrompt}`;
  }
  {
    const drained = drainIpcInput();
    if (drained.length > 0) {
      log(`Draining ${drained.length} pending IPC messages into initial prompt`);
      pendingPrompt += '\n' + drained.join('\n');
    }
  }

  let sessionId: string | undefined = containerInput.sessionId;
  let turnCount = 0;

  try {
    while (true) {
      // Wait for a prompt: either the queued one, or the next IPC message,
      // or the close sentinel.
      if (pendingPrompt === undefined) {
        if (shouldClose()) {
          log('Close sentinel detected, exiting agent loop');
          break;
        }
        const messages = drainIpcInput();
        if (messages.length > 0) {
          pendingPrompt = messages.join('\n');
        } else {
          await new Promise(r => setTimeout(r, IPC_POLL_MS));
          continue;
        }
      }

      const prompt = pendingPrompt;
      pendingPrompt = undefined;
      turnCount++;

      // One spawn attempt — captures everything we need to decide what to emit.
      const runOnce = async (
        useSessionId: string | undefined,
      ): Promise<{
        exitCode: number;
        stdout: string;
        stderrTail: string;
        result: Record<string, unknown> | null;  // the parsed `type: "result"` event
      }> => {
        const args = [...baseArgs];
        if (useSessionId) args.push('--resume', useSessionId);

        log(`Turn ${turnCount}: spawning claude (${args.length} args, prompt ${prompt.length} chars${useSessionId ? ', resume=' + useSessionId : ''})`);

        const claude = spawn('claude', args, {
          cwd: '/workspace/group',
          env: env as Record<string, string>,
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        let stderrBuf = '';
        const stderrRl = readline.createInterface({ input: claude.stderr! });
        stderrRl.on('line', line => {
          log(`[claude] ${line}`);
          stderrBuf += line + '\n';
          if (stderrBuf.length > 4096) stderrBuf = stderrBuf.slice(-4096);
        });

        const stdoutChunks: Buffer[] = [];
        claude.stdout!.on('data', chunk => stdoutChunks.push(chunk));

        try {
          claude.stdin!.write(prompt);
          claude.stdin!.end();
        } catch (err) {
          log(`Failed to write prompt to claude stdin: ${err instanceof Error ? err.message : String(err)}`);
        }

        const exitCode: number = await new Promise(resolve => {
          claude.on('close', code => resolve(code ?? 1));
        });
        const stdout = Buffer.concat(stdoutChunks).toString('utf8');
        log(`Turn ${turnCount}: claude exited code=${exitCode} stdout_len=${stdout.length}`);

        // claude --print --output-format json returns the stream as a JSON array
        // of events. The last `type: "result"` event holds the final result, is_error,
        // session_id, etc. Older builds may return a single result object — handle both.
        let result: Record<string, unknown> | null = null;
        let parsed: unknown;
        try { parsed = JSON.parse(stdout); } catch { /* leave parsed undefined */ }
        if (Array.isArray(parsed)) {
          for (let i = parsed.length - 1; i >= 0; i--) {
            const ev = parsed[i] as Record<string, unknown> | undefined;
            if (ev && ev.type === 'result') { result = ev; break; }
          }
        } else if (parsed && typeof parsed === 'object') {
          result = parsed as Record<string, unknown>;
        }

        // On non-zero exit with no parsed result, log a stdout snippet so we can
        // diagnose without needing to reproduce the failure.
        if (exitCode !== 0 && !result && stdout.trim()) {
          log(`Turn ${turnCount}: stdout snippet (first 500): ${stdout.slice(0, 500)}`);
        }

        return { exitCode, stdout, stderrTail: stderrBuf.slice(-500), result };
      };

      let attempt = await runOnce(sessionId);

      // --resume can fail with "No conversation found with session ID: <id>" when
      // the session was created by a different account/container or has been
      // garbage-collected. Drop sessionId and retry once before erroring out.
      const combinedLower = (attempt.stdout + '\n' + attempt.stderrTail).toLowerCase();
      const looksLikeMissingSession = sessionId && (
        combinedLower.includes('no conversation found') ||
        combinedLower.includes('session not found') ||
        combinedLower.includes('session does not exist')
      );
      if (looksLikeMissingSession) {
        log(`Stale session_id ${sessionId} — retrying without --resume`);
        sessionId = undefined;
        attempt = await runOnce(undefined);
      }

      // Update sessionId from whichever attempt succeeded (or last attempt).
      if (attempt.result && typeof attempt.result.session_id === 'string') {
        if (!sessionId) log(`Session initialized: ${attempt.result.session_id}`);
        sessionId = attempt.result.session_id;
      }

      const textResult = attempt.result && typeof attempt.result.result === 'string'
        ? (attempt.result.result as string)
        : null;
      const isErrorResult = attempt.result?.is_error === true;

      // Rate-limit detection — check the result text and stderr.
      const limitFromResult = textResult ? detectRateLimit(textResult) : false;
      const limitFromStderr = attempt.exitCode !== 0 && detectRateLimit(attempt.stderrTail);
      if (limitFromResult || limitFromStderr) {
        const rateLimitMessage = limitFromResult ? textResult ?? undefined : undefined;
        log(`Rate-limit detected on turn ${turnCount} — returning to outer rotation logic`);
        clearInterval(heartbeatInterval);
        return { rateLimited: true, rateLimitMessage };
      }

      // Build a meaningful error message when claude exits non-zero or returns is_error.
      // Prefer the parsed JSON result (claude's actual error text) over raw stderr.
      const buildErrorMsg = (): string => {
        if (textResult) return textResult;
        if (attempt.stderrTail.trim()) return attempt.stderrTail.trim();
        if (!attempt.result && attempt.stdout.trim()) {
          return `claude --print non-JSON stdout (exit ${attempt.exitCode}): ${attempt.stdout.slice(0, 500)}`;
        }
        return `claude --print exited with code ${attempt.exitCode}`;
      };

      if (attempt.exitCode !== 0) {
        writeOutput({
          status: 'error',
          result: textResult,
          newSessionId: sessionId,
          error: buildErrorMsg(),
        });
      } else if (isErrorResult) {
        // Clean exit but is_error: true (e.g., "Not logged in", "No conversation found").
        writeOutput({
          status: 'error',
          result: textResult,
          newSessionId: sessionId,
          error: textResult ?? 'claude returned is_error',
        });
      } else if (textResult !== null) {
        writeOutput({
          status: 'success',
          result: textResult,
          newSessionId: sessionId,
        });
      } else {
        writeOutput({ status: 'success', result: null, newSessionId: sessionId });
      }
    }
  } finally {
    clearInterval(heartbeatInterval);
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
      // Sessions are scoped to the Claude account that issued the OAT, so
      // resuming with a different account's token would 404. Drop the
      // sessionId before retrying — the prompt is re-sent fresh anyway.
      containerInput.sessionId = undefined;
      let lastLimitMessage = result.rateLimitMessage;
      for (const candidate of remaining) {
        log(`Rate-limited, retrying with token: ${candidate.name}`);
        cliEnv.CLAUDE_CODE_OAUTH_TOKEN = candidate.token;
        const retry = await runAgent(containerInput, cliEnv);
        if (!retry.rateLimited) return; // success or non-rate-limit error
        if (retry.rateLimitMessage) lastLimitMessage = retry.rateLimitMessage;
        log(`Token ${candidate.name} also rate-limited`);
      }
      log('All tokens exhausted — all rate-limited');
      writeOutput({
        status: 'error',
        result: lastLimitMessage ?? null,
        error: lastLimitMessage
          ? `All Claude accounts rate-limited. Latest: ${lastLimitMessage}`
          : 'All Claude accounts rate-limited',
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
