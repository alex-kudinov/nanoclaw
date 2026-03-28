/**
 * Email open tracking handler.
 * Called by webhook server when a tracking pixel is loaded.
 * Delegates DB operations to db.ts, sends notifications to inbox.
 */

import { recordEmailOpen } from './db.js';
import { logger } from './logger.js';

export async function handleEmailOpen(
  token: string,
  userAgent: string,
  sendToInbox: (msg: string) => Promise<void>,
): Promise<void> {
  const result = recordEmailOpen(token, userAgent);
  if (!result) {
    logger.debug({ token }, 'Email open: unknown tracking token');
    return;
  }

  const { leadId, emailType, openCount, firstOpenedAt, shouldNotify } = result;
  if (shouldNotify) {
    const msg = [
      '[EMAIL-OPENED]',
      `Lead ID: ${leadId}`,
      `Email: ${emailType}`,
      `Opens: ${openCount} (first: ${firstOpenedAt})`,
      `Tracking: ${token}`,
    ].join('\n');

    try {
      await sendToInbox(msg);
    } catch (err) {
      logger.warn({ err, leadId }, 'Failed to send email open notification');
    }

    logger.info(
      { leadId, emailType, openCount },
      'Email open notification sent',
    );
  }
}
