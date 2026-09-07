#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OFFERS = ['supervision-inaugural', 'supervision-regular'];
const COHORT_DATE = '2026-10-07';

export class SourceReconciliationError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
  }
}

function fail(code, detail = '') {
  throw new SourceReconciliationError(code, detail);
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

function parseJson(bytes) {
  try {
    return JSON.parse(bytes);
  } catch {
    fail('products_json_invalid');
  }
}

function objectSpan(source, offer) {
  const line = `  ${JSON.stringify(offer)}: {`;
  const start = source.indexOf(line);
  if (start < 0 || source.indexOf(line, start + 1) >= 0) {
    fail('offer_source_span_invalid', offer);
  }
  const objectStart = source.indexOf('{', start);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = objectStart; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return { start, end: index + 1 };
    }
  }
  fail('offer_source_span_invalid', offer);
}

function maskSelected(source) {
  let masked = source;
  for (const offer of [...OFFERS].reverse()) {
    const span = objectSpan(masked, offer);
    masked = `${masked.slice(0, span.start)}<${offer}>${masked.slice(span.end)}`;
  }
  return masked;
}

function assertOldPreconditions(products) {
  const inaugural = products['supervision-inaugural'];
  const regular = products['supervision-regular'];
  if (!inaugural || !regular) fail('offer_missing');
  const cohortFields = [
    'requires_cohort',
    'cohort_program',
    'cohort_start_dates',
    'cohort_excluded_start_dates',
  ];
  if (inaugural.active !== true || regular.active !== false) {
    fail('selected_precondition_mismatch', 'active');
  }
  for (const offer of OFFERS) {
    if (cohortFields.some((field) => field in products[offer])) {
      fail('selected_precondition_mismatch', `${offer}:cohort_fields_present`);
    }
  }
}

function patchBlock(block, offer) {
  const marker = '    "installments": {';
  if (
    !block.includes(marker) ||
    block.indexOf(marker) !== block.lastIndexOf(marker)
  ) {
    fail('offer_source_span_invalid', `${offer}:installments`);
  }
  const fields =
    offer === 'supervision-inaugural'
      ? [
          '    "requires_cohort": true,',
          '    "cohort_program": "supervision",',
          '    "cohort_start_dates": [',
          `      "${COHORT_DATE}"`,
          '    ],',
        ]
      : [
          '    "requires_cohort": true,',
          '    "cohort_program": "supervision",',
          '    "cohort_excluded_start_dates": [',
          `      "${COHORT_DATE}"`,
          '    ],',
        ];
  let patched = block;
  if (offer === 'supervision-regular') {
    const active = '    "active": false,';
    if (
      !patched.includes(active) ||
      patched.indexOf(active) !== patched.lastIndexOf(active)
    ) {
      fail('selected_precondition_mismatch', 'supervision-regular:active');
    }
    patched = patched.replace(active, '    "active": true,');
  }
  return patched.replace(marker, `${fields.join('\n')}\n${marker}`);
}

function expectedAfter(before) {
  const after = structuredClone(before);
  after['supervision-inaugural'].requires_cohort = true;
  after['supervision-inaugural'].cohort_program = 'supervision';
  after['supervision-inaugural'].cohort_start_dates = [COHORT_DATE];
  after['supervision-regular'].active = true;
  after['supervision-regular'].requires_cohort = true;
  after['supervision-regular'].cohort_program = 'supervision';
  after['supervision-regular'].cohort_excluded_start_dates = [COHORT_DATE];
  return after;
}

function withoutChangedFields(value) {
  const copy = structuredClone(value);
  for (const field of [
    'active',
    'requires_cohort',
    'cohort_program',
    'cohort_start_dates',
    'cohort_excluded_start_dates',
  ]) {
    if (field !== 'active') delete copy['supervision-inaugural'][field];
    delete copy['supervision-regular'][field];
  }
  return copy;
}

