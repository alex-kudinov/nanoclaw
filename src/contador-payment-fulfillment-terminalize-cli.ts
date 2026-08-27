import {
  inspectExpiredContadorFulfillmentCases,
  terminalizeExpiredContadorFulfillmentCases,
  type ContadorExpiredCaseSpec,
} from './contador-payment-fulfillment-store.js';
import { resetBusinessPool } from './business-db.js';
import { pathToFileURL } from 'url';

export function parseContadorTerminalizationArgs(argv: string[]): {
  apply: boolean;
  specs: ContadorExpiredCaseSpec[];
} {
  let apply = false;
  const specs: ContadorExpiredCaseSpec[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') {
      apply = true;
      continue;
    }
    if (arg !== '--case' || !argv[i + 1]) {
      throw new Error('usage_error');
    }
    const match = /^([1-9][0-9]*):([0-9]+):([1-9][0-9]*)$/.exec(argv[++i]);
    if (!match) throw new Error('case_spec_invalid');
    specs.push({
      caseId: match[1],
      expectedVersion: Number(match[2]),
      expectedAttemptCount: Number(match[3]),
    });
  }
  if (specs.length < 1 || specs.length > 20) {
    throw new Error('case_batch_out_of_bounds');
  }
  if (new Set(specs.map((spec) => spec.caseId)).size !== specs.length) {
    throw new Error('case_id_duplicate');
  }
  return { apply, specs };
}

function boundedError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('case_missing')) return 'case_missing';
  if (message.includes('version_mismatch')) return 'version_mismatch';
  if (message.includes('attempt_count_mismatch')) {
    return 'attempt_count_mismatch';
  }
  if (message.includes('state_not_processing')) return 'state_not_processing';
  if (message.includes('lease_not_expired')) return 'lease_not_expired';
  if (message.includes('usage_error')) return 'usage_error';
  if (message.includes('case_spec_invalid')) return 'case_spec_invalid';
  if (message.includes('case_batch_out_of_bounds')) {
    return 'case_batch_out_of_bounds';
  }
  if (message.includes('case_id_duplicate')) return 'case_id_duplicate';
  return 'terminalization_failed';
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const { apply, specs } = parseContadorTerminalizationArgs(argv);
  if (!apply) {
    const cases = await inspectExpiredContadorFulfillmentCases(specs);
    process.stdout.write(
      `${JSON.stringify({ ok: true, mode: 'dry_run', count: cases.length, cases })}\n`,
    );
    return;
  }
  const results = await terminalizeExpiredContadorFulfillmentCases(
    specs,
    new Date().toISOString(),
  );
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      mode: 'applied',
      count: results.length,
      cases: results.map((result) => ({
        caseId: result.item.id,
        state: result.item.state,
        version: result.item.version,
        attemptCount: result.item.attemptCount,
        errorCode: result.item.lastErrorCode,
        alreadyTerminalized: result.alreadyTerminalized,
      })),
    })}\n`,
  );
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main()
    .catch((error) => {
      process.stderr.write(
        `${JSON.stringify({ ok: false, errorCode: boundedError(error) })}\n`,
      );
      process.exitCode = 1;
    })
    .finally(resetBusinessPool);
}
