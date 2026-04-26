#!/usr/bin/env npx tsx
/**
 * Entry point for the daily digest cron job.
 * Invoked via tools/digest/run-digest.sh by the NanoClaw scheduler.
 *
 * Arguments:
 *   --recipient <alex|cherie>   Required. Which recipient to generate for.
 *   --since <ISO>               Optional. Override the default (24h window).
 *
 * Exit codes:
 *   0 — success
 *   1 — invalid arguments or unrecoverable failure
 */

import { generateDigest } from '../src/digest-generator.js';
import { sendDigest } from '../src/digest-delivery.js';
import { getRouterState, initDatabase } from '../src/db.js';
import { logger } from '../src/logger.js';

type Recipient = 'alex' | 'cherie';

function parseArgs(argv: string[]): { recipient: Recipient; sinceISO: string | null } {
  let recipient: Recipient | null = null;
  let sinceISO: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--recipient') {
      const v = argv[++i];
      if (v !== 'alex' && v !== 'cherie') {
        throw new Error(`run-digest: invalid recipient "${v}" (expected alex|cherie)`);
      }
      recipient = v;
    } else if (arg === '--since') {
      sinceISO = argv[++i];
    }
  }
  if (!recipient) {
    throw new Error('run-digest: --recipient <alex|cherie> is required');
  }
  return { recipient, sinceISO };
}

function defaultSinceISO(recipient: Recipient): string {
  const stored = getRouterState(`digest_last_sent_${recipient}`);
  if (stored) return stored;
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

async function main(): Promise<void> {
  initDatabase();
  const { recipient, sinceISO: argSince } = parseArgs(process.argv.slice(2));
  const sinceISO = argSince || defaultSinceISO(recipient);
  logger.info({ recipient, sinceISO }, 'run-digest: starting');

  const result = await generateDigest({ recipientName: recipient, sinceISO });
  logger.info(
    { recipient, itemCount: result.itemCount },
    'run-digest: digest generated',
  );

  await sendDigest(recipient, result.html, result.itemCount);
  logger.info({ recipient }, 'run-digest: delivery complete');
}

main().catch((err) => {
  logger.error({ err }, 'run-digest: fatal');
  process.exit(1);
});
