/**
 * Email open tracking handler.
 * Called by the webhook server when a tracking pixel is loaded.
 * Records the open in the DB only — email opens no longer spawn an inbox
 * agent (the notification turn was pure token cost with no action taken).
 */

import { recordEmailOpen } from './db.js';
import { logger } from './logger.js';

export async function handleEmailOpen(
  token: string,
  userAgent: string,
  // Retained only so the index.ts wiring still type-checks; email opens no
  // longer route to the inbox agent. Unused.
  _sendToInbox: (msg: string) => Promise<void>,
): Promise<void> {
  const result = recordEmailOpen(token, userAgent);
  if (!result) {
    logger.debug(
      { token },
      'Email open: unknown tracking token or record failed',
    );
    return;
  }
  // Open recorded in email_tracking — no inbox message, no agent spawn.
}
