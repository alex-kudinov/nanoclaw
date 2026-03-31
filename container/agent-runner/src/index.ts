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
const IPC_POLL_MS = 500;

const OUTPUT_START_MARKER = '---NANOCLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---NANOCLAW_OUTPUT_END---';

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
): Promise<void> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const mcpServerPath = path.join(__dirname, 'ipc-mcp-stdio.js');

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

  // Log stderr
  const stderrRl = readline.createInterface({ input: claude.stderr! });
  stderrRl.on('line', line => {
    log(`[claude] ${line}`);
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

  const exitCode = await exitPromise;
  log(`Claude exited with code ${exitCode}. Messages: ${messageCount}, results: ${resultCount}`);

  if (exitCode !== 0 && resultCount === 0) {
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

  fs.mkdirSync(IPC_INPUT_DIR, { recursive: true });
  try { fs.unlinkSync(IPC_INPUT_CLOSE_SENTINEL); } catch { /* ignore */ }

  try {
    await runAgent(containerInput, cliEnv);
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
