/** Read-only host command for the Company OS receivables review packet. */

import { pathToFileURL } from 'node:url';

import { resetBusinessPool } from './business-db.js';
import {
  buildFollowupReviewPacket,
  DEFAULT_FOLLOWUP_REVIEW_LIMIT,
  MAX_FOLLOWUP_REVIEW_LIMIT,
  type FollowupReviewPacket,
} from './followup-review.js';
import {
  readFollowupShadowSources,
  type FollowupShadowSourceResult,
} from './followup-shadow-source.js';

export interface FollowupReviewCliOptions {
  mode: 'dry_run';
  observedAt: string;
  limit: number;
}

export interface FollowupReviewCliDependencies {
  readSources(observedAt: string): Promise<FollowupShadowSourceResult>;
  writeOutput(value: string): void;
  reset(): Promise<void>;
}

function value(args: string[], index: number, flag: string): string {
  const next = args[index + 1];
  if (!next || next.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return next;
}

export function parseFollowupReviewArgs(
  args: string[],
  now = new Date(),
): FollowupReviewCliOptions {
  let modeSeen = false;
  let observedAt = now.toISOString();
  let limit = DEFAULT_FOLLOWUP_REVIEW_LIMIT;
  let limitSeen = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--dry-run') {
      if (modeSeen) throw new Error('mode may be supplied only once');
      modeSeen = true;
    } else if (arg === '--observed-at') {
      observedAt = value(args, index++, arg);
    } else if (arg === '--limit') {
      if (limitSeen) throw new Error('--limit may be supplied only once');
      limitSeen = true;
      const raw = value(args, index++, arg);
      if (!/^[0-9]+$/.test(raw)) {
        throw new Error('--limit must be a positive integer');
      }
      limit = Number(raw);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!Number.isFinite(Date.parse(observedAt))) {
    throw new Error('--observed-at must be ISO-8601');
  }
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_FOLLOWUP_REVIEW_LIMIT
  ) {
    throw new Error(
      `--limit must be an integer from 1 to ${MAX_FOLLOWUP_REVIEW_LIMIT}`,
    );
  }
  return {
    mode: 'dry_run',
    observedAt: new Date(observedAt).toISOString(),
    limit,
  };
}

const DEFAULT_DEPS: FollowupReviewCliDependencies = {
  readSources: readFollowupShadowSources,
  writeOutput: (output) => process.stdout.write(output),
  reset: resetBusinessPool,
};

export async function runFollowupReviewCli(
  args: string[],
  deps: FollowupReviewCliDependencies = DEFAULT_DEPS,
): Promise<FollowupReviewPacket> {
  const options = parseFollowupReviewArgs(args);
  try {
    const source = await deps.readSources(options.observedAt);
    const packet = buildFollowupReviewPacket({
      observedAt: options.observedAt,
      ...source,
      limit: options.limit,
    });
    deps.writeOutput(
      `${JSON.stringify({ mode: options.mode, packet }, null, 2)}\n`,
    );
    return packet;
  } finally {
    await deps.reset();
  }
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  runFollowupReviewCli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(
      `Company follow-up review refused: ${error instanceof Error ? error.message : 'invalid invocation'}\n`,
    );
    process.exitCode = 1;
  });
}
