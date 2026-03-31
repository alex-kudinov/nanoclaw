/**
 * NanoClaw Agent Runner
 * Runs inside a container, receives config via stdin, outputs result to stdout.
 * Spawns `claude --print` with streaming JSON I/O instead of using the Agent SDK.
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

// ── Claude CLI spawn ─────────────────────────────────────────────────────────

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
    // Process already exited — safe to ignore
  }
}

async function runAgent(
  containerInput: ContainerInput,
  sdkEnv: Record<string, string | undefined>,
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

  // Build CLI args
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

  // Pass assistant name for hooks
  sdkEnv.NANOCLAW_ASSISTANT_NAME = containerInput.assistantName || '';

  log(`Spawning claude ${args.slice(0, 6).join(' ')} ... (${args.length} args)`);

  const claude = spawn('claude', args, {
    cwd: '/workspace/group',
    env: sdkEnv as Record<string, string>,
    stdio: ['pipe', 'pipe', 'pipe'],
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
      claude.stdin!.end();
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

  // Register close listener BEFORE the for-await loop to avoid race condition
  const exitPromise = new Promise<number>(resolve => {
    claude.on('close', code => resolve(code ?? 1));
  });

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

  // Wait for process exit (listener registered before the for-await loop)
  const exitCode = await exitPromise;

  log(`Claude exited with code ${exitCode}. Messages: ${messageCount}, results: ${resultCount}`);

  if (exitCode !== 0 && resultCount === 0) {
    writeOutput({
      status: 'error',
      result: null,
      newSessionId,
      error: `claude --print exited with code ${exitCode}`,
    });
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  let containerInput: ContainerInput;

  try {
    const stdinData = await readStdin();
    containerInput = JSON.parse(stdinData);
    // Delete the temp file the entrypoint wrote — it contains secrets
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

  // Set up PostgreSQL access for business DB
  const businessDbUrl = containerInput.secrets?.BUSINESS_DB_URL;
  if (businessDbUrl) {
    try {
      const url = new URL(businessDbUrl);
      process.env.PGHOST = url.hostname;
      process.env.PGPORT = url.port || '5432';
      process.env.PGDATABASE = url.pathname.slice(1);
      process.env.PGUSER = decodeURIComponent(url.username);
      process.env.PGPASSWORD = decodeURIComponent(url.password);
    } catch (err) {
      log(`business DB URL parse: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Set tool-specific env vars so bash scripts can access them
  const envKeys = ['STRIPE_RESTRICTED_KEY', 'SHEETS_PAYMENTS_ID', 'SHEETS_ROSTER_ID'];
  for (const key of envKeys) {
    const val = containerInput.secrets?.[key];
    if (val) process.env[key] = val;
  }

  // Build env for the claude subprocess: process.env + secrets
  // API secrets go in sdkEnv only — the PreToolUse hook strips them from Bash
  const sdkEnv: Record<string, string | undefined> = { ...process.env };
  for (const [key, value] of Object.entries(containerInput.secrets || {})) {
    sdkEnv[key] = value;
  }

  fs.mkdirSync(IPC_INPUT_DIR, { recursive: true });
  // Clean up stale _close sentinel from previous runs
  try { fs.unlinkSync(IPC_INPUT_CLOSE_SENTINEL); } catch { /* ignore */ }

  try {
    await runAgent(containerInput, sdkEnv);
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
