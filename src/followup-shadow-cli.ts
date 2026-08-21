import { pathToFileURL } from 'node:url';

import { resetBusinessPool, withAgentContext } from './business-db.js';
import { projectFollowupCaseWithClient } from './followup-case-store.js';
import {
  buildFollowupShadowReport,
  followupShadowProjectionInputs,
} from './followup-shadow.js';
import { readFollowupShadowSources } from './followup-shadow-source.js';

export const FOLLOWUP_SHADOW_APPLY_CONFIRMATION =
  'COMPANY-FOLLOWUP-SHADOW-APPLY';

interface FollowupShadowCliOptions {
  mode: 'dry_run' | 'apply';
  observedAt: string;
  expectedSnapshotFingerprint: string | null;
  confirmation: string | null;
}

function value(args: string[], index: number, flag: string): string {
  const next = args[index + 1];
  if (!next || next.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return next;
}

export function parseFollowupShadowArgs(
  args: string[],
  now = new Date(),
): FollowupShadowCliOptions {
  let mode: 'dry_run' | 'apply' = 'dry_run';
  let modeSeen = false;
  let observedAt = now.toISOString();
  let expectedSnapshotFingerprint: string | null = null;
  let confirmation: string | null = null;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--dry-run' || arg === '--apply') {
      if (modeSeen) throw new Error('mode may be supplied only once');
      modeSeen = true;
      mode = arg === '--apply' ? 'apply' : 'dry_run';
    } else if (arg === '--observed-at') {
      observedAt = value(args, index++, arg);
    } else if (arg === '--expected-snapshot-fingerprint') {
      expectedSnapshotFingerprint = value(args, index++, arg);
    } else if (arg === '--confirm-apply') {
      confirmation = value(args, index++, arg);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!Number.isFinite(Date.parse(observedAt))) {
    throw new Error('--observed-at must be ISO-8601');
  }
  observedAt = new Date(observedAt).toISOString();
  if (mode === 'apply') {
    if (!expectedSnapshotFingerprint?.match(/^[0-9a-f]{64}$/)) {
      throw new Error('--expected-snapshot-fingerprint is required for apply');
    }
    if (confirmation !== FOLLOWUP_SHADOW_APPLY_CONFIRMATION) {
      throw new Error('exact apply confirmation is required');
    }
  } else if (expectedSnapshotFingerprint || confirmation) {
    throw new Error('apply bindings are not valid for dry-run');
  }
  return {
    mode,
    observedAt,
    expectedSnapshotFingerprint,
    confirmation,
  };
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseFollowupShadowArgs(args);
  try {
    const source = await readFollowupShadowSources(options.observedAt);
    const report = buildFollowupShadowReport({
      observedAt: options.observedAt,
      ...source,
    });
    if (options.mode === 'dry_run') {
      process.stdout.write(
        `${JSON.stringify({ mode: options.mode, report }, null, 2)}\n`,
      );
      if (report.sourceErrors.length > 0) process.exitCode = 2;
      return;
    }
    if (report.sourceErrors.length > 0) {
      throw new Error('apply refused because required source reads failed');
    }
    if (report.snapshotFingerprint !== options.expectedSnapshotFingerprint) {
      throw new Error('apply refused because the source snapshot changed');
    }
    const projection = await withAgentContext(
      'company-followup-shadow:host',
      async (client) => {
        let applied = 0;
        let unchanged = 0;
        for (const input of followupShadowProjectionInputs(
          source.observations,
          options.observedAt,
        )) {
          const result = await projectFollowupCaseWithClient(client, input);
          if (result.applied) applied++;
          else unchanged++;
        }
        return { applied, unchanged };
      },
    );
    process.stdout.write(
      `${JSON.stringify({ mode: options.mode, report, projection }, null, 2)}\n`,
    );
  } finally {
    await resetBusinessPool();
  }
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((error) => {
    process.stderr.write(
      `Company follow-up shadow refused: ${error instanceof Error ? error.message : 'invalid invocation'}\n`,
    );
    process.exitCode = 1;
  });
}
