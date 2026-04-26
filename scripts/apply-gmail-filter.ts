#!/usr/bin/env npx tsx
/**
 * Gmail filter export + apply — for 1-click rollback of the info@ forwarding
 * cutover (T24 of the bidirectional Gmail classification plan).
 *
 * Modes:
 *   --export --file PATH        Snapshot all current filters to PATH (for pre-cutover backup)
 *   --file PATH --dry-run       Show what would be re-applied, without writing
 *   --file PATH                 Re-apply filters from PATH (rollback). Skips filters
 *                               whose id already exists on the account.
 *
 * Usage:
 *   npx tsx scripts/apply-gmail-filter.ts --export --file setup/gmail/pre-cutover-filter.json
 *   npx tsx scripts/apply-gmail-filter.ts --file setup/gmail/pre-cutover-filter.json --dry-run
 *   npx tsx scripts/apply-gmail-filter.ts --file setup/gmail/pre-cutover-filter.json
 *
 * Scopes required on the refresh token:
 *   - https://www.googleapis.com/auth/gmail.settings.basic
 *   (If missing, the Gmail API will return 403 with "insufficient authentication
 *    scopes". Re-run `npm run gmail:auth` with the scope added.)
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { getGmailClient } from '../src/gmail-auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

interface ParsedArgs {
  mode: 'export' | 'apply' | 'dry-run';
  file: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  const fileIdx = args.indexOf('--file');
  if (fileIdx === -1 || !args[fileIdx + 1]) {
    throw new Error('--file PATH is required');
  }
  const file = resolve(REPO_ROOT, args[fileIdx + 1]);
  const isExport = args.includes('--export');
  const isDryRun = args.includes('--dry-run');
  if (isExport && isDryRun) {
    throw new Error('--export and --dry-run are mutually exclusive');
  }
  return {
    mode: isExport ? 'export' : isDryRun ? 'dry-run' : 'apply',
    file,
  };
}

async function exportFilters(file: string): Promise<void> {
  const gmail = getGmailClient();
  const filtersRes = await gmail.users.settings.filters.list({ userId: 'me' });
  const filters = filtersRes.data.filter || [];
  const autoRes = await gmail.users.settings.getAutoForwarding({ userId: 'me' });
  const addrsRes = await gmail.users.settings.forwardingAddresses.list({
    userId: 'me',
  });
  const payload = {
    exported_at: new Date().toISOString(),
    user: 'me',
    count: filters.length,
    filters,
    autoForwarding: autoRes.data,
    forwardingAddresses: addrsRes.data.forwardingAddresses || [],
  };
  writeFileSync(file, JSON.stringify(payload, null, 2) + '\n', 'utf-8');
  console.log(`apply-gmail-filter: exported ${filters.length} filters + auto-forwarding to ${file}`);
  for (const f of filters) {
    const crit = JSON.stringify(f.criteria || {});
    const act = JSON.stringify(f.action || {});
    console.log(`  filter ${f.id}: criteria=${crit} action=${act}`);
  }
  console.log(
    `  autoForwarding: enabled=${autoRes.data.enabled} target=${autoRes.data.emailAddress || '-'} disposition=${autoRes.data.disposition || '-'}`,
  );
}

interface PayloadAutoForwarding {
  enabled?: boolean;
  emailAddress?: string;
  disposition?: string;
}

async function applyFilters(file: string, dryRun: boolean): Promise<void> {
  const gmail = getGmailClient();
  const raw = readFileSync(file, 'utf-8');
  const payload = JSON.parse(raw) as {
    filters: Array<Record<string, unknown>>;
    autoForwarding?: PayloadAutoForwarding;
  };
  if (!Array.isArray(payload.filters)) {
    throw new Error(`apply-gmail-filter: ${file} has no "filters" array`);
  }

  // Fetch current filters once to compute diff.
  const current = await gmail.users.settings.filters.list({ userId: 'me' });
  const currentIds = new Set((current.data.filter || []).map((f) => f.id));
  const currentCriteria = new Set(
    (current.data.filter || []).map((f) => JSON.stringify(f.criteria || {})),
  );

  let wouldCreate = 0;
  let wouldSkip = 0;
  for (const f of payload.filters) {
    const id = f.id as string | undefined;
    const criteriaKey = JSON.stringify(f.criteria || {});
    if (id && currentIds.has(id)) {
      console.log(`  skip ${id}: already exists by id`);
      wouldSkip++;
      continue;
    }
    if (currentCriteria.has(criteriaKey)) {
      console.log(`  skip: filter with same criteria already exists (${criteriaKey})`);
      wouldSkip++;
      continue;
    }
    if (dryRun) {
      console.log(`  DRY-RUN create: criteria=${criteriaKey} action=${JSON.stringify(f.action)}`);
      wouldCreate++;
      continue;
    }
    // Gmail API requires { criteria, action } — strip id (auto-assigned).
    const created = await gmail.users.settings.filters.create({
      userId: 'me',
      requestBody: { criteria: f.criteria as object, action: f.action as object },
    });
    console.log(`  CREATED ${created.data.id}: ${criteriaKey}`);
    wouldCreate++;
  }

  // Restore auto-forwarding state if captured.
  if (payload.autoForwarding) {
    const want = payload.autoForwarding;
    const have = await gmail.users.settings.getAutoForwarding({ userId: 'me' });
    const same =
      have.data.enabled === want.enabled &&
      have.data.emailAddress === want.emailAddress &&
      have.data.disposition === want.disposition;
    if (same) {
      console.log(
        `  skip autoForwarding: already matches (enabled=${want.enabled} target=${want.emailAddress})`,
      );
    } else if (dryRun) {
      console.log(
        `  DRY-RUN autoForwarding: enabled=${want.enabled} target=${want.emailAddress} disposition=${want.disposition}`,
      );
    } else {
      await gmail.users.settings.updateAutoForwarding({
        userId: 'me',
        requestBody: {
          enabled: want.enabled,
          emailAddress: want.emailAddress,
          disposition: want.disposition,
        },
      });
      console.log(
        `  RESTORED autoForwarding: enabled=${want.enabled} target=${want.emailAddress} disposition=${want.disposition}`,
      );
    }
  }

  console.log(
    `apply-gmail-filter: ${dryRun ? 'DRY-RUN' : 'APPLIED'} — ${wouldCreate} filter ${dryRun ? 'would create' : 'created'}, ${wouldSkip} skipped`,
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  if (args.mode === 'export') {
    await exportFilters(args.file);
  } else {
    await applyFilters(args.file, args.mode === 'dry-run');
  }
}

main().catch((err) => {
  console.error('apply-gmail-filter: FAILED');
  console.error(err instanceof Error ? err.message : err);
  if (err instanceof Error && /insufficient.*scope/i.test(err.message)) {
    console.error(
      '\nHint: refresh token missing gmail.settings.basic scope.\n' +
        'Re-run `npm run gmail:auth` with the scope added, or export filters\n' +
        'manually via Gmail Settings → Filters and Blocked Addresses → "Export".',
    );
  }
  process.exit(1);
});