export function planReconciliation(sourceBytes, expectedSha256) {
  if (sha256(sourceBytes) !== expectedSha256)
    fail('whole_file_precondition_mismatch');
  const source = sourceBytes.toString('utf8');
  const before = parseJson(source);
  assertOldPreconditions(before);
  let afterSource = source;
  for (const offer of [...OFFERS].reverse()) {
    const span = objectSpan(afterSource, offer);
    const block = afterSource.slice(span.start, span.end);
    afterSource = `${afterSource.slice(0, span.start)}${patchBlock(block, offer)}${afterSource.slice(span.end)}`;
  }
  const after = parseJson(afterSource);
  if (
    JSON.stringify(canonical(after)) !==
    JSON.stringify(canonical(expectedAfter(before)))
  ) {
    fail('selected_patch_result_invalid');
  }
  if (
    JSON.stringify(canonical(withoutChangedFields(before))) !==
    JSON.stringify(canonical(withoutChangedFields(after)))
  ) {
    fail('nonselected_field_changed');
  }
  if (maskSelected(source) !== maskSelected(afterSource)) {
    fail('nonselected_bytes_changed');
  }
  return {
    bytes: Buffer.from(afterSource),
    before_sha256: expectedSha256,
    after_sha256: sha256(afterSource),
    nonselected_bytes_sha256: sha256(maskSelected(source)),
    selected_before: {
      'supervision-inaugural': {
        active: true,
        cohort_fields_present: false,
      },
      'supervision-regular': {
        active: false,
        cohort_fields_present: false,
      },
    },
    selected_after: {
      'supervision-inaugural': {
        active: true,
        requires_cohort: true,
        cohort_program: 'supervision',
        cohort_start_dates: [COHORT_DATE],
        cohort_excluded_start_dates: [],
      },
      'supervision-regular': {
        active: true,
        requires_cohort: true,
        cohort_program: 'supervision',
        cohort_start_dates: [],
        cohort_excluded_start_dates: [COHORT_DATE],
      },
    },
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--products') args.products = path.resolve(argv[++index]);
    else if (arg === '--expected-sha256') args.expectedSha256 = argv[++index];
    else if (arg === '--backup-dir')
      args.backupDir = path.resolve(argv[++index]);
    else if (arg === '--confirm-host') args.confirmHost = argv[++index];
    else if (arg === '--apply') args.apply = true;
    else fail('argument_invalid', arg);
  }
  if (!args.products || !args.expectedSha256) fail('argument_missing');
  return args;
}

function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const stat = fs.lstatSync(args.products);
  if (!stat.isFile() || stat.isSymbolicLink()) fail('products_path_invalid');
  const original = fs.readFileSync(args.products);
  const plan = planReconciliation(original, args.expectedSha256);
  let backup = null;
  if (args.apply) {
    if (args.confirmHost !== os.hostname()) fail('host_confirmation_mismatch');
    if (!args.backupDir) fail('backup_dir_missing');
    const current = fs.readFileSync(args.products);
    if (sha256(current) !== args.expectedSha256)
      fail('whole_file_changed_before_write');
    fs.mkdirSync(args.backupDir, { recursive: true, mode: 0o700 });
    backup = path.join(
      args.backupDir,
      `products.before-${args.expectedSha256.slice(0, 12)}-${Date.now()}.json`,
    );
    fs.writeFileSync(backup, current, { flag: 'wx', mode: 0o600 });
    const temporary = path.join(
      path.dirname(args.products),
      `.products.nc006.${process.pid}.${Date.now()}.tmp`,
    );
    try {
      fs.writeFileSync(temporary, plan.bytes, {
        flag: 'wx',
        mode: stat.mode & 0o777,
      });
      if (sha256(fs.readFileSync(args.products)) !== args.expectedSha256) {
        fail('whole_file_changed_before_rename');
      }
      fs.renameSync(temporary, args.products);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
    if (sha256(fs.readFileSync(args.products)) !== plan.after_sha256) {
      fail('write_readback_mismatch');
    }
  }
  process.stdout.write(
    `${JSON.stringify({
      status: args.apply ? 'applied' : 'dry_run',
      products_path: args.products,
      before_sha256: plan.before_sha256,
      after_sha256: plan.after_sha256,
      nonselected_bytes_sha256_before: plan.nonselected_bytes_sha256,
      nonselected_bytes_sha256_after: sha256(
        maskSelected(plan.bytes.toString('utf8')),
      ),
      selected_before: plan.selected_before,
      selected_after: plan.selected_after,
      backup,
    })}\n`,
  );
}

if (
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) ===
    fs.realpathSync(fileURLToPath(import.meta.url))
) {
  try {
    runCli();
  } catch (error) {
    if (error instanceof SourceReconciliationError) {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
}
