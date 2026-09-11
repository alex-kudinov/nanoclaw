import { describe, expect, it, vi } from 'vitest';

import type { CheckoutPaymentEvidence } from './payment-checkout-evidence.js';
import {
  createPaymentAttempt,
  paymentScopeFingerprint,
} from './payment-domain.js';
import type { WebsiteCheckoutEnrollmentResult } from './website-checkout-enrollment-adapter.js';
import {
  CanonicalGmailWebsiteCheckoutNoticeSender,
  PgWebsiteCheckoutNoticeAuthorityReader,
  WebsiteCheckoutCustomerNoticeOwner,
  type WebsiteCheckoutCustomerNoticeConfig,
  type WebsiteCheckoutNoticeAuthority,
  type WebsiteCheckoutNoticeAuthorityReader,
  type WebsiteCheckoutNoticeGmail,
  type WebsiteCheckoutNoticeJob,
  type WebsiteCheckoutNoticeLedger,
} from './website-checkout-customer-notices.js';

const ATTEMPT = '10000000-0000-4000-8000-000000000001';
const config: WebsiteCheckoutCustomerNoticeConfig = {
  enabled: true,
  caller: 'tandem-wordpress-live',
  offerLocale: 'mcq-program-a-foundations:en-US',
  productName: 'Mentor Coaching Foundations',
  courseUrl: 'https://community.tandemcoaching.academy/courses/foundations',
  senderAccount: 'academy@tandemcoach.co',
  senderAddress: 'academy@tandemcoach.co',
  decisionReference: 'decision:customer-notice-fixture',
  activationReceiptSha256: 'a'.repeat(64),
  scope: {
    provider: 'adyen',
    environment: 'live',
    company: 'company',
    merchant: 'merchant',
    store: 'store',
    endpointRegion: 'eu',
  },
  cardCaptureConfigurationEvidence: 'adyen-live-immediate-capture:v1',
};
const enrollment: WebsiteCheckoutEnrollmentResult = {
  disposition: 'accepted',
  orderKey: 'order:fixture',
  canonicalEnrollment: 'materialized',
  accessDelivery: 'membership_verified',
  certificateFinancialClearance: 'not_evaluated',
  currentPaymentState: 'eligible',
  reasons: ['heartbeat_membership_verified_login_not_proven'],
  evidenceReference: 'enrollment-admission:v1:' + 'b'.repeat(64),
};
const baseAuthority: WebsiteCheckoutNoticeAuthority = {
  attemptId: ATTEMPT,
  orderKey: enrollment.orderKey,
  payerPartyId: 10,
  participantPartyId: 10,
  payerRelationship: 'self_purchase_explicit',
  payer: { name: 'Alex Learner', email: 'alex@example.test' },
  participant: { name: 'Alex Learner', email: 'alex@example.test' },
  amountMinor: 29900,
  currency: 'USD',
  accessVerified: true,
};

