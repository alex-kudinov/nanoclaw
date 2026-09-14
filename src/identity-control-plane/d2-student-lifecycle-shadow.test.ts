import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  D2_DEFAULT_BATCH_LIMIT,
  D2_DEFAULT_INTERVAL_MS,
  getTandemIdentityD2Health,
  initializeTandemIdentityD2Health,
  resolveTandemIdentityD2Config,
} from './d2-student-lifecycle-shadow.js';

const indexSource = fs.readFileSync(
  new URL('../index.ts', import.meta.url),
  'utf8',
);
const releaseBuilder = fs.readFileSync(
  new URL('../../scripts/build-release.mjs', import.meta.url),
  'utf8',
);

describe('Tandem Identity D2 configuration and wiring', () => {
  it('defaults off with a bounded batch and interval', () => {
    const config = resolveTandemIdentityD2Config({});
    expect(config).toEqual({
      enabled: false,
      valid: true,
      reason: 'disabled',
      batchLimit: D2_DEFAULT_BATCH_LIMIT,
      intervalMs: D2_DEFAULT_INTERVAL_MS,
    });
  });

  it('accepts only closed booleans and safe operational bounds', () => {
    expect(
      resolveTandemIdentityD2Config({
        TANDEM_IDENTITY_D2_SHADOW_ENABLED: '1',
        TANDEM_IDENTITY_D2_BATCH_LIMIT: '379',
        TANDEM_IDENTITY_D2_INTERVAL_MS: '60000',
      }),
    ).toMatchObject({
      enabled: true,
      valid: true,
      batchLimit: 379,
      intervalMs: 60_000,
    });
    for (const env of [
      { TANDEM_IDENTITY_D2_SHADOW_ENABLED: 'yes' },
      { TANDEM_IDENTITY_D2_BATCH_LIMIT: '0' },
      { TANDEM_IDENTITY_D2_BATCH_LIMIT: '501' },
      { TANDEM_IDENTITY_D2_INTERVAL_MS: '59999' },
      { TANDEM_IDENTITY_D2_INTERVAL_MS: '1e6' },
    ]) {
      expect(resolveTandemIdentityD2Config(env)).toMatchObject({
        enabled: false,
        valid: false,
        reason: 'invalid_configuration',
      });
    }
  });

  it('runs without overlap or retaining the event loop and exposes health', () => {
    expect(indexSource).toContain('void runTandemIdentityD2Tick();');
    expect(indexSource).toContain('tandemIdentityD2Timer.unref();');
    expect(indexSource).toContain('if (tandemIdentityD2InFlight)');
    expect(indexSource).toContain(
      'tandemIdentityD2: getTandemIdentityD2Health()',
    );
    expect(indexSource).toContain(
      'initializeTandemIdentityD2Health(tandemIdentityD2Config)',
    );
    expect(indexSource).not.toContain('await runTandemIdentityD2Tick();');
  });

  it('surfaces enabled-pending and invalid configuration before the first tick', () => {
    initializeTandemIdentityD2Health({
      enabled: true,
      valid: true,
      reason: 'enabled',
      batchLimit: 500,
      intervalMs: 300_000,
    });
    expect(getTandemIdentityD2Health()).toMatchObject({
      enabled: true,
      valid: true,
      status: 'never_run',
      reason: 'enabled',
      errorCode: null,
    });
    initializeTandemIdentityD2Health({
      enabled: false,
      valid: false,
      reason: 'invalid_configuration',
      batchLimit: 500,
      intervalMs: 300_000,
    });
    expect(getTandemIdentityD2Health()).toMatchObject({
      enabled: false,
      valid: false,
      status: 'disabled',
      reason: 'invalid_configuration',
      errorCode: 'invalid_configuration',
    });
  });

  it('packages migration 167 but has no provider client or credential surface', () => {
    expect(releaseBuilder).toContain('167_tandem_identity_control_plane.sql');
    expect(releaseBuilder).toContain(
      'rollback_167_tandem_identity_control_plane.sql',
    );
    const source = fs.readFileSync(
      new URL('./d2-student-lifecycle-shadow.ts', import.meta.url),
      'utf8',
    );
    expect(source).not.toMatch(
      /fetch\(|axios|https?:\/\/|callTool|heartbeat\.com/i,
    );
    expect(source).not.toMatch(
      /fn_create_party|INSERT INTO business_v2\.parties/i,
    );
    expect(source).not.toMatch(/UPDATE business_v2\.party_external_refs/i);
    expect(source).not.toMatch(
      /INSERT INTO business_v2\.provider_projection_attempts/i,
    );
  });
});
