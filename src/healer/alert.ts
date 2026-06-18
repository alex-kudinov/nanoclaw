/**
 * Out-of-band alert fallback (self-healing Phase 0).
 *
 * When the healer can't reach Slack/Bridge (e.g. the very outage it's trying to
 * report), it escalates via toolbox alert.sh → Pushover/email, which needs no
 * Claude and no daemon. Best-effort: a failed alert must never crash a heal run.
 */

import { execFile } from 'child_process';
import os from 'os';
import path from 'path';

import { logger } from '../logger.js';

function alertScriptPath(): string {
  return (
    process.env.HEALER_ALERT_SH ||
    path.join(
      os.homedir(),
      'dev',
      'toolbox',
      'shared',
      'claude',
      'lib',
      'alert.sh',
    )
  );
}

export type AlertLevel = 'info' | 'warn' | 'critical';

/** Fire alert.sh. Always resolves — a failed alert never crashes a heal run. */
export async function alert(
  level: AlertLevel,
  subject: string,
  message: string,
): Promise<void> {
  return new Promise((resolve) => {
    execFile(
      alertScriptPath(),
      ['--level', level, '--subject', subject, '--message', message],
      { timeout: 30_000 },
      (err) => {
        if (err) {
          logger.warn({ err, subject }, 'healer: alert.sh fallback failed');
        }
        resolve();
      },
    );
  });
}
