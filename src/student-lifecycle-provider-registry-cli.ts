import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { resetBusinessPool, withAgentContext } from './business-db.js';
import {
  compareLifecycleProviderRegistry,
  loadLifecycleProviderBaseline,
  loadLifecycleProviderSnapshot,
  reconcileLifecycleProviderRegistry,
} from './student-lifecycle-provider-registry.js';
import { PostgresStudentLifecycleRepository } from './student-lifecycle-store.js';

export const STUDENT_LIFECYCLE_REGISTRY_RECORD_CONFIRMATION =
  'NC-20260824-006-RECORD-REGISTRY' as const;

interface Options {
  mode: 'check' | 'record';
  phase: 'baseline' | 'shadow';
  baselinePath: string;
  snapshotPath: string;
  observedAt: string;
  shadowDestinationHost?: string;
  shadowUrlSha256?: string;
}

function required(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--'))
    throw new Error(`${flag} requires a value`);
  return value;
}

export function parseStudentLifecycleProviderRegistryArgs(
  args: string[],
  codeRoot = process.env.NANOCLAW_CODE_ROOT || process.cwd(),
): Options {
  let mode: Options['mode'] | null = null;
  let phase: Options['phase'] | null = null;
  let baselinePath = path.join(
    codeRoot,
    'facts/catalogs/student-lifecycle-community-provider-baseline-v1.json',
  );
  let snapshotPath = '';
  let observedAt = '';
  let shadowDestinationHost: string | undefined;
  let shadowUrlSha256: string | undefined;
  let confirmation: string | null = null;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--check' || arg === '--record') {
      if (mode) throw new Error('exactly one mode is required');
      mode = arg === '--record' ? 'record' : 'check';
    } else if (arg === '--phase') {
      const value = required(args, index, arg);
      if (value !== 'baseline' && value !== 'shadow')
        throw new Error('--phase is invalid');
      phase = value;
      index++;
    } else if (arg === '--baseline') {
      baselinePath = path.resolve(required(args, index, arg));
      index++;
    } else if (arg === '--snapshot') {
      snapshotPath = path.resolve(required(args, index, arg));
      index++;
    } else if (arg === '--observed-at') {
      observedAt = required(args, index, arg);
      index++;
    } else if (arg === '--shadow-destination-host') {
      shadowDestinationHost = required(args, index, arg);
      index++;
    } else if (arg === '--shadow-url-sha256') {
      shadowUrlSha256 = required(args, index, arg);
      index++;
    } else if (arg === '--confirm-record') {
      confirmation = required(args, index, arg);
      index++;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!mode) throw new Error('exactly one mode is required');
  if (!phase) throw new Error('--phase is required');
  if (!snapshotPath) throw new Error('--snapshot is required');
  if (!observedAt || new Date(observedAt).toISOString() !== observedAt) {
    throw new Error('--observed-at must be a canonical UTC timestamp');
  }
  if (
    mode === 'record' &&
    confirmation !== STUDENT_LIFECYCLE_REGISTRY_RECORD_CONFIRMATION
  ) {
    throw new Error('exact record confirmation is required');
  }
  if (mode === 'check' && confirmation !== null) {
    throw new Error('--confirm-record is valid only with --record');
  }
  if (phase === 'shadow' && (!shadowDestinationHost || !shadowUrlSha256)) {
    throw new Error('shadow phase requires destination host and URL SHA-256');
  }
  return {
    mode,
    phase,
    baselinePath,
    snapshotPath,
    observedAt,
    shadowDestinationHost,
    shadowUrlSha256,
  };
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseStudentLifecycleProviderRegistryArgs(args);
  const baseline = loadLifecycleProviderBaseline(options.baselinePath);
  const current = loadLifecycleProviderSnapshot(options.snapshotPath);
  if (options.mode === 'check') {
    process.stdout.write(
      `${JSON.stringify(compareLifecycleProviderRegistry({ ...options, baseline, current }), null, 2)}\n`,
    );
    return;
  }
  try {
    const report = await withAgentContext(
      'student-lifecycle-provider-registry',
      async (client) =>
        reconcileLifecycleProviderRegistry({
          ...options,
          repository: new PostgresStudentLifecycleRepository(client),
          baseline,
          current,
        }),
    );
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
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
      `Student lifecycle registry refused: ${error instanceof Error ? error.message : 'invalid invocation'}\n`,
    );
    process.exitCode = 1;
  });
}
