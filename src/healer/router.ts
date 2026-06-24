/**
 * AI Router client — the healer's diagnosis brain transport (Phase 1, design §3.4).
 *
 * Routes diagnosis prompts to a strong model via the on-box AI Router
 * (port 40960, Straico-backed, token-rotated) — deliberately NOT the
 * subscription Claude, so diagnosis never competes with the live agents for
 * quota. Read-only: it reasons over already-redacted context and never touches
 * the machine. Contract: ~/dev/claude-bridge.md; secret in ~/dev/.env.shared.
 */

import { readEnvFile } from '../env.js';
import { logger } from '../logger.js';

function routerUrl(): string {
  return (
    readEnvFile(['HEALER_ROUTER_URL']).HEALER_ROUTER_URL ||
    'http://100.115.115.206:40960/v1/print'
  );
}

function routerKey(): string {
  const env = readEnvFile(['ROUTER_SECRET', 'CLAUDE_BRIDGE_KEY']);
  return env.ROUTER_SECRET || env.CLAUDE_BRIDGE_KEY || '';
}

/**
 * Diagnosis model. Empty = let the Print Bridge pick its default (proven to
 * work; the bridge wraps `claude --print`, where the "claude" alias is invalid).
 * Override with a valid CLI model (e.g. "sonnet", "opus") via HEALER_DIAGNOSE_MODEL.
 */
export function diagnoseModel(): string {
  return readEnvFile(['HEALER_DIAGNOSE_MODEL']).HEALER_DIAGNOSE_MODEL || '';
}

const ROUTER_TIMEOUT_MS = 90_000;

export interface RouterOpts {
  model?: string;
  systemPrompt?: string;
  maxTokens?: number;
}

interface RouterResponse {
  ok?: boolean;
  error?: string;
  code?: string;
  data?: { result?: string };
}

/** Call the AI Router. Returns the model's text, or null on any failure (never throws). */
export async function askRouter(
  prompt: string,
  opts: RouterOpts = {},
): Promise<string | null> {
  const key = routerKey();
  if (!key) {
    logger.warn('healer: ROUTER_SECRET missing — diagnosis disabled');
    return null;
  }
  const model = opts.model ?? diagnoseModel();
  const body: Record<string, unknown> = { prompt };
  if (model) body.model = model; // omit → bridge default (claude --print)
  if (opts.systemPrompt) body.system_prompt = opts.systemPrompt;
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ROUTER_TIMEOUT_MS);
  try {
    const res = await fetch(routerUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bridge-Key': key },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const json = (await res.json()) as RouterResponse;
    if (!json.ok) {
      logger.warn(
        { code: json.code, error: json.error },
        'healer: router error',
      );
      return null;
    }
    return json.data?.result?.trim() ?? null;
  } catch (err) {
    logger.warn({ err }, 'healer: router request failed');
    return null;
  } finally {
    clearTimeout(timer);
  }
}
