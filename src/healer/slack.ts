/**
 * Healer's own Slack client (self-healing Phase 0).
 *
 * The healer is a separate process and must talk to Slack DIRECTLY — never via
 * the daemon's IPC, which dies with the daemon (the whole point of catching
 * daemon crashes). Mirrors src/digest-delivery.ts, which constructs its own
 * WebClient for the same reason.
 */

import { WebClient } from '@slack/web-api';

import { readEnvFile } from '../env.js';
import { logger } from '../logger.js';

/** #gru-incidents — overridable for testing/other workspaces. */
export const INCIDENTS_CHANNEL =
  readEnvFile(['HEALER_INCIDENTS_CHANNEL']).HEALER_INCIDENTS_CHANNEL ||
  'C0BAGCEBDM0';

let cached: WebClient | null = null;

function getClient(): WebClient | null {
  if (cached) return cached;
  const token = readEnvFile(['SLACK_BOT_TOKEN']).SLACK_BOT_TOKEN;
  if (!token) {
    logger.warn('healer: SLACK_BOT_TOKEN missing — Slack disabled');
    return null;
  }
  cached = new WebClient(token);
  return cached;
}

/** Post text to #gru-incidents. Returns false (never throws) on any failure. */
export async function postIncidents(text: string): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  try {
    await client.chat.postMessage({ channel: INCIDENTS_CHANNEL, text });
    return true;
  } catch (err) {
    logger.warn({ err }, 'healer: slack post failed');
    return false;
  }
}
