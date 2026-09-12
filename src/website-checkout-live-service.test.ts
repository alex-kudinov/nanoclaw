import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

import { createPaymentAttempt, type PaymentScope } from './payment-domain.js';
import {
  WebsiteCheckoutEnrollmentAdapter,
  websiteCheckoutActivationReceiptHash,
  type WebsiteCheckoutPublicationActivationReceipt,
} from './website-checkout-enrollment-adapter.js';
import {
  HeartbeatLiveMembershipDriver,
  LIVE_FOUNDATIONS_HEARTBEAT_COHORT_ID,
  LIVE_FOUNDATIONS_HEARTBEAT_COURSE_ID,
  LIVE_FOUNDATIONS_HEARTBEAT_GROUP_ID,
  type HeartbeatLiveAccessConfig,
  type HeartbeatLiveEnrollmentAuthority,
  type HeartbeatLiveToolboxRunner,
  WebsiteCheckoutHeartbeatLiveDelivery,
} from './website-checkout-heartbeat-live-delivery.js';
import {
  parseWebsiteCheckoutLivePrivateConfig,
  startWebsiteCheckoutLiveService,
  verifyWebsiteCheckoutLiveSchema,
} from './website-checkout-live-runner.js';

const publicationPath = new URL(
  '../facts/generated/student-foundations-publication-live-v1.candidate.json',
  import.meta.url,
).pathname;
const publication = JSON.parse(readFileSync(publicationPath, 'utf8'));
const scope: PaymentScope = {
  provider: 'adyen',
  environment: 'live',
  company: 'tandem',
  merchant: 'merchant-live',
  store: 'store-live',
  endpointRegion: 'eu',
};

function activation(): WebsiteCheckoutPublicationActivationReceipt {
  const payload = {
    schemaVersion: 1 as const,
    environment: 'live' as const,
    status: 'accepted' as const,
    caller: 'tandem-wordpress-live' as const,
    publicationId: 'student-foundations-publication-v1' as const,
    publicationRevision: 2,
    publicationPayloadSha256: publication.payload_sha256 as string,
    offerLocale: 'mcq-program-a-foundations:en-US' as const,
    decisionReference: 'decision:fixture-live-publication-activation',
    approvedAt: '2026-09-11T12:00:00Z',
  };
  return {
    ...payload,
    receiptSha256: websiteCheckoutActivationReceiptHash(payload),
  };
}

describe('English production publication activation boundary', () => {
  it('keeps the shipped candidate inert without a matching accepted receipt', () => {
    const connect = vi.fn();
    const pool = { connect } as unknown as Pick<Pool, 'connect'>;
    expect(
      () =>
        new WebsiteCheckoutEnrollmentAdapter(
          pool,
          'tandem-wordpress-live',
          scope,
          publication,
          {
            publicationId: 'student-foundations-publication-v1',
            publicationRevision: 2,
            payloadSha256: publication.payload_sha256,
          },
          'capture-policy-live-v1',
          true,
          { environment: 'live', activationReceipt: undefined as never },
        ),
    ).toThrow('invalid_website_adapter_configuration');
    expect(connect).not.toHaveBeenCalled();
  });

  it('accepts only the exact separately receipted English candidate', () => {
    const connect = vi.fn();
    const pool = { connect } as unknown as Pick<Pool, 'connect'>;
    expect(
      new WebsiteCheckoutEnrollmentAdapter(
        pool,
        'tandem-wordpress-live',
        scope,
        publication,
        {
          publicationId: 'student-foundations-publication-v1',
          publicationRevision: 2,
          payloadSha256: publication.payload_sha256,
        },
        'capture-policy-live-v1',
        true,
        { environment: 'live', activationReceipt: activation() },
        async () => undefined,
      ),
    ).toBeInstanceOf(WebsiteCheckoutEnrollmentAdapter);
    expect(connect).not.toHaveBeenCalled();
    const poisoned = activation();
    poisoned.publicationRevision = 3;
    expect(
      () =>
        new WebsiteCheckoutEnrollmentAdapter(
          pool,
          'tandem-wordpress-live',
          scope,
          publication,
          {
            publicationId: 'student-foundations-publication-v1',
            publicationRevision: 2,
            payloadSha256: publication.payload_sha256,
          },
          'capture-policy-live-v1',
          true,
          { environment: 'live', activationReceipt: poisoned },
        ),
    ).toThrow('invalid_website_adapter_configuration');
  });

  it('refuses LIVE enrollment composition without an explicit production database guard', () => {
    const pool = { connect: vi.fn() } as unknown as Pick<Pool, 'connect'>;
    expect(
      () =>
        new WebsiteCheckoutEnrollmentAdapter(
          pool,
          'tandem-wordpress-live',
          scope,
          publication,
          {
            publicationId: 'student-foundations-publication-v1',
            publicationRevision: 2,
            payloadSha256: publication.payload_sha256,
          },
          'capture-policy-live-v1',
          true,
          { environment: 'live', activationReceipt: activation() },
        ),
    ).toThrow('invalid_website_adapter_configuration');
  });

  it('holds an explicitly excluded owner test attempt before database admission', async () => {
    const attemptId = '70db04a3-2d1d-4639-9fe8-434226f87577';
    const connect = vi.fn();
    const adapter = new WebsiteCheckoutEnrollmentAdapter(
      { connect } as unknown as Pick<Pool, 'connect'>,
      'tandem-wordpress-live',
      scope,
      publication,
      {
        publicationId: 'student-foundations-publication-v1',
        publicationRevision: 2,
        payloadSha256: publication.payload_sha256,
      },
      'capture-policy-live-v1',
      true,
      { environment: 'live', activationReceipt: activation() },
      async () => undefined,
      new Set([attemptId]),
    );
    await expect(adapter.admit(attemptId)).resolves.toMatchObject({
      disposition: 'held',
      canonicalEnrollment: 'not_materialized',
      currentPaymentState: 'needs_review',
      reasons: ['owner_test_fulfillment_excluded'],
    });
    expect(connect).not.toHaveBeenCalled();
  });
});