class MemoryLedger implements WebsiteCheckoutNoticeLedger {
  jobs = new Map<string, WebsiteCheckoutNoticeJob>();
  ensure(
    input: Omit<
      WebsiteCheckoutNoticeJob,
      | 'id'
      | 'state'
      | 'uncertainAcceptance'
      | 'gmailMessageId'
      | 'gmailThreadId'
      | 'leaseToken'
      | 'leaseExpiresAt'
      | 'version'
    >,
  ) {
    const current = this.jobs.get(input.noticeKey);
    if (current) {
      for (const [key, value] of Object.entries(input))
        if (
          String((current as unknown as Record<string, unknown>)[key]) !==
          String(value)
        )
          throw new Error('notice_job_identity_conflict');
      return Promise.resolve(current);
    }
    const row: WebsiteCheckoutNoticeJob = {
      ...input,
      id: this.jobs.size + 1,
      state: 'queued',
      uncertainAcceptance: false,
      gmailMessageId: null,
      gmailThreadId: null,
      leaseToken: null,
      leaseExpiresAt: null,
      version: 0,
    };
    this.jobs.set(row.noticeKey, row);
    return Promise.resolve(row);
  }
  claim(key: string, _now: string, until: string) {
    const row = this.one(key);
    if (
      row.state === 'queued' ||
      (row.state === 'held' && !row.uncertainAcceptance)
    )
      Object.assign(row, {
        state: 'claimed',
        uncertainAcceptance: false,
        leaseToken: '20000000-0000-4000-8000-000000000002',
        leaseExpiresAt: until,
        version: row.version + 1,
      });
    return Promise.resolve(row);
  }
  acknowledge(key: string, token: string, messageId: string, threadId: string) {
    const row = this.one(key);
    if (row.state !== 'claimed' || row.leaseToken !== token)
      throw new Error('notice_transition_conflict');
    Object.assign(row, {
      state: 'acknowledged',
      gmailMessageId: messageId,
      gmailThreadId: threadId,
      leaseToken: null,
      leaseExpiresAt: null,
      version: row.version + 1,
    });
    return Promise.resolve(row);
  }
  adopt(key: string, messageId: string, threadId: string) {
    const row = this.one(key);
    Object.assign(row, {
      state: 'acknowledged',
      gmailMessageId: messageId,
      gmailThreadId: threadId,
      leaseToken: null,
      leaseExpiresAt: null,
      uncertainAcceptance: false,
      version: row.version + 1,
    });
    return Promise.resolve(row);
  }
  confirm(key: string, messageId: string, threadId: string) {
    const row = this.one(key);
    if (row.gmailMessageId !== messageId || row.gmailThreadId !== threadId)
      throw new Error('notice_transition_conflict');
    Object.assign(row, {
      state: 'confirmed',
      uncertainAcceptance: false,
      version: row.version + 1,
    });
    return Promise.resolve(row);
  }
  hold(key: string, code: string, uncertain: boolean) {
    const row = this.one(key);
    Object.assign(row, {
      state: 'held',
      uncertainAcceptance: uncertain,
      leaseToken: null,
      leaseExpiresAt: null,
      version: row.version + 1,
      lastErrorCode: code,
    });
    return Promise.resolve(row);
  }
  private one(key: string) {
    const row = this.jobs.get(key);
    if (!row) throw new Error('missing');
    return row;
  }
}

class FakeGmail implements WebsiteCheckoutNoticeGmail {
  sends: { to: string; subject: string; body: string }[] = [];
  existing: { messageId: string; threadId: string } | null = null;
  sendError = false;
  verifyError = false;
  readError = false;
  async verifyAccount() {
    if (this.verifyError) throw new Error('account mismatch');
  }
  async findExact() {
    return this.existing;
  }
  async send(input: { to: string; subject: string; body: string }) {
    this.sends.push(input);
    if (this.sendError) throw new Error('unknown');
    return {
      messageId: `gmail-${this.sends.length}`,
      threadId: `thread-${this.sends.length}`,
    };
  }
  async readback(input: { messageId: string; threadId: string }) {
    if (this.readError) throw new Error('readback');
    return { messageId: input.messageId, threadId: input.threadId };
  }
}
function reader(
  values: WebsiteCheckoutNoticeAuthority[],
): WebsiteCheckoutNoticeAuthorityReader {
  let index = 0;
  return {
    read: vi.fn(async () => values[Math.min(index++, values.length - 1)]!),
  };
}
function owner(
  values: WebsiteCheckoutNoticeAuthority[],
  ledger = new MemoryLedger(),
  gmail = new FakeGmail(),
) {
  return {
    owner: new WebsiteCheckoutCustomerNoticeOwner(
      config,
      reader(values),
      ledger,
      gmail,
      () => new Date('2026-09-11T15:00:00Z'),
    ),
    ledger,
    gmail,
  };
}
const input = () => ({
  attemptId: ATTEMPT,
  idempotencyKey: `website_checkout_receipt_welcome:${ATTEMPT}`,
  enrollment,
});

