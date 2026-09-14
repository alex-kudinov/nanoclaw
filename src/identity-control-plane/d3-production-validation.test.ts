import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const validatorPath = path.join(
  root,
  'scripts/validate-tandem-identity-d3-production.mjs',
);
const validator = fs.readFileSync(validatorPath, 'utf8');
const importer = fs.readFileSync(
  path.join(root, 'src/identity-control-plane/d3-heartbeat-reconciliation.ts'),
  'utf8',
);
const releaseBuilder = fs.readFileSync(
  path.join(root, 'scripts/build-release.mjs'),
  'utf8',
);

describe('Tandem Identity D3 production boundary', () => {
  it('pins the exact host, database, minimized artifact, and aggregate counts', () => {
    expect(validator).toContain("const EXPECTED_HOST = 'mini-claw.local'");
    expect(validator).toContain(
      "const EXPECTED_DATABASE = 'nanoclaw_business'",
    );
    expect(validator).toContain(
      "'f6e9e057ea609d3bba25d9aff7b2cd0a4bf22f305a8f510bdf9d00d7a1b69a35'",
    );
    expect(validator).toContain(
      "'c4ec624167ef6766d4b04bb8aac715a11c76c60b6a5cffae2d528c90df9725ea'",
    );
    expect(validator).toContain('const EXPECTED_USERS = 1694');
    expect(validator).toContain('const EXPECTED_GROUPS = 79');
    expect(validator).toContain('const EXPECTED_MEMBERSHIP_EDGES = 4202');
    expect(validator).toContain('const EXPECTED_WEBHOOKS = 22');
  });

  it('fails before database access for malformed arguments or the wrong host', () => {
    const malformed = spawnSync(process.execPath, [validatorPath], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(malformed.status).not.toBe(0);
    expect(malformed.stderr).toContain('tandem_identity_d3_validation:usage');
    const wrongHost = spawnSync(
      process.execPath,
      [
        validatorPath,
        '--stage',
        'pre-import',
        '--database',
        'nanoclaw_business',
      ],
      { cwd: root, encoding: 'utf8' },
    );
    expect(wrongHost.status).not.toBe(0);
    expect(wrongHost.stderr).toContain(
      'tandem_identity_d3_validation:host_mismatch',
    );
  });

  it('keeps the validator read-only and the importer free of provider or canonical writes', () => {
    expect(validator).not.toMatch(
      /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE)\b/,
    );
    expect(validator).toContain("fail('protected_baseline_mismatch')");
    expect(importer).not.toMatch(/fetch\(|axios|https?:\/\/|heartbeat\.com/i);
    expect(importer).not.toMatch(
      /INSERT INTO business_v2\.(parties|party_external_refs|auth_accounts|identity_resolution_decisions|provider_projection_attempts)/i,
    );
    expect(importer).toContain("status: 'blocked'");
    expect(importer).toContain('reason: REASON_CODE');
    expect(releaseBuilder).toContain(
      'prepare-tandem-identity-d3-heartbeat-snapshot.mjs',
    );
    expect(releaseBuilder).toContain(
      'validate-tandem-identity-d3-production.mjs',
    );
  });
});
