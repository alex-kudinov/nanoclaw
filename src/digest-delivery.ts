/**
 * Daily digest delivery — sends the rendered digest via Gmail + a Slack DM.
 *
 * Called from scripts/run-digest.ts (host-side cron job, see T22). Runs in a
 * separate process from the main NanoClaw daemon, so it constructs its own
 * Slack WebClient rather than reaching into the channel registry.
 *
 * Retries are bounded (1 primary + 1 retry) to stay inside the 10-minute SLA.
 */

import { WebClient } from '@slack/web-api';

import { assertExternalWriteAllowed } from './action-safety.js';
import { setRouterState } from './db.js';
import { readEnvFile } from './env.js';
import { sendEmail } from './gmail-api.js';
import { logger } from './logger.js';

const MAX_RETRIES = 1;
const RETRY_BACKOFF_MS = 500;

type Recipient = 'alex' | 'cherie';

interface RecipientTargets {
  email: string;
  slackUid: string | null;
}

function lookupRecipient(recipient: Recipient): RecipientTargets {
  const upper = recipient.toUpperCase();
  const env = readEnvFile([
    `DIGEST_EMAIL_${upper}`,
    `DIGEST_SLACK_UID_${upper}`,
  ]);
  const email = env[`DIGEST_EMAIL_${upper}`];
  if (!email) {
    throw new Error(`digest-delivery: DIGEST_EMAIL_${upper} not set in .env`);
  }
  return {
    email,
    slackUid: env[`DIGEST_SLACK_UID_${upper}`] || null,
  };
}

function buildSubject(itemCount: number): string {
  const date = new Date().toISOString().slice(0, 10);
  return `Important Email Digest — ${date} — ${itemCount} items`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function sendDigestEmail(
  targets: RecipientTargets,
  html: string,
  itemCount: number,
): Promise<boolean> {
  const subject = buildSubject(itemCount);
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      await sendEmail({
        to: targets.email,
        subject,
        body: html,
        html: true,
      });
      return true;
    } catch (err) {
      logger.warn(
        { err, attempt, to: targets.email },
        'digest-delivery: gmail send failed',
      );
      if (attempt < MAX_RETRIES) await sleep(RETRY_BACKOFF_MS);
    }
  }
  return false;
}

async function sendSlackDm(
  targets: RecipientTargets,
  itemCount: number,
): Promise<boolean> {
  if (!targets.slackUid) {
    logger.info('digest-delivery: no slack uid configured, skipping DM');
    return true;
  }
  const env = readEnvFile(['SLACK_BOT_TOKEN']);
  const token = env.SLACK_BOT_TOKEN;
  if (!token) {
    logger.warn('digest-delivery: SLACK_BOT_TOKEN missing, skipping DM');
    return false;
  }
  const client = new WebClient(token);
  try {
    assertExternalWriteAllowed({
      system: 'slack',
      actionClass: 'c3_external_communication',
      source: 'host:digest-delivery',
    });
    await client.chat.postMessage({
      channel: targets.slackUid,
      text: `Daily digest sent: ${itemCount} items. Check your inbox.`,
    });
    return true;
  } catch (err) {
    logger.warn({ err }, 'digest-delivery: slack DM failed');
    return false;
  }
}

function deadLetter(
  recipient: Recipient,
  reason: string,
  htmlPreview: string,
): void {
  const key = `digest_failed_${recipient}_${new Date()
    .toISOString()
    .replace(/[:.]/g, '-')}`;
  setRouterState(
    key,
    JSON.stringify({ reason, html_preview: htmlPreview.slice(0, 500) }),
  );
  logger.error(
    { recipient, reason, key },
    'digest-delivery: dead-lettered after both channels failed',
  );
}

export async function sendDigest(
  recipient: Recipient,
  html: string,
  itemCount: number,
): Promise<void> {
  if (itemCount === 0) {
    logger.info({ recipient }, 'digest-delivery: 0 items, skipping delivery');
    return;
  }
  const targets = lookupRecipient(recipient);
  const emailOk = await sendDigestEmail(targets, html, itemCount);
  const slackOk = await sendSlackDm(targets, itemCount);
  if (!emailOk && !slackOk) {
    deadLetter(recipient, 'both gmail and slack delivery failed', html);
    throw new Error(`digest-delivery: all channels failed for ${recipient}`);
  }
  setRouterState(`digest_last_sent_${recipient}`, new Date().toISOString());
  logger.info(
    { recipient, itemCount, emailOk, slackOk },
    'digest-delivery: complete',
  );
}
