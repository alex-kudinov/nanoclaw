/**
 * Healer's own Slack client (self-healing Phase 0).
 *
 * The healer is a separate process and must talk to Slack DIRECTLY — never via
 * the daemon's IPC, which dies with the daemon (the whole point of catching
 * daemon crashes). Mirrors src/digest-delivery.ts, which constructs its own
 * WebClient for the same reason.
 */

import { WebClient } from '@slack/web-api';

import { assertExternalWriteAllowed } from '../action-safety.js';
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

export interface PostOpts {
  /** Reply in this thread (the incident's root ts) instead of posting top-level. */
  threadTs?: string;
}

/** Post text to #gru-incidents. Returns false (never throws) on any failure. */
export async function postIncidents(
  text: string,
  opts: PostOpts = {},
): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  try {
    assertExternalWriteAllowed({
      system: 'slack',
      actionClass: 'c3_external_communication',
      source: 'host:healer-slack',
    });
    await client.chat.postMessage({
      channel: INCIDENTS_CHANNEL,
      text,
      ...(opts.threadTs ? { thread_ts: opts.threadTs } : {}),
    });
    return true;
  } catch (err) {
    logger.warn({ err }, 'healer: slack post failed');
    return false;
  }
}

/** Like postIncidents but returns the message ref so callers can poll approvals. */
export async function postIncidentsRef(
  text: string,
  opts: PostOpts = {},
): Promise<{ channel: string; ts: string } | null> {
  const client = getClient();
  if (!client) return null;
  try {
    assertExternalWriteAllowed({
      system: 'slack',
      actionClass: 'c3_external_communication',
      source: 'host:healer-slack',
    });
    const r = await client.chat.postMessage({
      channel: INCIDENTS_CHANNEL,
      text,
      ...(opts.threadTs ? { thread_ts: opts.threadTs } : {}),
    });
    return r.ts ? { channel: INCIDENTS_CHANNEL, ts: r.ts } : null;
  } catch (err) {
    logger.warn({ err }, 'healer: slack post (ref) failed');
    return null;
  }
}

/** Reactions on a message: array of { name, users[] }. [] on any failure. */
export async function getReactions(
  channel: string,
  ts: string,
): Promise<Array<{ name: string; users: string[] }>> {
  const client = getClient();
  if (!client) return [];
  try {
    const r = await client.reactions.get({
      channel,
      timestamp: ts,
      full: true,
    });
    const reactions = (
      r.message as { reactions?: Array<{ name?: string; users?: string[] }> }
    )?.reactions;
    return (reactions ?? []).map((x) => ({
      name: x.name ?? '',
      users: x.users ?? [],
    }));
  } catch (err) {
    logger.warn({ err }, 'healer: reactions.get failed');
    return [];
  }
}

/** Thread replies (excluding the parent): { user, text }[]. [] on any failure. */
export async function getReplies(
  channel: string,
  ts: string,
): Promise<Array<{ user: string; text: string }>> {
  const client = getClient();
  if (!client) return [];
  try {
    const r = await client.conversations.replies({ channel, ts, limit: 50 });
    const msgs = (r.messages ?? []) as Array<{
      ts?: string;
      user?: string;
      text?: string;
    }>;
    return msgs
      .filter((m) => m.ts !== ts && m.user)
      .map((m) => ({ user: m.user ?? '', text: m.text ?? '' }));
  } catch (err) {
    logger.warn({ err }, 'healer: conversations.replies failed');
    return [];
  }
}
