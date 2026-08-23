/** Standalone read-only operator view for healer resolutions and decisions. */

import { pathToFileURL } from 'node:url';

import { resetBusinessPool } from '../business-db.js';
import {
  formatHealerResolutionCatalog,
  readHealerResolutionCatalog,
} from './resolution-catalog.js';

export interface HealerResolutionCatalogCliOptions {
  json: boolean;
  limit?: number;
}

export function parseHealerResolutionCatalogArgs(
  args: string[],
): HealerResolutionCatalogCliOptions {
  const options: HealerResolutionCatalogCliOptions = { json: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--limit') {
      const raw = args[++index];
      if (!raw || !/^[1-9][0-9]*$/.test(raw)) {
        throw new Error('--limit requires a positive integer');
      }
      options.limit = Number(raw);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseHealerResolutionCatalogArgs(args);
  try {
    const catalog = await readHealerResolutionCatalog({ limit: options.limit });
    process.stdout.write(formatHealerResolutionCatalog(catalog, options.json));
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
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
