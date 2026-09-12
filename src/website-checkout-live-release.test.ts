import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const read = (relative: string) =>
  readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

describe('website checkout immutable release packaging', () => {
  it('binds every exact required forward and rollback migration', () => {
    const builder = read('scripts/build-release.mjs');
    const expected = [
      '146_student_enrollment_store_contract',
      '147_student_enrollment_writer_claims',
      '148_student_enrollment_projection_foundation',
      '149_payment_attempt_store',
      '150_payment_request_admission',
      '151_payment_event_ledger',
      '152_payment_method_reconciliation',
      '153_website_checkout_provisional_finance',
      '154_payment_identity_preparation',
      '155_website_checkout_admission_evidence',
      '156_website_checkout_attribution_admission',
      '157_payment_webhook_method_evidence',
      '158_website_checkout_customer_notices',
      '159_payment_terminal_card_retry',
      '160_payment_chaos_observability',
      '161_payment_checkout_billing_profile',
      '162_payment_provider_optimization_evidence',
      '163_payment_checkout_documents',
      '164_payment_checkout_document_retention',
    ];
    for (const migration of expected) {
      expect(builder).toContain(
        `data/business/migrations/nanoclaw-v2/${migration}.sql`,
      );
      expect(builder).toContain(
        `data/business/migrations/nanoclaw-v2/rollback_${migration}.sql`,
      );
    }
    expect(builder).not.toContain("'data/business/migrations/nanoclaw-v2',");
    expect(builder).toContain('website-checkout-live-entrypoint.js');
    expect(builder).toContain('scripts/bundle-payment-documents.mjs');
    expect(builder).toContain(
      'assets/checkout-documents/tandem-logo-horizontal.png',
    );
    expect(
      builder.indexOf("'scripts', 'bundle-payment-documents.mjs'"),
    ).toBeLessThan(builder.indexOf("[checkoutEntrypoint, '--help']"));
    expect(builder).toContain("[checkoutEntrypoint, '--help']");
    expect(builder).toContain("'relative-private-config.json'");
  });

  it('keeps the launchd service template inert and compiled-release-only', () => {
    const plist = read('launchd/com.nanoclaw.website-checkout-live.plist');
    expect(plist).toContain('com.nanoclaw.website-checkout-live');
    expect(plist).toContain(
      '{{RELEASE_ROOT}}/dist/website-checkout-live-entrypoint.js',
    );
    for (const placeholder of [
      '{{NODE_PATH}}',
      '{{RELEASE_ROOT}}',
      '{{PRIVATE_CONFIG_PATH}}',
      '{{FULL_RELEASE_COMMIT}}',
      '{{RUNTIME_WORKING_DIRECTORY}}',
      '{{LOG_ROOT}}',
    ])
      expect(plist).toContain(placeholder);
    expect(plist).not.toMatch(/<key>(HostName|UserName|Port)<\/key>/);
    expect(plist).toContain('<key>NANOCLAW_REQUIRE_RELEASE_MANIFEST</key>');
    expect(plist).toContain('<string>1</string>');
    expect(plist).not.toMatch(/<string>[^<{]*(live_[A-Za-z0-9]|api|secret)/i);
  });

  it('verifies the immutable release before config or service startup', () => {
    const entrypoint = read('src/website-checkout-live-entrypoint.ts');
    expect(entrypoint).toContain("from './release-integrity.js'");
    const verify = entrypoint.indexOf(
      'dependencies.verifyRelease ?? verifyRuntimeRelease',
    );
    expect(verify).toBeGreaterThan(0);
    expect(verify).toBeLessThan(
      entrypoint.indexOf('parseWebsiteCheckoutLivePrivateConfig)('),
    );
    expect(verify).toBeLessThan(
      entrypoint.indexOf(
        'dependencies.start ?? startWebsiteCheckoutLiveService',
      ),
    );
  });

  it('pins only the approved loopback reverse-forward while keeping the identity unresolved', () => {
    const plist = read(
      'launchd/com.nanoclaw.website-checkout-live-tunnel.plist',
    );
    expect(plist).toContain('com.nanoclaw.website-checkout-live-tunnel');
    expect(plist).toContain('127.0.0.1:15680:127.0.0.1:3445');
    expect(plist).toContain('tca@100.115.115.15');
    expect(plist).toContain('{{VPS_SSH_IDENTITY_PATH}}');
    expect(plist).toContain('StrictHostKeyChecking=yes');
    expect(plist).toContain('ExitOnForwardFailure=yes');
    expect(plist).not.toContain('GatewayPorts=yes');
  });

  it('ships a deliberately invalid and disabled private-config template', () => {
    const template = JSON.parse(
      read('config-examples/website-checkout-live.private.template.json'),
    );
    expect(template.TEMPLATE_ONLY_REMOVE_BEFORE_VALIDATION).toBe(true);
    expect(template.listener).toEqual({ host: '127.0.0.1', port: 3445 });
    expect(template.database).toMatchObject({
      host: '/tmp',
      port: 5432,
      name: 'nanoclaw_business',
      user: 'xbohdpukc',
      role: 'nanoclaw_admin',
      schemaContract: 'nanoclaw-v2:148,149-164',
    });
    expect(template.activation).toEqual({
      serviceEnabled: false,
      recoverExisting: false,
      newAttemptsEnabled: false,
    });
    expect(template.heartbeatAccess).toEqual({ enabled: false });
    expect(template.receiptWelcome).toEqual({
      owner: 'unassigned',
      enabled: false,
    });
    expect(template.documents).toEqual({
      receiptEnabled: true,
      downloadCapabilityTtlMs: 300000,
      retentionPolicy: {
        version: 'mcs-checkout-documents-7y-v1',
        years: 7,
        legalHold: 'explicit_hold_blocks_purge',
        purge: 'customer_pdf_recipient_and_sent_message',
        tombstone: 'number_date_amount_currency_hashes_and_purge_receipt',
        sweepIntervalMs: 86400000,
        batchSize: 25,
      },
      paidInvoice: { enabled: false },
    });
    expect(template.chaosObservability).toEqual({ enabled: false });
    expect(template.requestKey).toMatch(/^REQUIRED_/);
  });

  it('points the package command at the compiled entrypoint', () => {
    const pkg = JSON.parse(read('package.json')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['checkout-live:serve']).toBe(
      './scripts/with-pinned-node.sh node dist/website-checkout-live-entrypoint.js',
    );
  });
});
