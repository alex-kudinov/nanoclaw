/**
 * Shared headless-Claude invocation for the healer's agentic phases — diagnosis
 * INVESTIGATION (read-only) and Phase-3 IMPLEMENT (edit). Both need a working
 * subscription token; bare `claude -p` 401s on the stale credentials.json, so we
 * inject the ROTATED CLAUDE_CODE_OAUTH_TOKEN the Print Bridge uses
 * (toolbox/shared/claude/bridge/server.js). This is the sanctioned exception to
 * the bridge-not-CLI rule: the bridge can't run tools, and these phases need them.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { logger } from '../logger.js';

/**
 * The active rotated Claude OAuth token: ~/.shared/.claude-active-token names the
 * account, ~/.shared/.claude-tokens.json holds its sk-ant-oat token. Null if the
 * rotation files are absent (caller must skip rather than spawn a 401 run).
 */
export function activeOAuthToken(): string | null {
  const dir =
    process.env.CLAUDE_ROTATION_DIR || path.join(os.homedir(), '.shared');
  try {
    const active = fs
      .readFileSync(path.join(dir, '.claude-active-token'), 'utf-8')
      .trim();
    const tokens = JSON.parse(
      fs.readFileSync(path.join(dir, '.claude-tokens.json'), 'utf-8'),
    );
    return tokens[active] || null;
  } catch {
    return null;
  }
}

/** Env for a headless claude run: inject the rotated OAuth token, drop API key. */
export function agenticEnv(token: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CLAUDE_CODE_OAUTH_TOKEN: token,
  };
  delete env.ANTHROPIC_API_KEY; // OAuth token + API key together confuse auth
  return env;
}

export interface AgenticResult {
  ok: boolean;
  stdout: string;
}

/**
 * CONCURRENCY GUARD (design §7: "never fork-bomb the box"). The orchestrator's
 * Phase-4 model is SYNCHRONOUS-BOUNDED — each agentic run is awaited and
 * MAX_PER_RUN is kept low (2) — so runs are already near-sequential. This
 * in-process semaphore is the backstop: no more than HEALER_DIAGNOSE_CONCURRENCY
 * (default 2) `claude` processes ever run at once, even if a future caller fans
 * out. launchd serializes the healer job itself, so cross-process overlap can't
 * happen for the same label.
 */
const MAX_CONCURRENT = Math.max(
  1,
  Number(process.env.HEALER_DIAGNOSE_CONCURRENCY || 2),
);
let active = 0;
const waiters: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiters.push(resolve));
}

function releaseSlot(): void {
  const next = waiters.shift();
  if (next) next(); // hand the slot straight to the next waiter (active unchanged)
  else active--;
}

/** Spawn `claude -p`, capture output, resolve {ok}. Never throws. */
function spawnClaude(
  prompt: string,
  opts: { allowedTools?: string; timeoutMs?: number },
  token: string,
): Promise<AgenticResult> {
  const args = ['-p', prompt, '--permission-mode', 'bypassPermissions'];
  if (opts.allowedTools) args.push('--allowedTools', opts.allowedTools);
  return new Promise((resolve) => {
    const child = spawn(process.env.HEALER_CLAUDE_BIN || 'claude', args, {
      cwd: process.cwd(),
      env: agenticEnv(token),
      timeout: opts.timeoutMs ?? 180_000,
    });
    let out = '';
    child.stdout?.on('data', (d) => (out += d.toString()));
    child.stderr?.on('data', (d) => (out += d.toString()));
    child.on('close', (code) => resolve({ ok: code === 0, stdout: out }));
    child.on('error', (err) => {
      logger.warn({ err }, 'healer: agentic claude spawn failed');
      resolve({ ok: false, stdout: out });
    });
  });
}

/**
 * Run headless `claude -p` with a restricted toolset, AWAIT it, capture output.
 * Used for synchronous read-only investigation (allowedTools = "Read Grep Glob").
 * Bounded by the concurrency guard above. Never throws — returns {ok:false} on
 * missing token (no slot consumed) / spawn error.
 */
export async function runAgenticClaude(
  prompt: string,
  opts: { allowedTools?: string; timeoutMs?: number } = {},
): Promise<AgenticResult> {
  const token = activeOAuthToken();
  if (!token) {
    logger.warn('healer: no active Claude token for agentic run');
    return { ok: false, stdout: '' };
  }
  await acquireSlot();
  try {
    return await spawnClaude(prompt, opts, token);
  } finally {
    releaseSlot();
  }
}
