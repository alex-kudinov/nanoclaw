import fs from 'fs';
import path from 'path';

import pino from 'pino';
import pinoPretty from 'pino-pretty';

import { resolveJsonlPath } from './logger-path.js';

const level: pino.Level = (process.env.LOG_LEVEL as pino.Level) || 'info';

/**
 * Structured-JSON sink path. The self-healing collector tails this file (a
 * crashed daemon can't push its own errors, so the collector pulls). Override
 * with NANOCLAW_JSONL_PATH (used by tests). Empty string disables the sink.
 */
/**
 * Dual output: pretty (colorized) to stdout for humans, raw JSON lines to
 * logs/nanoclaw.jsonl for the collector. multistream writes the same serialized
 * record to each stream — pino-pretty transforms it to pretty, the file stream
 * gets ndjson. The JSON sink is best-effort: if it can't be opened the logger
 * degrades to pretty-only rather than crashing the daemon.
 */
function buildStream(): pino.MultiStreamRes {
  const streams: pino.StreamEntry[] = [
    { level, stream: pinoPretty({ colorize: true, sync: true }) },
  ];
  const jsonl = resolveJsonlPath();
  if (jsonl) {
    try {
      fs.mkdirSync(path.dirname(jsonl), { recursive: true });
      streams.push({
        level,
        stream: fs.createWriteStream(jsonl, { flags: 'a' }),
      });
    } catch {
      // Unwritable JSON sink — keep pretty-only; never block logging.
    }
  }
  return pino.multistream(streams);
}

export const logger = pino({ level }, buildStream());

// Route uncaught errors through pino so they get timestamps in stderr
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled rejection');
});