describe('production Heartbeat identity and membership driver', () => {
  const authority: HeartbeatLiveEnrollmentAuthority = {
    enrollmentKey: 'website-checkout:fixture:seat:1:enrollment',
    enrollmentVersion: 0,
    participantPartyId: '10001',
    email: 'learner@example.com',
    name: 'Learner Example',
  };
  const config: HeartbeatLiveAccessConfig = {
    enabled: true,
    groupId: LIVE_FOUNDATIONS_HEARTBEAT_GROUP_ID,
    courseId: LIVE_FOUNDATIONS_HEARTBEAT_COURSE_ID,
    cohortId: LIVE_FOUNDATIONS_HEARTBEAT_COHORT_ID,
    cardCaptureConfigurationEvidence: 'capture-policy-live-v1',
  };

  it('preserves an existing identity and unrelated groups', async () => {
    const run = vi.fn(async (tool: string) => {
      if (tool === 'heartbeat/find-user')
        return [
          {
            id: '11111111-1111-4111-8111-111111111111',
            email: authority.email,
            name: authority.name,
            role: 'Coach',
          },
        ];
      if (tool === 'heartbeat/get-user')
        return {
          id: '11111111-1111-4111-8111-111111111111',
          email: authority.email,
          groups: [
            { id: '22222222-2222-4222-8222-222222222222', name: 'Existing' },
            { id: config.groupId, name: 'Mentor Coaching Foundation' },
          ],
        };
      throw new Error('unexpected write');
    });
    const driver = new HeartbeatLiveMembershipDriver(
      authority,
      config,
      { run } as HeartbeatLiveToolboxRunner,
      async () => authority,
    );
    await expect(
      driver.findByIdempotencyKey(
        'fixture',
        `heartbeat:main:group:${config.groupId}`,
      ),
    ).resolves.toEqual({
      operationId: `heartbeat:main:user:11111111-1111-4111-8111-111111111111:group:${config.groupId}`,
    });
    expect(run).not.toHaveBeenCalledWith(
      'heartbeat/create-user',
      expect.anything(),
    );
    expect(run).not.toHaveBeenCalledWith(
      'heartbeat/add-to-group',
      expect.anything(),
    );
  });

  it('creates only a missing role User with the one pinned group', async () => {
    const id = '33333333-3333-4333-8333-333333333333';
    const run = vi.fn(async (tool: string) => {
      if (tool === 'heartbeat/find-user') return [];
      if (tool === 'heartbeat/create-user')
        return {
          id,
          email: authority.email,
          name: authority.name,
          role: 'User',
        };
      if (tool === 'heartbeat/get-user')
        return { id, email: authority.email, groups: [{ id: config.groupId }] };
      throw new Error('unexpected tool');
    });
    const driver = new HeartbeatLiveMembershipDriver(
      authority,
      config,
      { run } as HeartbeatLiveToolboxRunner,
      async () => authority,
    );
    await expect(driver.apply()).resolves.toEqual({
      operationId: `heartbeat:main:user:${id}:group:${config.groupId}`,
    });
    expect(run).toHaveBeenCalledWith(
      'heartbeat/create-user',
      expect.arrayContaining(['--role', 'User', '--group-ids', config.groupId]),
    );
    expect(run).not.toHaveBeenCalledWith(
      'heartbeat/add-to-group',
      expect.anything(),
    );
  });

  it('holds uncertain acceptance when post-create readback is lost', async () => {
    const id = '33333333-3333-4333-8333-333333333333';
    const run = vi.fn(async (tool: string) => {
      if (tool === 'heartbeat/find-user') return [];
      if (tool === 'heartbeat/create-user')
        return {
          id,
          email: authority.email,
          name: authority.name,
          role: 'User',
        };
      throw new Error('readback unavailable');
    });
    const driver = new HeartbeatLiveMembershipDriver(
      authority,
      config,
      { run } as HeartbeatLiveToolboxRunner,
      async () => authority,
    );
    await expect(driver.apply()).rejects.toMatchObject({
      code: 'provider_acceptance_uncertain',
    });
  });

  it('records post-enrollment adverse evidence without another grant or revoke', async () => {
    const attemptId = '44444444-4444-4444-8444-444444444444';
    const now = Date.now();
    const attempt = createPaymentAttempt({
      attemptId,
      now,
      scope,
      paymentMethodCapabilities: ['card'],
      quote: {
        schemaVersion: 1,
        quoteId: '55555555-5555-4555-8555-555555555555',
        authority: 'tandem-wordpress-commerce-v1',
        offerKey: 'mcq-program-a-foundations',
        catalogVersion: 'fixture',
        bundleVersion: 'fixture',
        deliveryVersion: 'fixture',
        locale: 'en-US',
        country: 'US',
        payerReference: 'payer',
        participantReference: 'participant',
        currency: 'USD',
        originalAmount: 29900,
        discountAmount: 0,
        finalAmount: 29900,
        discountPolicyReference: null,
        redemptionReference: null,
        paymentOption: 'one_time',
        termsVersion: 'terms',
        consentReceipt: 'consent',
        acceptedAt: now,
        createdAt: now,
        expiresAt: now + 60000,
      },
    });
    const provider = vi.fn();
    const poolQuery = vi.fn(async () => ({
      rowCount: 1,
      rows: [
        {
          enrollment_key: 'website-checkout:fixture:seat:1:enrollment',
          enrollment_version: 0,
          participant_party_id: '10001',
          primary_email: authority.email,
          display_name: authority.name,
          contract: attempt,
          projection: {
            state: 'needs_review',
            payments: [
              {
                paymentReference: 'live-psp',
                evidence: {
                  authorization: 'authorized',
                  evidenceState: 'accepted',
                  chargebackAmount: 29900,
                  chargebackReversedAmount: 0,
                  refundedAmount: 0,
                  refundReversedAmount: 0,
                  refundFailed: false,
                  captureFailed: false,
                  canceled: false,
                  expired: false,
                },
              },
            ],
            exceptions: [],
            settlement: 'unproven',
            fulfillment: 'needs_review',
          },
          projection_version: 3,
          payment_reference: 'live-psp',
          method: 'card',
          evidence_sha256: 'a'.repeat(64),
          operation_id: '66666666-6666-4666-8666-666666666666',
        },
      ],
    }));
    const exceptionQuery = vi.fn(async (sql: string) =>
      sql.includes('SELECT e.enrollment_key')
        ? {
            rowCount: 1,
            rows: [
              {
                enrollment_key: 'website-checkout:fixture:seat:1:enrollment',
                payment_projection_version: 3,
              },
            ],
          }
        : { rowCount: 1, rows: [] },
    );
    const delivery = new WebsiteCheckoutHeartbeatLiveDelivery(
      {
        connect: vi.fn(async () => ({
          query: poolQuery,
          release: vi.fn(),
        })),
      } as never,
      'tandem-wordpress-live',
      scope,
      config,
      { run: provider } as never,
      async () => undefined,
      async (work) => work({ query: exceptionQuery } as never),
    );
    await expect(
      delivery.deliver(attemptId, {
        disposition: 'duplicate',
        orderKey: 'website-checkout:fixture',
        canonicalEnrollment: 'materialized',
        accessDelivery: 'membership_verified',
        certificateFinancialClearance: 'not_evaluated',
        currentPaymentState: 'eligible',
        reasons: ['exact_enrollment_replay'],
        evidenceReference: 'enrollment-admission:v1:fixture',
      }),
    ).resolves.toMatchObject({
      accessDelivery: 'held',
      reasons: expect.arrayContaining([
        'heartbeat_access_held_for_payment_review',
      ]),
    });
    expect(provider).not.toHaveBeenCalled();
    expect(
      exceptionQuery.mock.calls.some(([sql]) =>
        sql.includes('student_enrollment_exceptions_v2'),
      ),
    ).toBe(true);
  });
});

