import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const scriptPath = path.join(
  root,
  'scripts/validate-tandem-identity-d2-production.mjs',
);
const source = fs.readFileSync(scriptPath, 'utf8');

describe('Tandem Identity D2 production validator', () => {
  it('pins the production host, database, socket, and immutable source prefix', () => {
    expect(source).toContain("const EXPECTED_HOST = 'mini-claw.local'");
    expect(source).toContain("const EXPECTED_DATABASE = 'nanoclaw_business'");
    expect(source).toContain('const EXPECTED_PREFIX_COUNT = 379');
    expect(source).toContain('const EXPECTED_PREFIX_MAX_ID = 379');
    expect(source).toContain(
      "'251fe76eed9db7710fbe7d96d11359f0c5231cd9f6cbd0c42ac4d1207642f955'",
    );
    expect(source).toContain("const SOCKET = '/tmp'");
    expect(source).toContain("const PORT = '5432'");
  });

  it('fails before database access for malformed arguments or the wrong host', () => {
    const malformed = spawnSync(process.execPath, [scriptPath], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(malformed.status).not.toBe(0);
    expect(malformed.stderr).toContain('tandem_identity_d2_validation:usage');

    const wrongHost = spawnSync(
      process.execPath,
      [scriptPath, '--stage', 'preflight', '--database', 'nanoclaw_business'],
      { cwd: root, encoding: 'utf8' },
    );
    expect(wrongHost.status).not.toBe(0);
    expect(wrongHost.stderr).toContain(
      'tandem_identity_d2_validation:host_mismatch',
    );
  });

  it('contains no mutation statement and requires zero promoted/write state', () => {
    expect(source).not.toMatch(
      /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE)\b/,
    );
    for (const field of [
      'promotedReceipts',
      'linkedD2Observations',
      'materializableCandidates',
      'acceptedFacts',
      'desiredProjections',
      'commands',
      'attempts',
      'readbacks',
      'reconciliationRuns',
      'driftItems',
    ]) {
      expect(source).toContain(`'${field}'`);
    }
  });
});
