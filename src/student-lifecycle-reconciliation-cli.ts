import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { resetBusinessPool, withAgentContext } from './business-db.js';
import {
  type LifecycleSnapshotInput,
  reconcileLifecycleSnapshot,
} from './student-lifecycle-reconciliation.js';
import { PostgresStudentLifecycleRepository } from './student-lifecycle-store.js';

export const STUDENT_LIFECYCLE_RECONCILIATION_RECORD_CONFIRMATION =
  'NC-20260824-006-RECORD-RECONCILIATION' as const;

interface Options {
  mode: 'check' | 'record';
  snapshotPath: string;
}

function required(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--'))
    throw new Error(`${flag} requires a value`);
  return value;
}

export function parseStudentLifecycleReconciliationArgs(
  args: string[],
): Options {
  let mode: Options['mode'] | null = null;
  let snapshotPath = '';
  let confirmation: string | null = null;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--check' || arg === '--record') {
      if (mode) throw new Error('exactly one mode is required');
      mode = arg === '--record' ? 'record' : 'check';
    } else if (arg === '--snapshot') {
      snapshotPath = path.resolve(required(args, index, arg));
      index++;
    } else if (arg === '--confirm-record') {
      confirmation = required(args, index, arg);
      index++;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!mode) throw new Error('exactly one mode is required');
  if (!snapshotPath) throw new Error('--snapshot is required');
  if (
    mode === 'record' &&
    confirmation !== STUDENT_LIFECYCLE_RECONCILIATION_RECORD_CONFIRMATION
  ) {
    throw new Error('exact record confirmation is required');
  }
  if (mode === 'check' && confirmation !== null) {
    throw new Error('--confirm-record is valid only with --record');
  }
  return { mode, snapshotPath };
}

function loadSnapshots(filePath: string): LifecycleSnapshotInput[] {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  const data =
    parsed &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    'data' in parsed
      ? (parsed as { data: unknown }).data
      : parsed;
  const snapshots =
    data &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    'snapshots' in data
      ? (data as { snapshots: unknown }).snapshots
      : data;
  if (
    !Array.isArray(snapshots) ||
    snapshots.length < 1 ||
    snapshots.length > 8
  ) {
    throw new Error('student_lifecycle_reconciliation_snapshot_file_invalid');
  }
  return snapshots as LifecycleSnapshotInput[];
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseStudentLifecycleReconciliationArgs(args);
  const snapshots = loadSnapshots(options.snapshotPath);
  if (options.mode === 'check') {
    const reports = [];
    for (const snapshot of snapshots) {
      reports.push(
        await reconcileLifecycleSnapshot({
          repository: {
            recordReconciliationRun: async () => ({ id: 0, duplicate: false }),
          },
          snapshot,
        }),
      );
    }
    process.stdout.write(
      `${JSON.stringify({ mode: 'check', reports, actionAuthority: 'none', circle: false }, null, 2)}\n`,
    );
    return;
  }
  try {
    const reports = await withAgentContext(
      'student-lifecycle-reconciliation-cli',
      async (client) => {
        const repository = new PostgresStudentLifecycleRepository(client);
        const output = [];
        for (const snapshot of snapshots) {
          output.push(
            await reconcileLifecycleSnapshot({ repository, snapshot }),
          );
        }
        return output;
      },
    );
    process.stdout.write(
      `${JSON.stringify({ mode: 'record', reports, actionAuthority: 'none', circle: false }, null, 2)}\n`,
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
      `Student lifecycle reconciliation refused: ${error instanceof Error ? error.message : 'invalid invocation'}\n`,
    );
    process.exitCode = 1;
  });
}