describe('WebsiteCheckoutCustomerNoticeOwner', () => {
  it('waits for verified access before the one self payment/access confirmation', async () => {
    const pending = { ...baseAuthority, accessVerified: false };
    const first = owner([pending]);
    expect(await first.owner.reconcile(input())).toEqual({
      state: 'queued',
      receiptReference: null,
    });
    expect(first.gmail.sends).toHaveLength(0);
    const ready = owner([baseAuthority, baseAuthority]);
    expect(await ready.owner.reconcile(input())).toEqual({
      state: 'verified',
      receiptReference: `website-checkout-notices:v1:${ATTEMPT}`,
    });
    expect(ready.gmail.sends).toHaveLength(1);
    expect(ready.gmail.sends[0]!.body).toContain('$299.00 USD');
    expect(ready.gmail.sends[0]!.body).toContain('course access is confirmed');
    expect(ready.gmail.sends[0]!.body).not.toMatch(
      /settled|certificate eligible|marketing/i,
    );
    expect(await ready.owner.reconcile(input())).toEqual({
      state: 'verified',
      receiptReference: `website-checkout-notices:v1:${ATTEMPT}`,
    });
    expect(ready.gmail.sends).toHaveLength(1);
  });

  it('splits gift payer receipt from learner access and does not duplicate Heartbeat invitation', async () => {
    const gift = {
      ...baseAuthority,
      payerRelationship: 'separate_payer' as const,
      participantPartyId: 11,
      participant: { name: 'Taylor Learner', email: 'taylor@example.test' },
      accessVerified: false,
    };
    const ledger = new MemoryLedger(),
      gmail = new FakeGmail();
    const first = new WebsiteCheckoutCustomerNoticeOwner(
      config,
      reader([gift, gift]),
      ledger,
      gmail,
      () => new Date('2026-09-11T15:00:00Z'),
    );
    expect(await first.reconcile(input())).toEqual({
      state: 'queued',
      receiptReference: null,
    });
    expect(gmail.sends).toHaveLength(1);
    const ready = { ...gift, accessVerified: true };
    const second = new WebsiteCheckoutCustomerNoticeOwner(
      config,
      reader([ready, ready, ready]),
      ledger,
      gmail,
      () => new Date('2026-09-11T15:01:00Z'),
    );
    expect(await second.reconcile(input())).toEqual({
      state: 'verified',
      receiptReference: `website-checkout-notices:v1:${ATTEMPT}`,
    });
    expect(gmail.sends).toHaveLength(2);
    expect(gmail.sends[1]!.to).toBe('taylor@example.test');
    expect(gmail.sends[1]!.body).toMatch(
      /Heartbeat may send its own sign-in invitation separately/,
    );
    expect(gmail.sends[1]!.body).toMatch(/does not replace that invitation/);
  });

  it('holds an unknown Gmail acceptance and adopts one exact Sent readback without resend', async () => {
    const ledger = new MemoryLedger(),
      gmail = new FakeGmail();
    gmail.sendError = true;
    const first = new WebsiteCheckoutCustomerNoticeOwner(
      config,
      reader([baseAuthority, baseAuthority]),
      ledger,
      gmail,
      () => new Date('2026-09-11T15:00:00Z'),
    );
    expect(await first.reconcile(input())).toEqual({
      state: 'held',
      receiptReference: null,
    });
    expect(gmail.sends).toHaveLength(1);
    gmail.sendError = false;
    gmail.existing = { messageId: 'gmail-adopted', threadId: 'thread-adopted' };
    const resumed = new WebsiteCheckoutCustomerNoticeOwner(
      config,
      reader([baseAuthority, baseAuthority]),
      ledger,
      gmail,
      () => new Date('2026-09-11T15:01:00Z'),
    );
    expect(await resumed.reconcile(input())).toEqual({
      state: 'verified',
      receiptReference: `website-checkout-notices:v1:${ATTEMPT}`,
    });
    expect(gmail.sends).toHaveLength(1);
  });

  it('does not expose a partial payer receipt as aggregate gift completion', async () => {
    const giftPending = {
      ...baseAuthority,
      payerRelationship: 'separate_payer' as const,
      participantPartyId: 11,
      participant: { name: 'Taylor Learner', email: 'taylor@example.test' },
      accessVerified: false,
    };
    const ledger = new MemoryLedger();
    const gmail = new FakeGmail();
    const first = new WebsiteCheckoutCustomerNoticeOwner(
      config,
      reader([giftPending, giftPending]),
      ledger,
      gmail,
      () => new Date('2026-09-11T15:00:00Z'),
    );
    expect(await first.reconcile(input())).toEqual({
      state: 'queued',
      receiptReference: null,
    });
    gmail.sendError = true;
    const ready = { ...giftPending, accessVerified: true };
    const second = new WebsiteCheckoutCustomerNoticeOwner(
      config,
      reader([ready, ready, ready]),
      ledger,
      gmail,
      () => new Date('2026-09-11T15:01:00Z'),
    );
    expect(await second.reconcile(input())).toEqual({
      state: 'held',
      receiptReference: null,
    });
    expect(
      [...ledger.jobs.values()].find(
        (job) => job.kind === 'gift_payer_receipt',
      ),
    ).toMatchObject({ state: 'confirmed' });
  });

  it('re-reads canonical identity immediately before send', async () => {
    const changed = {
      ...baseAuthority,
      payer: { name: 'Current Name', email: 'current@example.test' },
      participant: { name: 'Current Name', email: 'current@example.test' },
    };
    const value = owner([baseAuthority, changed]);
    expect(await value.owner.reconcile(input())).toMatchObject({
      state: 'verified',
    });
    expect(value.gmail.sends[0]!.to).toBe('current@example.test');
    expect(value.gmail.sends[0]!.body).toContain('Hi Current Name');
  });

  it('fails closed for an unverified enrollment or wrong idempotency key', async () => {
    const value = owner([baseAuthority]);
    expect(
      await value.owner.reconcile({
        ...input(),
        idempotencyKey: 'browser-choice',
      }),
    ).toEqual({ state: 'held', receiptReference: null });
    expect(
      await value.owner.reconcile({
        ...input(),
        enrollment: { ...enrollment, currentPaymentState: 'pending' },
      }),
    ).toEqual({ state: 'held', receiptReference: null });
    expect(value.gmail.sends).toHaveLength(0);
  });

  it('holds a mismatched Gmail account before claim and can retry only after the account is exact', async () => {
    const ledger = new MemoryLedger(),
      gmail = new FakeGmail();
    gmail.verifyError = true;
    const first = new WebsiteCheckoutCustomerNoticeOwner(
      config,
      reader([baseAuthority, baseAuthority]),
      ledger,
      gmail,
      () => new Date('2026-09-11T15:00:00Z'),
    );
    expect(await first.reconcile(input())).toEqual({
      state: 'held',
      receiptReference: null,
    });
    expect(gmail.sends).toHaveLength(0);
    expect([...ledger.jobs.values()][0]).toMatchObject({
      state: 'held',
      uncertainAcceptance: false,
    });
    gmail.verifyError = false;
    const retry = new WebsiteCheckoutCustomerNoticeOwner(
      config,
      reader([baseAuthority, baseAuthority]),
      ledger,
      gmail,
      () => new Date('2026-09-11T15:01:00Z'),
    );
    expect(await retry.reconcile(input())).toMatchObject({ state: 'verified' });
    expect(gmail.sends).toHaveLength(1);
  });
});