describe('managed LIVE private config and schema gates', () => {
  const paths: string[] = [];
  afterEach(() => paths.splice(0));

  function writeConfig(overrides: Record<string, unknown> = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'website-checkout-live-'));
    const path = join(dir, 'config.json');
    paths.push(path);
    const receipt = activation();
    const value = {
      schemaVersion: 1,
      mode: 'live',
      purpose: 'website-checkout-live-v1',
      requestKey: '11'.repeat(32),
      responseKey: '22'.repeat(32),
      encryptionKey: '33'.repeat(32),
      listener: { host: '127.0.0.1', port: 3456 },
      database: {
        host: 'approved-database-host.invalid',
        port: 5432,
        name: 'approved_database',
        user: 'approved_user',
        ssl: 'require',
        role: 'nanoclaw_admin',
        schemaContract: 'nanoclaw-v2:148,149-159',
      },
      adyen: {
        environment: 'live',
        endpointPrefix: 'ProviderIssuedPrefixWithUppercase123456',
        apiKey: 'fixture-live-key',
        company: 'company-live',
        merchant: 'merchant-live',
        store: 'store-live',
        webhookHmacKey: '44'.repeat(32),
      },
      backend: {
        caller: 'tandem-wordpress-live',
        requestKeyId: 'live-request-v1',
        responseKeyId: 'live-response-v1',
        quoteAuthority: 'tandem-wordpress-commerce-v1',
        allowedOrigin: 'https://tandemcoach.co',
        returnPath: '/checkout/return',
        cardCaptureConfigurationEvidence: 'capture-policy-live-v1',
        attributionFieldMap: {
          id: 'checkout-attribution-fields-v1',
          sha256: '55'.repeat(32),
        },
        attributionExternalEmission: 'disabled',
        enrollmentTerms: {
          version: 'terms-live-v1',
          contentSha256: '66'.repeat(32),
        },
        privacy: { version: 'privacy-live-v1', contentSha256: '77'.repeat(32) },
        promotionPolicyReferences: [],
      },
      activation: {
        serviceEnabled: false,
        recoverExisting: false,
        newAttemptsEnabled: false,
      },
      publication: {
        artifactPath: publicationPath,
        publicationId: 'student-foundations-publication-v1',
        publicationRevision: 2,
        payloadSha256: publication.payload_sha256,
        activationReceipt: receipt,
      },
      heartbeatAccess: { enabled: false },
      receiptWelcome: { owner: 'unassigned', enabled: false },
      fulfillment: { pollIntervalMs: 5000, batchSize: 25 },
      ...overrides,
    };
    writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
    return path;
  }

  it('accepts explicit loopback-only inert config and rejects listener exposure', () => {
    expect(
      parseWebsiteCheckoutLivePrivateConfig(writeConfig()).listener,
    ).toEqual({
      host: '127.0.0.1',
      port: 3456,
    });
    expect(() =>
      parseWebsiteCheckoutLivePrivateConfig(
        writeConfig({ listener: { host: '0.0.0.0', port: 3456 } }),
      ),
    ).toThrow('invalid_website_checkout_live_private_config');
  });

  it('defaults fulfillment exclusions empty and accepts unique owner test attempts only', () => {
    expect(
      parseWebsiteCheckoutLivePrivateConfig(writeConfig()).fulfillment
        .excludedAttemptIds,
    ).toEqual([]);
    const attemptId = '70db04a3-2d1d-4639-9fe8-434226f87577';
    expect(
      parseWebsiteCheckoutLivePrivateConfig(
        writeConfig({
          fulfillment: {
            pollIntervalMs: 5000,
            batchSize: 25,
            excludedAttemptIds: [attemptId],
          },
        }),
      ).fulfillment.excludedAttemptIds,
    ).toEqual([attemptId]);
    expect(() =>
      parseWebsiteCheckoutLivePrivateConfig(
        writeConfig({
          fulfillment: {
            pollIntervalMs: 5000,
            batchSize: 25,
            excludedAttemptIds: [attemptId, attemptId],
          },
        }),
      ),
    ).toThrow('invalid_website_checkout_live_private_config');
  });

  it('keeps the executable service default-off without opening dependencies', async () => {
    const path = writeConfig();
    const inert = JSON.parse(readFileSync(path, 'utf8'));
    inert.publication.activationReceipt = null;
    writeFileSync(path, JSON.stringify(inert), { mode: 0o600 });
    expect(
      parseWebsiteCheckoutLivePrivateConfig(path).publicationActivationReceipt,
    ).toBeNull();
    const pool = {
      connect: vi.fn(),
      end: vi.fn(),
    };
    await expect(
      startWebsiteCheckoutLiveService(path, { pool: pool as never }),
    ).rejects.toThrow('payment_live_runtime_disabled');
    expect(pool.connect).not.toHaveBeenCalled();
    expect(pool.end).not.toHaveBeenCalled();
  });

  it('blocks new LIVE Sessions unless access and receipt owners are activated', () => {
    expect(() =>
      parseWebsiteCheckoutLivePrivateConfig(
        writeConfig({
          activation: {
            serviceEnabled: true,
            recoverExisting: true,
            newAttemptsEnabled: true,
          },
        }),
      ),
    ).toThrow('invalid_website_checkout_live_private_config');
  });

  it('admits a new-attempt config only with every exact activation owner receipt', () => {
    const path = writeConfig();
    const value = JSON.parse(readFileSync(path, 'utf8'));
    value.activation = {
      serviceEnabled: true,
      recoverExisting: true,
      newAttemptsEnabled: true,
    };
    const heartbeat = {
      enabled: true,
      groupId: LIVE_FOUNDATIONS_HEARTBEAT_GROUP_ID,
      courseId: LIVE_FOUNDATIONS_HEARTBEAT_COURSE_ID,
      cohortId: LIVE_FOUNDATIONS_HEARTBEAT_COHORT_ID,
      activationDecisionReference: 'decision:fixture-heartbeat-activation',
      activationApprovedAt: '2026-09-11T12:00:00Z',
    };
    value.heartbeatAccess = {
      ...heartbeat,
      activationReceiptSha256: createHash('sha256')
        .update(JSON.stringify(heartbeat))
        .digest('hex'),
    };
    const notice = {
      owner: 'gmail_website_checkout_notices',
      enabled: true,
      caller: 'tandem-wordpress-live',
      offerLocale: 'mcq-program-a-foundations:en-US',
      productName: 'Mentor Coaching Foundations',
      courseUrl:
        'https://community.tandemcoaching.academy/courses/c/f2a36eca-a017-4536-9b83-368f51219895',
      senderAccount: 'profile@example.com',
      senderAddress: 'Tandem Coaching <receipts@example.com>',
      decisionReference: 'decision:fixture-notice-activation',
      approvedAt: '2026-09-11T12:00:00Z',
    };
    value.receiptWelcome = {
      ...notice,
      activationReceiptSha256: createHash('sha256')
        .update(JSON.stringify(notice))
        .digest('hex'),
    };
    writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
    expect(parseWebsiteCheckoutLivePrivateConfig(path)).toMatchObject({
      activation: { newAttemptsEnabled: true },
      heartbeatAccess: { enabled: true },
      receiptWelcome: {
        enabled: true,
        owner: 'gmail_website_checkout_notices',
      },
    });
  });

  it('requires exact existing schema lineage without applying migrations', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ database: 'approved_database', role_exists: true }],
      })
      .mockResolvedValueOnce({
        rowCount: 17,
        rows: [
          'student_projection_outbox',
          'student_projection_receipts',
          'payment_attempts',
          'payment_operations',
          'payment_request_nonces',
          'payment_events',
          'payment_method_bindings',
          'payment_session_result_operations',
          'payment_session_terminal_nonpayment_receipts',
          'payment_session_retry_exceptions',
          'student_financial_obligations',
          'payment_identity_preparations',
          'payment_checkout_admission_evidence',
          'payment_checkout_attribution_admissions',
          'payment_enrollment_admissions',
          'website_checkout_customer_notice_jobs',
          'website_checkout_customer_notice_receipts',
        ].map((relname) => ({ relname, owner: 'nanoclaw_admin' })),
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: 28 }] });
    await expect(
      verifyWebsiteCheckoutLiveSchema({ query } as never, 'approved_database'),
    ).resolves.toBeUndefined();
    expect(query.mock.calls.every(([sql]) => /^\s*SELECT/.test(sql))).toBe(
      true,
    );
  });

  it('starts, reports shallow health, stops cleanly and reuses existing state on restart', async () => {
    const path = writeConfig({
      activation: {
        serviceEnabled: true,
        recoverExisting: true,
        newAttemptsEnabled: false,
      },
    });
    const makePool = () => {
      const query = vi.fn(async (sql: string) => {
        if (sql.includes('current_database()'))
          return {
            rowCount: 1,
            rows: [{ database: 'approved_database', role_exists: true }],
          };
        if (sql.includes('FROM pg_class'))
          return {
            rowCount: 17,
            rows: [
              'student_projection_outbox',
              'student_projection_receipts',
              'payment_attempts',
              'payment_operations',
              'payment_request_admissions',
              'payment_events',
              'payment_method_bindings',
              'payment_session_result_operations',
              'payment_session_terminal_nonpayment_receipts',
              'payment_session_retry_exceptions',
              'student_financial_obligations',
              'payment_identity_preparations',
              'payment_checkout_admission_evidence',
              'payment_checkout_attribution_admissions',
              'payment_enrollment_admissions',
              'website_checkout_customer_notice_jobs',
              'website_checkout_customer_notice_receipts',
            ].map((relname) => ({
              relname,
              owner: 'nanoclaw_admin',
            })),
          };
        if (sql.includes('information_schema.columns'))
          return { rowCount: 1, rows: [{ count: 28 }] };
        throw new Error(`unexpected query: ${sql}`);
      });
      const release = vi.fn();
      return {
        pool: {
          connect: vi.fn(async () => ({ query, release })),
          end: vi.fn(async () => undefined),
        },
        query,
      };
    };
    const makeServer = () => {
      let listener:
        | ((request: unknown, response: unknown) => Promise<void>)
        | undefined;
      const server = {
        maxConnections: 0,
        headersTimeout: 0,
        requestTimeout: 0,
        keepAliveTimeout: 0,
        once: vi.fn(),
        off: vi.fn(),
        on: vi.fn(),
        listen: vi.fn((_port: number, _host: string, callback: () => void) =>
          callback(),
        ),
        close: vi.fn((callback: () => void) => callback()),
        closeIdleConnections: vi.fn(),
        closeAllConnections: vi.fn(),
      };
      const factory = vi.fn((handler) => {
        listener = handler;
        return server;
      });
      return { server, factory, listener: () => listener! };
    };
    for (let restart = 0; restart < 2; restart += 1) {
      const { pool, query } = makePool();
      const managed = makeServer();
      const runtime = await startWebsiteCheckoutLiveService(path, {
        pool: pool as never,
        serverFactory: managed.factory as never,
      });
      expect(runtime).toMatchObject({ host: '127.0.0.1', port: 3456 });
      expect(managed.server.listen).toHaveBeenCalledWith(
        3456,
        '127.0.0.1',
        expect.any(Function),
      );
      const response = { writeHead: vi.fn(), end: vi.fn() };
      await managed.listener()({ url: '/health' }, response);
      expect(response.writeHead).toHaveBeenCalledWith(
        200,
        expect.objectContaining({ 'Cache-Control': 'no-store' }),
      );
      expect(response.end).toHaveBeenCalledWith(
        JSON.stringify({ status: 'ok', service: 'website-checkout-live' }),
      );
      await runtime.stop();
      expect(managed.server.close).toHaveBeenCalledOnce();
      expect(pool.end).toHaveBeenCalledOnce();
      expect(query.mock.calls.every(([sql]) => /^\s*SELECT/.test(sql))).toBe(
        true,
      );
    }
  });
});
