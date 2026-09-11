import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  parseWebsiteCheckoutPrivateConfig,
  switchWebsiteCheckoutTestAttributionProfile,
  switchWebsiteCheckoutTestProfile,
  WEBSITE_CHECKOUT_TEST_ATTRIBUTION_FIELD_MAPS,
  WEBSITE_CHECKOUT_TEST_EVENT_CODES,
  websiteCheckoutTestConfigurationSha256,
  websiteCheckoutTestReturnPath,
} from './website-checkout-test-runner.js';

const roots: string[] = [];
function fixture(changes: Record<string, unknown> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'nc003-private-config-'));
  roots.push(root);
  mkdirSync(join(root, 'private'), { mode: 0o700 });
  const value = {
    schemaVersion: 1,
    mode: 'test',
    root,
    requestKey: '1'.repeat(64),
    responseKey: '2'.repeat(64),
    encryptionKey: '3'.repeat(64),
    admin: { username: 'ignored', password: 'ignored' },
    rootPassword: 'ignored',
    adyen: {
      environment: 'test',
      apiKey: 'synthetic-test-key',
      company: 'test-company',
      merchant: 'test-merchant',
      store: 'test-store-reference',
      storeId: 'management-store-id',
      webhookConfigured: true,
      webhookHmacKey: '4'.repeat(64),
    },
    backend: {
      caller: 'tandem-wordpress-test',
      checkoutProfile: 'protected_preview',
      requestKeyId: 'wordpress-request-v1',
      responseKeyId: 'nanoclaw-response-v1',
      quoteAuthority: 'tandem-wordpress-commerce-v1',
      cardCaptureConfigurationEvidence: null,
      enrollmentTerms: {
        version: '2026-09-06',
        contentSha256: '5'.repeat(64),
      },
      privacy: {
        version: 'privacy-current-v1',
        contentSha256: '6'.repeat(64),
      },
      promotionPolicyReferences: ['mcs-promo-v1-005'],
      heartbeatAccess: { enabled: false },
    },
    ...changes,
  };
  const path = join(root, 'private', 'runtime.json');
  writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
  return { path, value };
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('website checkout TEST runner private configuration', () => {
  it('pins every required card lifecycle event without changing future-owned retention', () => {
    expect(WEBSITE_CHECKOUT_TEST_EVENT_CODES).toEqual([
      'PENDING',
      'AUTHORISATION',
      'CAPTURE',
      'CAPTURE_FAILED',
      'CANCELLATION',
      'EXPIRE',
      'REFUND',
      'REFUND_FAILED',
      'REFUNDED_REVERSED',
      'CHARGEBACK',
      'CHARGEBACK_REVERSED',
    ]);
  });
  it('defaults to the unchanged legacy attribution pin and accepts only the code-owned v2 pair', () => {
    const { path, value } = fixture();
    const legacy = parseWebsiteCheckoutPrivateConfig(path);
    expect(legacy.attributionProfile).toBe('legacy_v1');
    const preFieldHash = websiteCheckoutTestConfigurationSha256(legacy);
    (value.backend as Record<string, unknown>).attributionProfile = 'legacy_v1';
    writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
    expect(
      websiteCheckoutTestConfigurationSha256(
        parseWebsiteCheckoutPrivateConfig(path),
      ),
    ).toBe(preFieldHash);
    expect(WEBSITE_CHECKOUT_TEST_ATTRIBUTION_FIELD_MAPS.legacy_v1).toEqual({
      id: 'checkout-attribution-fields-v1',
      sha256:
        '49194295ed5d5a415d3d02d6e0c14bd9d772c54f4d9dd66d9ea226f0ef7fedfc',
    });
    (value.backend as Record<string, unknown>).attributionProfile =
      'english_mcs_card_v2';
    writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
    expect(parseWebsiteCheckoutPrivateConfig(path).attributionProfile).toBe(
      'english_mcs_card_v2',
    );
    expect(
      WEBSITE_CHECKOUT_TEST_ATTRIBUTION_FIELD_MAPS.english_mcs_card_v2,
    ).toEqual({
      id: 'checkout-attribution-fields-en-mcs-card-v2',
      sha256:
        '0d7fbf7d6c3b548e7ba6cf3249418e50f14fb315d1dfee5cc597a4c748a8456e',
    });
    (value.backend as Record<string, unknown>).attributionProfile = 'poisoned';
    writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
    expect(() => parseWebsiteCheckoutPrivateConfig(path)).toThrow(
      'invalid_website_checkout_private_config',
    );
  });

  it('returns only the hard TEST allowlist and keeps Management store ID separate', () => {
    const { path } = fixture();
    const parsed = parseWebsiteCheckoutPrivateConfig(path);
    expect(parsed).toMatchObject({
      caller: 'tandem-wordpress-test',
      requestKeyId: 'wordpress-request-v1',
      responseKeyId: 'nanoclaw-response-v1',
      scope: {
        provider: 'adyen',
        environment: 'test',
        company: 'test-company',
        merchant: 'test-merchant',
        store: 'test-store-reference',
        endpointRegion: 'eu',
      },
      promotionPolicyReferences: ['mcs-promo-v1-005'],
    });
    expect(parsed).not.toHaveProperty('admin');
    expect(parsed).not.toHaveProperty('rootPassword');
    expect(JSON.stringify(parsed.scope)).not.toContain('management-store-id');
  });

  it.each([
    { mode: 'live' },
    {
      backend: {
        caller: 'other',
        requestKeyId: 'wordpress-request-v1',
        responseKeyId: 'nanoclaw-response-v1',
        quoteAuthority: 'tandem-wordpress-commerce-v1',
        cardCaptureConfigurationEvidence: 'adyen-test-capture-readback-v1',
        enrollmentTerms: {
          version: '2026-09-06',
          contentSha256: '5'.repeat(64),
        },
        privacy: {
          version: 'privacy-current-v1',
          contentSha256: '6'.repeat(64),
        },
        promotionPolicyReferences: ['mcs-promo-v1-005'],
      },
    },
    {
      adyen: {
        environment: 'test',
        apiKey: 'synthetic-test-key',
        company: 'test-company',
        merchant: 'test-merchant',
        store: 'test-store-reference',
        storeId: 'management-store-id',
        webhookConfigured: true,
        webhookHmacKey: null,
      },
    },
    {
      adyen: {
        environment: 'test',
        apiKey: 'synthetic-test-key',
        company: 'test-company',
        merchant: 'test-merchant',
        store: 'test-store-reference',
        storeId: 'management-store-id',
        webhookConfigured: true,
        webhookHmacKey: '1'.repeat(64),
      },
    },
  ])('rejects incomplete or non-TEST authority %#', (change) => {
    const { path } = fixture(change);
    expect(() => parseWebsiteCheckoutPrivateConfig(path)).toThrow(
      'invalid_website_checkout_private_config',
    );
  });

  it('rejects group-readable private configuration', () => {
    const { path } = fixture();
    chmodSync(path, 0o640);
    expect(() => parseWebsiteCheckoutPrivateConfig(path)).toThrow(
      'unsafe_website_checkout_private_file',
    );
  });

  it('permits explicit webhook-disabled startup without creating a fake HMAC key', () => {
    const { path, value } = fixture({
      adyen: {
        environment: 'test',
        apiKey: 'synthetic-test-key',
        company: 'test-company',
        merchant: 'test-merchant',
        store: 'test-store-reference',
        storeId: 'management-store-id',
        webhookConfigured: false,
      },
    });
    const parsed = parseWebsiteCheckoutPrivateConfig(path);
    expect(parsed.webhookHmacKey).toBeNull();
    expect(JSON.stringify(parsed)).not.toContain(
      String((value.adyen as Record<string, unknown>).storeId),
    );
  });

  it('permits only the exact owner-approved TEST Heartbeat target', () => {
    const { path, value } = fixture();
    (value.backend as Record<string, unknown>).heartbeatAccess = {
      enabled: true,
      email: 'test@tandemcoach.co',
      userId: '97f4285a-18d4-44a9-961d-17e582aa278f',
      groupId: '4c54983c-0e7b-4dd0-aebc-0f0cb1c82298',
      courseId: 'abd312e4-b01a-4718-8918-f79d081753c0',
      cohortId: 'f2a36eca-a017-4536-9b83-368f51219895',
    };
    writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
    expect(parseWebsiteCheckoutPrivateConfig(path).heartbeatAccess).toEqual(
      (value.backend as Record<string, unknown>).heartbeatAccess,
    );

    (
      (value.backend as Record<string, unknown>).heartbeatAccess as Record<
        string,
        unknown
      >
    ).email = 'other@example.test';
    writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
    expect(() => parseWebsiteCheckoutPrivateConfig(path)).toThrow(
      'invalid_website_checkout_private_config',
    );
  });

  it('defaults Heartbeat access delivery off when the private block is absent', () => {
    const { path, value } = fixture();
    delete (value.backend as Record<string, unknown>).heartbeatAccess;
    writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
    expect(parseWebsiteCheckoutPrivateConfig(path).heartbeatAccess).toEqual({
      enabled: false,
    });
  });

  it('selects the dedicated anonymous QA profile without changing the TEST caller', () => {
    const { path, value } = fixture();
    (value.backend as Record<string, unknown>).checkoutProfile =
      'public_anonymous';
    writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
    expect(parseWebsiteCheckoutPrivateConfig(path)).toMatchObject({
      caller: 'tandem-wordpress-test',
      checkoutProfile: 'public_anonymous',
    });
    expect(websiteCheckoutTestReturnPath('public_anonymous')).toBe(
      '/checkout/mcs-foundations/return/',
    );
    expect(websiteCheckoutTestReturnPath('protected_preview')).toBe(
      '/checkout/preview/return/',
    );
  });

  it('switches only an exact prior profile manifest and preserves a backup', () => {
    const { path, value } = fixture();
    (value.backend as Record<string, unknown>).checkoutProfile =
      'public_anonymous';
    writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
    const target = parseWebsiteCheckoutPrivateConfig(path);
    const source = { ...target, checkoutProfile: 'protected_preview' as const };
    const legacyHash = websiteCheckoutTestConfigurationSha256(source, false);
    const manifestPath = join(
      target.root,
      'private',
      'website-checkout-test-runtime-manifest.json',
    );
    const database = `nc_student_enrollment_store_${'a'.repeat(32)}`;
    writeFileSync(
      manifestPath,
      JSON.stringify({
        schemaVersion: 1,
        database,
        state: 'ready',
        configurationSha256: legacyHash,
      }),
      { mode: 0o600 },
    );
    expect(
      switchWebsiteCheckoutTestProfile(
        path,
        'protected_preview',
        'public_anonymous',
      ),
    ).toEqual({ database, from: 'protected_preview', to: 'public_anonymous' });
    const rebound = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(rebound.configurationSha256).toBe(
      websiteCheckoutTestConfigurationSha256(target),
    );
    const backup = `${manifestPath}.before-profile-protected_preview-to-public_anonymous-${legacyHash}.json`;
    expect(JSON.parse(readFileSync(backup, 'utf8'))).toMatchObject({
      database,
      configurationSha256: legacyHash,
    });
  });

  it('refuses an unknown manifest hash without rewriting it', () => {
    const { path, value } = fixture();
    (value.backend as Record<string, unknown>).checkoutProfile =
      'public_anonymous';
    writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
    const root = String(value.root);
    const manifestPath = join(
      root,
      'private',
      'website-checkout-test-runtime-manifest.json',
    );
    const body = JSON.stringify({
      schemaVersion: 1,
      database: `nc_student_enrollment_store_${'b'.repeat(32)}`,
      state: 'ready',
      configurationSha256: 'f'.repeat(64),
    });
    writeFileSync(manifestPath, body, { mode: 0o600 });
    expect(() =>
      switchWebsiteCheckoutTestProfile(
        path,
        'protected_preview',
        'public_anonymous',
      ),
    ).toThrow('website_checkout_profile_switch_source_mismatch');
    expect(readFileSync(manifestPath, 'utf8')).toBe(body);
  });

  it('switches only an exact legacy attribution manifest and preserves records by changing only the manifest hash', () => {
    const { path, value } = fixture();
    (value.backend as Record<string, unknown>).checkoutProfile =
      'public_anonymous';
    (value.backend as Record<string, unknown>).attributionProfile =
      'english_mcs_card_v2';
    writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
    const target = parseWebsiteCheckoutPrivateConfig(path);
    const source = { ...target, attributionProfile: 'legacy_v1' as const };
    const sourceHash = websiteCheckoutTestConfigurationSha256(source);
    const targetHash = websiteCheckoutTestConfigurationSha256(target);
    expect(targetHash).not.toBe(sourceHash);
    const manifestPath = join(
      target.root,
      'private',
      'website-checkout-test-runtime-manifest.json',
    );
    const database = `nc_student_enrollment_store_${'c'.repeat(32)}`;
    const body = JSON.stringify({
      schemaVersion: 1,
      database,
      state: 'ready',
      configurationSha256: sourceHash,
    });
    writeFileSync(manifestPath, body, { mode: 0o600 });
    expect(
      switchWebsiteCheckoutTestAttributionProfile(
        path,
        'legacy_v1',
        'english_mcs_card_v2',
      ),
    ).toEqual({ database, from: 'legacy_v1', to: 'english_mcs_card_v2' });
    expect(JSON.parse(readFileSync(manifestPath, 'utf8'))).toEqual({
      schemaVersion: 1,
      database,
      state: 'ready',
      configurationSha256: targetHash,
    });
    const backup = `${manifestPath}.before-attribution-legacy_v1-to-english_mcs_card_v2-${sourceHash}.json`;
    expect(readFileSync(backup, 'utf8')).toBe(`${body}\n`);
  });

  it('refuses an attribution switch from an unknown source hash without rewriting', () => {
    const { path, value } = fixture();
    (value.backend as Record<string, unknown>).attributionProfile =
      'english_mcs_card_v2';
    writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
    const target = parseWebsiteCheckoutPrivateConfig(path);
    const manifestPath = join(
      target.root,
      'private',
      'website-checkout-test-runtime-manifest.json',
    );
    const body = JSON.stringify({
      schemaVersion: 1,
      database: `nc_student_enrollment_store_${'d'.repeat(32)}`,
      state: 'ready',
      configurationSha256: 'f'.repeat(64),
    });
    writeFileSync(manifestPath, body, { mode: 0o600 });
    expect(() =>
      switchWebsiteCheckoutTestAttributionProfile(
        path,
        'legacy_v1',
        'english_mcs_card_v2',
      ),
    ).toThrow('website_checkout_attribution_switch_source_mismatch');
    expect(readFileSync(manifestPath, 'utf8')).toBe(body);
  });
});