describe('CanonicalGmailWebsiteCheckoutNoticeSender', () => {
  it('pins account and exact metadata around canonical sendEmail', async () => {
    const getProfile = vi.fn(async () => ({
      data: { emailAddress: 'academy@tandemcoach.co' },
    }));
    const list = vi.fn(async () => ({
      data: { messages: [{ id: 'm1', threadId: 't1' }] },
    }));
    const get = vi.fn(async () => ({
      data: {
        id: 'm1',
        threadId: 't1',
        payload: {
          headers: [
            { name: 'To', value: 'student@example.test' },
            { name: 'From', value: 'academy@tandemcoach.co' },
            { name: 'Subject', value: 'Subject' },
          ],
        },
      },
    }));
    const client = { users: { getProfile, messages: { list, get } } } as never;
    const send = vi.fn(
      async (_input: never, deps?: { getClient?: () => unknown }) => {
        expect(deps?.getClient?.()).toBe(client);
        return { messageId: 'm1', threadId: 't1' };
      },
    );
    const guard = vi.fn();
    const gmail = new CanonicalGmailWebsiteCheckoutNoticeSender(
      client,
      'academy@tandemcoach.co',
      'academy@tandemcoach.co',
      send as never,
      guard as never,
    );
    await gmail.verifyAccount();
    expect(
      await gmail.findExact({ to: 'student@example.test', subject: 'Subject' }),
    ).toEqual({ messageId: 'm1', threadId: 't1' });
    expect(
      await gmail.send({
        to: 'student@example.test',
        subject: 'Subject',
        body: 'Body',
      }),
    ).toEqual({ messageId: 'm1', threadId: 't1' });
    expect(guard).toHaveBeenCalledWith({
      system: 'gmail',
      actionClass: 'c3_external_communication',
      source: 'host:website-checkout-customer-notice',
    });
    expect(
      await gmail.readback({
        messageId: 'm1',
        threadId: 't1',
        to: 'student@example.test',
        subject: 'Subject',
      }),
    ).toEqual({ messageId: 'm1', threadId: 't1' });
  });

  it('separately verifies the OAuth profile and one accepted Send-As alias', async () => {
    const listAliases = vi.fn(async () => ({
      data: {
        sendAs: [
          {
            sendAsEmail: 'receipts@tandemcoach.co',
            verificationStatus: 'accepted',
            treatAsAlias: true,
          },
        ],
      },
    }));
    const getAlias = vi.fn(async () => ({
      data: {
        sendAsEmail: 'receipts@tandemcoach.co',
        verificationStatus: 'accepted',
      },
    }));
    const client = {
      users: {
        getProfile: vi.fn(async () => ({
          data: { emailAddress: 'profile@tandemcoach.co' },
        })),
        settings: { sendAs: { list: listAliases, get: getAlias } },
      },
    } as never;
    const gmail = new CanonicalGmailWebsiteCheckoutNoticeSender(
      client,
      'profile@tandemcoach.co',
      'Tandem Coaching <receipts@tandemcoach.co>',
      vi.fn() as never,
      vi.fn() as never,
    );
    await expect(gmail.verifyAccount()).resolves.toBeUndefined();
    expect(listAliases).toHaveBeenCalledWith({ userId: 'me' });
    expect(getAlias).toHaveBeenCalledWith({
      userId: 'me',
      sendAsEmail: 'receipts@tandemcoach.co',
    });
  });

  it('rejects an unaccepted configured Send-As alias', async () => {
    const client = {
      users: {
        getProfile: vi.fn(async () => ({
          data: { emailAddress: 'profile@tandemcoach.co' },
        })),
        settings: {
          sendAs: {
            list: vi.fn(async () => ({
              data: {
                sendAs: [
                  {
                    sendAsEmail: 'receipts@tandemcoach.co',
                    verificationStatus: 'pending',
                  },
                ],
              },
            })),
            get: vi.fn(),
          },
        },
      },
    } as never;
    const gmail = new CanonicalGmailWebsiteCheckoutNoticeSender(
      client,
      'profile@tandemcoach.co',
      'Tandem Coaching <receipts@tandemcoach.co>',
      vi.fn() as never,
      vi.fn() as never,
    );
    await expect(gmail.verifyAccount()).rejects.toThrow(
      'notice_gmail_send_as_mismatch',
    );
  });
});

