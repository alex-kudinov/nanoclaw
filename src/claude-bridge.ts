/**
 * Claude Print Bridge TypeScript wrapper.
 *
 * Host tools MUST call the bridge instead of `claude --print` directly —
 * the bridge handles token lifecycle, multi-account rotation, and fallbacks.
 *
 * Reference: tools/lib/bridge.py (Python equivalent).
 */

import { readEnvFile } from './env.js';
import { logger } from './logger.js';

const DEFAULT_URL = 'http://100.115.115.206:40960/v1/print';
const DEFAULT_TIMEOUT_MS = 130_000;
const TOKEN_ESTIMATE_WARN = 30_000;

type Model = 'haiku' | 'sonnet' | 'opus';

export interface BridgeMeta {
  minion?: string;
  action?: string;
  job?: string;
  caller?: string;
}

export interface BridgePrintOptions {
  prompt: string;
  model?: Model;
  system?: string;
  max_turns?: number;
  timeout_ms?: number;
  meta?: BridgeMeta;
}

interface BridgeSuccess {
  ok: true;
  data: { result: string };
}

interface BridgeFailure {
  ok: false;
  code?: string;
  error?: string;
}

type BridgeResponse = BridgeSuccess | BridgeFailure;

function readBridgeKey(): string {
  const fromProcess = process.env.CLAUDE_BRIDGE_KEY;
  if (fromProcess) return fromProcess;
  const fromFile = readEnvFile(['CLAUDE_BRIDGE_KEY']).CLAUDE_BRIDGE_KEY;
  if (fromFile) return fromFile;
  throw new Error(
    'claude-bridge: CLAUDE_BRIDGE_KEY not found in process.env or .env / .env.shared',
  );
}

function estimatePromptTokens(prompt: string): number {
  return Math.ceil(prompt.length / 4);
}

/**
 * Call Claude via the Print Bridge. Returns the response text.
 * Throws on HTTP errors, timeouts, or `ok: false` responses.
 */
export async function bridgePrint(opts: BridgePrintOptions): Promise<string> {
  if (!opts.prompt || opts.prompt.trim().length === 0) {
    throw new Error('claude-bridge: prompt is empty');
  }

  const estimatedTokens = estimatePromptTokens(opts.prompt);
  if (estimatedTokens > TOKEN_ESTIMATE_WARN) {
    logger.warn(
      { estimatedTokens, threshold: TOKEN_ESTIMATE_WARN },
      'claude-bridge: large prompt — consider truncation',
    );
  }

  const url = process.env.CLAUDE_BRIDGE_URL || DEFAULT_URL;
  const timeoutMs = opts.timeout_ms ?? DEFAULT_TIMEOUT_MS;
  const key = readBridgeKey();

  const body: Record<string, unknown> = {
    prompt: opts.prompt,
    model: opts.model || 'sonnet',
  };
  if (opts.system) body.system_prompt = opts.system;
  if (opts.max_turns !== undefined) body.max_turns = opts.max_turns;

  // Auto-inject metadata from env, allow explicit override
  const autoMeta: BridgeMeta = {};
  if (process.env.NANOCLAW_MINION)
    autoMeta.minion = process.env.NANOCLAW_MINION;
  if (process.env.NANOCLAW_ACTION)
    autoMeta.action = process.env.NANOCLAW_ACTION;
  if (process.env.NANOCLAW_JOB) autoMeta.job = process.env.NANOCLAW_JOB;
  if (process.env.NANOCLAW_CALLER)
    autoMeta.caller = process.env.NANOCLAW_CALLER;
  const merged = { ...autoMeta, ...opts.meta };
  if (Object.keys(merged).length > 0) body.meta = merged;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bridge-Key': key,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `claude-bridge: HTTP ${res.status}: ${text.slice(0, 500)}`,
      );
    }
    const json = (await res.json()) as BridgeResponse;
    if (!json.ok) {
      throw new Error(
        `claude-bridge: error (${json.code || 'UNKNOWN'}): ${json.error || 'no details'}`,
      );
    }
    const result = json.data?.result;
    if (typeof result !== 'string') {
      throw new Error(
        'claude-bridge: unexpected response shape (missing data.result)',
      );
    }
    return result;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`claude-bridge: request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
