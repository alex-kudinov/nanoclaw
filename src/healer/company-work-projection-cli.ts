/** Default-dry-run Company Work plan for the read-only healer catalog. */

import { pathToFileURL } from 'node:url';

import { resetBusinessPool } from '../business-db.js';
import {
  buildHealerCompanyWorkPlan,
  formatHealerCompanyWorkPlan,
} from './company-work-projection.js';
import { readHealerResolutionCatalog } from './resolution-catalog.js';

export interface HealerCompanyWorkPlanCliOptions {
  json: boolean;
  limit?: number;
}

export function parseHealerCompanyWorkPlanArgs(
  args: string[],
): HealerCompanyWorkPlanCliOptions {
  const options: HealerCompanyWorkPlanCliOptions = { json: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--json') options.json = true;
    else if (arg === '--limit') {
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
  const options = parseHealerCompanyWorkPlanArgs(args);
  try {
    const catalog = await readHealerResolutionCatalog({ limit: options.limit });
    const plan = buildHealerCompanyWorkPlan(catalog);
    process.stdout.write(formatHealerCompanyWorkPlan(plan, options.json));
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