describe('PgWebsiteCheckoutNoticeAuthorityReader', () => {
  it('independently requires exact LIVE scope, canonical card evidence, money and active access', async () => {
    const now = Date.parse('2026-09-11T15:00:00Z');
    const attempt = createPaymentAttempt({
      attemptId: ATTEMPT,
      now,
      scope: config.scope,
      paymentMethodCapabilities: ['card'],
      quote: {
        schemaVersion: 1,
        quoteId: '20000000-0000-4000-8000-000000000002',
        authority: 'wordpress:live',
        offerKey: 'mcq-program-a-foundations',
        catalogVersion: 'catalog:v1',
        bundleVersion: 'bundle:v1',
        deliveryVersion: 'delivery:v1',
        locale: 'en-US',
        country: 'US',
        payerReference: 'party-ref:v1:' + '1'.repeat(64),
        participantReference: 'party-ref:v1:' + '1'.repeat(64),
        currency: 'USD',
        originalAmount: 29900,
        discountAmount: 0,
        finalAmount: 29900,
        discountPolicyReference: null,
        redemptionReference: null,
        paymentOption: 'one_time',
        termsVersion: 'terms:v1',
        consentReceipt: 'consent:v1',
        acceptedAt: now,
        createdAt: now,
        expiresAt: now + 300000,
      },
    });
    const projection: CheckoutPaymentEvidence = {
      state: 'authorization_recorded',
      payments: [
        {
          paymentReference: 'ABCDEFGHIJKLMNOP',
          evidence: {
            pending: false,
            authorization: 'authorized',
            capturedAmount: 0,
            captureFailed: false,
            refundedAmount: 0,
            refundFailed: false,
            refundReversedAmount: 0,
            chargebackAmount: 0,
            chargebackReversedAmount: 0,
            canceled: false,
            expired: false,
            evidenceState: 'consistent',
            exceptions: [],
            settlement: 'unproven',
            fulfillment: 'not_evaluated',
          },
        },
      ],
      exceptions: [],
      settlement: 'unproven',
      fulfillment: 'not_evaluated',
    };
    const row = {
      order_key: enrollment.orderKey,
      payer_party_id: '10',
      participant_party_id: '10',
      payer_relationship: 'self_purchase_explicit',
      payer_name: 'Alex Learner',
      payer_email: 'alex@example.test',
      participant_name: 'Alex Learner',
      participant_email: 'alex@example.test',
      amount_minor: '29900',
      currency: 'USD',
      contract: attempt,
      payment_method: 'card',
      payment_reference: 'ABCDEFGHIJKLMNOP',
      method_evidence_sha256: 'b'.repeat(64),
      payment_projection: projection,
      scope_sha256: paymentScopeFingerprint(config.scope),
      heartbeat_verified: true,
    };
    const query = vi.fn(async (_sql: string, params: unknown[]) => {
      expect(params).toEqual([
        ATTEMPT,
        'tandem-wordpress-live',
        expect.stringContaining('heartbeat:main:group:'),
        paymentScopeFingerprint(config.scope),
      ]);
      return { rowCount: 1, rows: [row] };
    });
    const transaction = async <T>(
      work: (client: { query: typeof query }) => Promise<T>,
    ) => work({ query });
    const reader = new PgWebsiteCheckoutNoticeAuthorityReader(
      transaction as never,
      'tandem-wordpress-live',
      config.scope,
      config.cardCaptureConfigurationEvidence,
    );
    await expect(reader.read(ATTEMPT, enrollment)).resolves.toMatchObject({
      amountMinor: 29900,
      currency: 'USD',
      accessVerified: true,
    });
    row.payment_projection = { ...projection, state: 'refused', payments: [] };
    await expect(reader.read(ATTEMPT, enrollment)).rejects.toThrow(
      'notice_canonical_authority_conflict',
    );
  });
});

describe('migration 158 source', () => {
  it('is admin-only, immutable and refuses populated rollback', async () => {
    const fs = await import('node:fs');
    const sql = fs.readFileSync(
      'data/business/migrations/nanoclaw-v2/158_website_checkout_customer_notices.sql',
      'utf8',
    );
    const rollback = fs.readFileSync(
      'data/business/migrations/nanoclaw-v2/rollback_158_website_checkout_customer_notices.sql',
      'utf8',
    );
    expect(sql).toContain('website_checkout_customer_notice_jobs');
    expect(sql).toContain('website_checkout_customer_notice_receipts');
    expect(sql).toContain('uncertain_acceptance');
    expect(sql).toContain('REVOKE ALL');
    expect(sql).toContain('immutable contract');
    expect(rollback).toContain(
      'populated website checkout customer notice rollback refused',
    );
    expect(sql).not.toContain('plutio_outbox');
    expect(sql).not.toContain("target IN ('student_roster'");
  });
});
