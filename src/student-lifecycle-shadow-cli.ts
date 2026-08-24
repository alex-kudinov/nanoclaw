import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { resetBusinessPool, withAgentContext } from './business-db.js';
import {
  runStudentLifecycleCatalog,
  STUDENT_LIFECYCLE_CATALOG_APPLY_CONFIRMATION,
} from './student-lifecycle-shadow-catalog.js';
import { loadStudentLifecycleShadowManifest } from './student-lifecycle-shadow-manifest.js';

export interface StudentLifecycleShadowCliOptions {
  mode: 'dry_run' | 'apply';
  manifestPath: string;
  observedAt: string;
  confirmation: typeof STUDENT_LIFECYCLE_CATALOG_APPLY_CONFIRMATION | null;
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--'))
    throw new Error(`${flag} requires a value`);
  return value;
}

export function parseStudentLifecycleShadowArgs(
  args: string[],
  codeRoot = process.env.NANOCLAW_CODE_ROOT || process.cwd(),
): StudentLifecycleShadowCliOptions {
  let mode: StudentLifecycleShadowCliOptions['mode'] | null = null;
  let manifestPath = path.join(
    codeRoot,
    'facts/catalogs/student-lifecycle-community-shadow-v1.json',
  );
  let observedAt: string | null = null;
  let confirmation: string | null = null;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--dry-run' || arg === '--apply') {
      if (mode !== null) throw new Error('exactly one mode is required');
      mode = arg === '--apply' ? 'apply' : 'dry_run';
    } else if (arg === '--manifest') {
      manifestPath = path.resolve(requireValue(args, index, arg));
      index++;
    } else if (arg === '--observed-at') {
      observedAt = requireValue(args, index, arg);
      index++;
    } else if (arg === '--confirm-apply') {
      confirmation = requireValue(args, index, arg);
      index++;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (mode === null) throw new Error('exactly one mode is required');
  if (!observedAt || new Date(observedAt).toISOString() !== observedAt) {
    throw new Error('--observed-at must be a canonical UTC timestamp');
  }
  if (
    mode === 'apply' &&
    confirmation !== STUDENT_LIFECYCLE_CATALOG_APPLY_CONFIRMATION
  ) {
    throw new Error('exact apply confirmation is required');
  }
  if (mode === 'dry_run' && confirmation !== null) {
    throw new Error('--confirm-apply is valid only with --apply');
  }
  return {
    mode,
    manifestPath,
    observedAt,
    confirmation:
      mode === 'apply' ? STUDENT_LIFECYCLE_CATALOG_APPLY_CONFIRMATION : null,
  };
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseStudentLifecycleShadowArgs(args);
  const manifest = loadStudentLifecycleShadowManifest(options.manifestPath);
  try {
    const report = await withAgentContext(
      'student-lifecycle-shadow-catalog',
      async (client) =>
        runStudentLifecycleCatalog({
          client,
          manifest,
          mode: options.mode,
          observedAt: options.observedAt,
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
      `Student lifecycle shadow catalog refused: ${
        error instanceof Error ? error.message : 'invalid invocation'
      }\n`,
    );
    process.exitCode = 1;
  });
}
