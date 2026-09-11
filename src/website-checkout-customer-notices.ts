import { createHash, randomUUID } from 'node:crypto';

import type { gmail_v1 } from 'googleapis';
import type { PoolClient } from 'pg';

import { assertExternalWriteAllowed } from './action-safety.js';
import { GMAIL_SEND_AS } from './config.js';
import { getGmailClient } from './gmail-auth.js';
import { sendEmail } from './gmail-api.js';
import type { CheckoutPaymentEvidence } from './payment-checkout-evidence.js';
import {
  paymentScopeFingerprint,
  validateAttempt,
  type PaymentScope,
} from './payment-domain.js';
import type { PaymentMethodBinding } from './payment-method-reconciliation-store.js';
import { decidePaymentReadiness } from './payment-readiness.js';
import type { PaymentTransaction } from './payment-store.js';
import { LIVE_FOUNDATIONS_HEARTBEAT_GROUP_ID } from './website-checkout-heartbeat-live-delivery.js';
import type { WebsiteCheckoutEnrollmentResult } from './website-checkout-enrollment-adapter.js';
import type { WebsiteCheckoutReceiptWelcomeOwner } from './website-checkout-service.js';

const OFFER = 'mcq-program-a-foundations';
const LOCALE = 'en-US';
const PRODUCT = 'Mentor Coaching Foundations';
const BASE_AMOUNT = 29900;
const CURRENCY = 'USD';
const ACTOR = 'website_checkout_customer_notice';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
type NoticeKind =
  | 'self_confirmation'
  | 'gift_payer_receipt'
  | 'gift_learner_access';
type NoticeState = 'queued' | 'claimed' | 'acknowledged' | 'confirmed' | 'held';

export interface WebsiteCheckoutCustomerNoticeConfig {
  enabled: true;
  caller: 'tandem-wordpress-live';
  offerLocale: 'mcq-program-a-foundations:en-US';
  productName: 'Mentor Coaching Foundations';
  courseUrl: string;
  senderAccount: string;
  senderAddress: string;
  decisionReference: string;
  activationReceiptSha256: string;
  scope: PaymentScope;
  cardCaptureConfigurationEvidence: string;
}

export interface WebsiteCheckoutNoticeAuthority {
  attemptId: string;
  orderKey: string;
  payerPartyId: number;
  participantPartyId: number;
  payerRelationship: 'self_purchase_explicit' | 'separate_payer';
  payer: { name: string; email: string };
  participant: { name: string; email: string };
  amountMinor: number;
  currency: 'USD';
  accessVerified: boolean;
}

export interface WebsiteCheckoutNoticeJob {
  id: number;
  noticeKey: string;
  idempotencyKey: string;
  attemptId: string;
  kind: NoticeKind;
  recipientPartyId: number;
  recipientEmailSha256: string;
  contentSha256: string;
  senderAccount: string;
  senderAddress: string;
  messageIdentity: string;
  state: NoticeState;
  uncertainAcceptance: boolean;
  gmailMessageId: string | null;
  gmailThreadId: string | null;
  leaseToken: string | null;
  leaseExpiresAt: string | null;
  version: number;
}

export interface WebsiteCheckoutNoticeLedger {
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
    now: string,
  ): Promise<WebsiteCheckoutNoticeJob>;
  claim(
    noticeKey: string,
    now: string,
    leaseExpiresAt: string,
  ): Promise<WebsiteCheckoutNoticeJob>;
  acknowledge(
    noticeKey: string,
    leaseToken: string,
    messageId: string,
    threadId: string,
    now: string,
  ): Promise<WebsiteCheckoutNoticeJob>;
  adopt(
    noticeKey: string,
    messageId: string,
    threadId: string,
    now: string,
  ): Promise<WebsiteCheckoutNoticeJob>;
  confirm(
    noticeKey: string,
    messageId: string,
    threadId: string,
    evidenceSha256: string,
    now: string,
  ): Promise<WebsiteCheckoutNoticeJob>;
  hold(
    noticeKey: string,
    code: string,
    uncertain: boolean,
    evidenceSha256: string,
    now: string,
  ): Promise<WebsiteCheckoutNoticeJob>;
}

export interface WebsiteCheckoutNoticeAuthorityReader {
  read(
    attemptId: string,
    enrollment: WebsiteCheckoutEnrollmentResult,
  ): Promise<WebsiteCheckoutNoticeAuthority>;
}

export interface WebsiteCheckoutNoticeGmail {
  verifyAccount(): Promise<void>;
  findExact(input: {
    to: string;
    subject: string;
  }): Promise<{ messageId: string; threadId: string } | null>;
  send(input: {
    to: string;
    subject: string;
    body: string;
  }): Promise<{ messageId: string; threadId: string }>;
  readback(input: {
    messageId: string;
    threadId: string;
    to: string;
    subject: string;
  }): Promise<{ messageId: string; threadId: string }>;
}

function sha(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
function normalizedEmail(value: unknown): string {
  if (typeof value !== 'string') throw new Error('notice_identity_invalid');
  const email = value.trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254)
    throw new Error('notice_identity_invalid');
  return email;
}
function text(value: unknown, maximum = 300): string {
  if (typeof value !== 'string') throw new Error('notice_identity_invalid');
  const result = value.trim().replace(/\s+/gu, ' ');
  if (
    !result ||
    result.length > maximum ||
    /[\u0000-\u001f\u007f]/u.test(result)
  )
    throw new Error('notice_identity_invalid');
  return result;
}
function instant(value: string): string {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error('notice_time_invalid');
  return new Date(ms).toISOString();
}
function money(amount: number): string {
  if (!Number.isSafeInteger(amount) || amount < 0)
    throw new Error('notice_amount_invalid');
  return `$${(amount / 100).toFixed(2)} USD`;
}
function headerEmail(value: string): string {
  return (value.match(/<([^>]+)>/)?.[1] ?? value).trim().toLowerCase();
}
function header(
  headers: readonly gmail_v1.Schema$MessagePartHeader[],
  name: string,
): string {
  return (
    headers
      .find((candidate) => candidate.name?.toLowerCase() === name)
      ?.value?.trim() ?? ''
  );
}
function evidence(value: unknown): string {
  return sha(JSON.stringify(value));
}

interface AuthorityRow {
  order_key: string;
  payer_party_id: string;
  participant_party_id: string;
  payer_relationship: string;
  payer_name: string;
  payer_email: string;
  participant_name: string;
  participant_email: string;
  amount_minor: string;
  currency: string;
  contract: unknown;
  payment_method: string;
  payment_reference: string;
  method_evidence_sha256: string;
  payment_projection: CheckoutPaymentEvidence;
  scope_sha256: string;
  heartbeat_verified: boolean;
  retry_exception: boolean;
}

export class PgWebsiteCheckoutNoticeAuthorityReader implements WebsiteCheckoutNoticeAuthorityReader {
  constructor(
    private readonly transaction: PaymentTransaction,
    private readonly caller: 'tandem-wordpress-live',
    private readonly scope: PaymentScope,
    private readonly cardCaptureConfigurationEvidence: string,
  ) {
    if (
      caller !== 'tandem-wordpress-live' ||
      scope.provider !== 'adyen' ||
      scope.environment !== 'live' ||
      scope.store === null ||
      !cardCaptureConfigurationEvidence
    )
      throw new Error('notice_authority_config_invalid');
  }

  async read(
    attemptId: string,
    enrollment: WebsiteCheckoutEnrollmentResult,
  ): Promise<WebsiteCheckoutNoticeAuthority> {
    return this.transaction(async (client) => {
      const result = await client.query<AuthorityRow>(
        `SELECT ea.order_key,o.payer_party_id::text,s.participant_party_id::text,
          s.payer_relationship,pp.display_name payer_name,
          lower(pp.primary_email::text) payer_email,
          lp.display_name participant_name,lower(lp.primary_email::text) participant_email,
          fo.amount_minor::text,fo.currency,a.contract,ea.payment_method,
          ea.payment_reference,ea.method_evidence_sha256,
          pe.projection payment_projection,ea.scope_sha256,
          EXISTS(SELECT 1 FROM business_v2.student_projection_outbox po
            WHERE po.target='heartbeat' AND po.subject_type='enrollment'
              AND po.subject_key=ea.enrollment_key AND po.state='verified'
              AND po.subject_version=e.version
              AND po.destination_key=$3) heartbeat_verified,
          EXISTS(SELECT 1 FROM business_v2.payment_session_retry_exceptions re
            WHERE re.attempt_id=ea.attempt_id) retry_exception
         FROM business_v2.payment_enrollment_admissions ea
         JOIN business_v2.payment_attempts a ON a.attempt_id=ea.attempt_id
         JOIN business_v2.student_enrollment_orders o
           ON o.order_key=ea.order_key AND o.state='materialized'
         JOIN business_v2.student_enrollment_seats s
           ON s.seat_key=ea.seat_key AND s.state='materialized'
         JOIN business_v2.student_enrollments_v2 e
           ON e.enrollment_key=ea.enrollment_key AND e.order_id=o.id
             AND e.seat_id=s.id AND e.state='active'
         JOIN business_v2.parties pp ON pp.id=o.payer_party_id
           AND pp.party_type='person' AND pp.merged_into IS NULL AND pp.primary_email IS NOT NULL
         JOIN business_v2.parties lp ON lp.id=s.participant_party_id
           AND lp.party_type='person' AND lp.merged_into IS NULL AND lp.primary_email IS NOT NULL
         JOIN business_v2.student_financial_agreements fa
           ON fa.order_id=o.id AND fa.state='active'
         JOIN business_v2.student_financial_obligations fo
           ON fo.agreement_id=fa.id AND fo.state='accepted_pending_receipt'
         JOIN business_v2.payment_checkout_evidence pe
           ON pe.attempt_id=ea.attempt_id
         WHERE ea.attempt_id=$1 AND ea.checkout_caller=$2
           AND ea.scope_sha256=$4
           AND ea.offer_key='mcq-program-a-foundations' AND ea.content_locale='en-US'`,
        [
          attemptId,
          this.caller,
          `heartbeat:main:group:${LIVE_FOUNDATIONS_HEARTBEAT_GROUP_ID}`,
          paymentScopeFingerprint(this.scope),
        ],
      );
      if (result.rowCount !== 1)
        throw new Error('notice_canonical_authority_missing');
      const row = result.rows[0];
      const attempt = validateAttempt(row.contract);
      const amountMinor = Number(row.amount_minor);
      const payerPartyId = Number(row.payer_party_id);
      const participantPartyId = Number(row.participant_party_id);
      const method: PaymentMethodBinding = {
        attemptId,
        paymentReference: row.payment_reference,
        paymentMethod:
          row.payment_method as PaymentMethodBinding['paymentMethod'],
        evidenceSha256: row.method_evidence_sha256,
      };
      const readiness = decidePaymentReadiness({
        attempt,
        evidence: row.payment_projection,
        methodBinding: method,
        receivedFunds: null,
        policy: {
          achAccess: 'verified_acceptance_provisional',
          achCertificate: 'received_funds_required',
          cardAccess: 'verified_authorization_and_auto_capture',
          cardCaptureConfigurationEvidence:
            this.cardCaptureConfigurationEvidence,
        },
        accessAlreadyGranted: row.heartbeat_verified === true,
      });
      if (
        attempt.attemptId !== attemptId ||
        attempt.quote.offerKey !== OFFER ||
        attempt.quote.locale !== LOCALE ||
        attempt.quote.originalAmount !== BASE_AMOUNT ||
        attempt.quote.finalAmount !== amountMinor ||
        attempt.quote.currency !== CURRENCY ||
        row.currency !== CURRENCY ||
        row.payment_method !== 'card' ||
        row.scope_sha256 !== paymentScopeFingerprint(this.scope) ||
        row.retry_exception === true ||
        readiness.paymentMethod !== 'card' ||
        !['eligible', 'preserve_existing'].includes(readiness.courseAccess) ||
        enrollment.orderKey !== row.order_key ||
        !Number.isSafeInteger(payerPartyId) ||
        payerPartyId <= 0 ||
        !Number.isSafeInteger(participantPartyId) ||
        participantPartyId <= 0 ||
        !['self_purchase_explicit', 'separate_payer'].includes(
          row.payer_relationship,
        )
      )
        throw new Error('notice_canonical_authority_conflict');
      return {
        attemptId,
        orderKey: row.order_key,
        payerPartyId,
        participantPartyId,
        payerRelationship:
          row.payer_relationship as WebsiteCheckoutNoticeAuthority['payerRelationship'],
        payer: {
          name: text(row.payer_name),
          email: normalizedEmail(row.payer_email),
        },
        participant: {
          name: text(row.participant_name),
          email: normalizedEmail(row.participant_email),
        },
        amountMinor,
        currency: CURRENCY,
        accessVerified: row.heartbeat_verified === true,
      };
    });
  }
}

type JobRow = Record<string, unknown>;
function job(row: JobRow): WebsiteCheckoutNoticeJob {
  return {
    id: Number(row.id),
    noticeKey: String(row.notice_key),
    idempotencyKey: String(row.idempotency_key),
    attemptId: String(row.attempt_id),
    kind: row.notice_kind as NoticeKind,
    recipientPartyId: Number(row.recipient_party_id),
    recipientEmailSha256: String(row.recipient_email_sha256),
    contentSha256: String(row.content_sha256),
    senderAccount: String(row.sender_account),
    senderAddress: String(row.sender_address),
    messageIdentity: String(row.message_identity),
    state: row.state as NoticeState,
    uncertainAcceptance: row.uncertain_acceptance === true,
    gmailMessageId:
      row.gmail_message_id === null ? null : String(row.gmail_message_id),
    gmailThreadId:
      row.gmail_thread_id === null ? null : String(row.gmail_thread_id),
    leaseToken: row.lease_token === null ? null : String(row.lease_token),
    leaseExpiresAt:
      row.lease_expires_at === null ? null : String(row.lease_expires_at),
    version: Number(row.version),
  };
}

export class PgWebsiteCheckoutNoticeLedger implements WebsiteCheckoutNoticeLedger {
  constructor(
    private readonly transaction: PaymentTransaction,
    private readonly uuid: () => string = randomUUID,
  ) {}
  private async receipt(
    client: PoolClient,
    row: JobRow,
    stage: string,
    outcome: string,
    code: string,
    digest: string,
    now: string,
  ) {
    await client.query(
      `INSERT INTO business_v2.website_checkout_customer_notice_receipts
      (notice_id,version,stage,outcome,result_code,evidence_sha256,occurred_at)
      VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [row.id, row.version, stage, outcome, code, digest, now],
    );
  }
  async ensure(
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
    now: string,
  ) {
    return this.transaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO business_v2.website_checkout_customer_notice_jobs
        (notice_key,idempotency_key,attempt_id,notice_kind,recipient_party_id,recipient_email_sha256,
         content_sha256,sender_account,sender_address,message_identity,state,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'queued',$11,$11)
        ON CONFLICT(notice_key) DO NOTHING RETURNING *`,
        [
          input.noticeKey,
          input.idempotencyKey,
          input.attemptId,
          input.kind,
          input.recipientPartyId,
          input.recipientEmailSha256,
          input.contentSha256,
          input.senderAccount,
          input.senderAddress,
          input.messageIdentity,
          now,
        ],
      );
      const selected = inserted.rowCount
        ? inserted
        : await client.query(
            'SELECT * FROM business_v2.website_checkout_customer_notice_jobs WHERE notice_key=$1 FOR UPDATE',
            [input.noticeKey],
          );
      if (selected.rowCount !== 1) throw new Error('notice_job_missing');
      const row = selected.rows[0] as JobRow;
      for (const [column, value] of Object.entries({
        idempotency_key: input.idempotencyKey,
        attempt_id: input.attemptId,
        notice_kind: input.kind,
        recipient_party_id: input.recipientPartyId,
        recipient_email_sha256: input.recipientEmailSha256,
        content_sha256: input.contentSha256,
        sender_account: input.senderAccount,
        sender_address: input.senderAddress,
        message_identity: input.messageIdentity,
      })) {
        if (String(row[column]) !== String(value))
          throw new Error('notice_job_identity_conflict');
      }
      if (inserted.rowCount)
        await this.receipt(
          client,
          row,
          'queued',
          'pending',
          'notice_queued',
          evidence(input),
          now,
        );
      return job(row);
    });
  }
  async claim(noticeKey: string, now: string, leaseExpiresAt: string) {
    return this.transaction(async (client) => {
      const current = await client.query(
        'SELECT * FROM business_v2.website_checkout_customer_notice_jobs WHERE notice_key=$1 FOR UPDATE',
        [noticeKey],
      );
      if (current.rowCount !== 1) throw new Error('notice_job_missing');
      const row = current.rows[0] as JobRow;
      if (
        row.state !== 'queued' &&
        !(row.state === 'held' && row.uncertain_acceptance === false)
      )
        return job(row);
      const token = this.uuid();
      const updated = await client.query(
        `UPDATE business_v2.website_checkout_customer_notice_jobs SET state='claimed',lease_token=$2,lease_expires_at=$3,uncertain_acceptance=false,last_error_code=NULL,attempt_count=attempt_count+1,version=version+1,updated_at=$4 WHERE id=$1 AND (state='queued' OR (state='held' AND uncertain_acceptance=false)) RETURNING *`,
        [row.id, token, leaseExpiresAt, now],
      );
      if (updated.rowCount !== 1) throw new Error('notice_claim_conflict');
      await this.receipt(
        client,
        updated.rows[0] as JobRow,
        'claimed',
        'pending',
        'notice_claimed',
        sha(token),
        now,
      );
      return job(updated.rows[0] as JobRow);
    });
  }
  async acknowledge(
    noticeKey: string,
    leaseToken: string,
    messageId: string,
    threadId: string,
    now: string,
  ) {
    return this.transition(
      noticeKey,
      `state='acknowledged',gmail_message_id=$2,gmail_thread_id=$3,lease_token=NULL,lease_expires_at=NULL`,
      [messageId, threadId],
      "state='claimed' AND lease_token=$4",
      [leaseToken],
      'sent_acknowledged',
      'pending',
      'gmail_acknowledged',
      evidence({ messageId, threadId }),
      now,
    );
  }
  async adopt(
    noticeKey: string,
    messageId: string,
    threadId: string,
    now: string,
  ) {
    return this.transition(
      noticeKey,
      `state='acknowledged',gmail_message_id=$2,gmail_thread_id=$3,lease_token=NULL,lease_expires_at=NULL,uncertain_acceptance=false`,
      [messageId, threadId],
      "state<>'confirmed'",
      [],
      'sent_acknowledged',
      'pending',
      'gmail_sent_adopted',
      evidence({ messageId, threadId }),
      now,
    );
  }
  async confirm(
    noticeKey: string,
    messageId: string,
    threadId: string,
    digest: string,
    now: string,
  ) {
    return this.transition(
      noticeKey,
      `state='confirmed',lease_token=NULL,lease_expires_at=NULL,uncertain_acceptance=false,last_error_code=NULL`,
      [],
      "state='acknowledged' AND gmail_message_id=$2 AND gmail_thread_id=$3",
      [messageId, threadId],
      'readback',
      'verified',
      'gmail_readback_verified',
      digest,
      now,
    );
  }
  async hold(
    noticeKey: string,
    code: string,
    uncertain: boolean,
    digest: string,
    now: string,
  ) {
    return this.transition(
      noticeKey,
      `state='held',uncertain_acceptance=$2,lease_token=NULL,lease_expires_at=NULL,last_error_code=$3`,
      [uncertain, code],
      "state<>'confirmed'",
      [],
      'held',
      'held',
      code,
      digest,
      now,
    );
  }
  private async transition(
    noticeKey: string,
    setSql: string,
    setParams: unknown[],
    whereSql: string,
    whereParams: unknown[],
    stage: string,
    outcome: string,
    code: string,
    digest: string,
    now: string,
  ) {
    return this.transaction(async (client) => {
      const current = await client.query(
        'SELECT * FROM business_v2.website_checkout_customer_notice_jobs WHERE notice_key=$1 FOR UPDATE',
        [noticeKey],
      );
      if (current.rowCount !== 1) throw new Error('notice_job_missing');
      if (current.rows[0].state === 'confirmed')
        return job(current.rows[0] as JobRow);
      const params = [current.rows[0].id, ...setParams, ...whereParams, now];
      const nowIndex = params.length;
      const updated = await client.query(
        `UPDATE business_v2.website_checkout_customer_notice_jobs SET ${setSql},version=version+1,updated_at=$${nowIndex} WHERE id=$1 AND ${whereSql} RETURNING *`,
        params,
      );
      if (updated.rowCount !== 1) throw new Error('notice_transition_conflict');
      await this.receipt(
        client,
        updated.rows[0] as JobRow,
        stage,
        outcome,
        code,
        digest,
        now,
      );
      return job(updated.rows[0] as JobRow);
    });
  }
}

type GmailClient = Pick<gmail_v1.Gmail, 'users'>;
export class CanonicalGmailWebsiteCheckoutNoticeSender implements WebsiteCheckoutNoticeGmail {
  constructor(
    private readonly gmail: GmailClient,
    private readonly senderAccount: string,
    private readonly senderAddress: string,
    private readonly sendFn: typeof sendEmail = sendEmail,
    private readonly writeGuard: typeof assertExternalWriteAllowed = assertExternalWriteAllowed,
  ) {
    if (
      normalizedEmail(senderAccount) !== senderAccount.toLowerCase() ||
      headerEmail(senderAddress) !== normalizedEmail(senderAccount)
    )
      throw new Error('notice_gmail_config_invalid');
  }
  async verifyAccount() {
    const profile = await this.gmail.users.getProfile({ userId: 'me' });
    if (
      normalizedEmail(profile.data.emailAddress) !==
      this.senderAccount.toLowerCase()
    )
      throw new Error('notice_gmail_account_mismatch');
  }
  private async exact(
    messageId: string,
    threadId: string,
    to: string,
    subject: string,
  ) {
    const value = await this.gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'metadata',
      metadataHeaders: ['To', 'From', 'Subject'],
    });
    const headers = value.data.payload?.headers ?? [];
    if (
      value.data.id !== messageId ||
      value.data.threadId !== threadId ||
      normalizedEmail(header(headers, 'to')) !== normalizedEmail(to) ||
      headerEmail(header(headers, 'from')) !==
        headerEmail(this.senderAddress) ||
      header(headers, 'subject') !== subject
    )
      throw new Error('notice_gmail_readback_mismatch');
    return { messageId, threadId };
  }
  async findExact(input: { to: string; subject: string }) {
    const q = `in:sent to:${normalizedEmail(input.to)} subject:"${input.subject.replace(/["\\]/g, '')}"`;
    const found = await this.gmail.users.messages.list({
      userId: 'me',
      q,
      maxResults: 2,
      includeSpamTrash: false,
    });
    const rows = found.data.messages ?? [];
    if (rows.length > 1) throw new Error('notice_gmail_sent_match_ambiguous');
    if (rows.length === 0) return null;
    const id = rows[0]?.id ?? '',
      threadId = rows[0]?.threadId ?? '';
    if (!id || !threadId) throw new Error('notice_gmail_sent_match_invalid');
    return this.exact(id, threadId, input.to, input.subject);
  }
  async send(input: { to: string; subject: string; body: string }) {
    this.writeGuard({
      system: 'gmail',
      actionClass: 'c3_external_communication',
      source: 'host:website-checkout-customer-notice',
    });
    return this.sendFn(
      { to: input.to, subject: input.subject, body: input.body },
      { getClient: () => this.gmail as gmail_v1.Gmail },
    );
  }
  async readback(input: {
    messageId: string;
    threadId: string;
    to: string;
    subject: string;
  }) {
    return this.exact(input.messageId, input.threadId, input.to, input.subject);
  }
}

interface NoticeSpec {
  kind: NoticeKind;
  recipientPartyId: number;
  recipient: { name: string; email: string };
  subject: string;
  body: string;
  messageIdentity: string;
}
function specs(
  authority: WebsiteCheckoutNoticeAuthority,
  config: WebsiteCheckoutCustomerNoticeConfig,
): NoticeSpec[] {
  const amount = money(authority.amountMinor);
  const ref = (kind: string) =>
    `mcs-foundations:${authority.attemptId}:${kind}:v1`;
  if (authority.payerRelationship === 'self_purchase_explicit') {
    if (
      authority.payerPartyId !== authority.participantPartyId ||
      authority.payer.email !== authority.participant.email
    )
      throw new Error('notice_relationship_conflict');
    if (!authority.accessVerified) return [];
    const messageIdentity = ref('self');
    return [
      {
        kind: 'self_confirmation',
        recipientPartyId: authority.payerPartyId,
        recipient: authority.payer,
        subject: `Your ${PRODUCT} enrollment — ${authority.attemptId}`,
        messageIdentity,
        body: [
          `Hi ${authority.payer.name},`,
          '',
          `Your card payment of ${amount} for ${PRODUCT} was accepted, and your course access is confirmed.`,
          `Open the course: ${config.courseUrl}`,
          '',
          'This confirms this enrollment only. It is not a course-completion certificate.',
          `Notice reference: ${messageIdentity}`,
        ].join('\n'),
      },
    ];
  }
  if (
    authority.payerRelationship !== 'separate_payer' ||
    authority.payerPartyId === authority.participantPartyId
  )
    throw new Error('notice_relationship_conflict');
  const payerIdentity = ref('payer');
  const result: NoticeSpec[] = [
    {
      kind: 'gift_payer_receipt',
      recipientPartyId: authority.payerPartyId,
      recipient: authority.payer,
      subject: `Your ${PRODUCT} payment receipt — ${authority.attemptId}`,
      messageIdentity: payerIdentity,
      body: [
        `Hi ${authority.payer.name},`,
        '',
        `Your card payment of ${amount} for ${PRODUCT} was accepted. The learner's access is handled separately.`,
        '',
        'This receipt confirms this purchase only. It does not confirm course completion or certification.',
        `Notice reference: ${payerIdentity}`,
      ].join('\n'),
    },
  ];
  if (authority.accessVerified) {
    const learnerIdentity = ref('learner');
    result.push({
      kind: 'gift_learner_access',
      recipientPartyId: authority.participantPartyId,
      recipient: authority.participant,
      subject: `Your ${PRODUCT} access — ${authority.attemptId}`,
      messageIdentity: learnerIdentity,
      body: [
        `Hi ${authority.participant.name},`,
        '',
        `You have been enrolled in ${PRODUCT}, and your course access is confirmed.`,
        `Open the course: ${config.courseUrl}`,
        '',
        'If this is your first visit, Heartbeat may send its own sign-in invitation separately. This message does not replace that invitation.',
        'This does not confirm course completion or certification.',
        `Notice reference: ${learnerIdentity}`,
      ].join('\n'),
    });
  }
  return result;
}

export class WebsiteCheckoutCustomerNoticeOwner implements WebsiteCheckoutReceiptWelcomeOwner {
  constructor(
    private readonly config: WebsiteCheckoutCustomerNoticeConfig,
    private readonly authority: WebsiteCheckoutNoticeAuthorityReader,
    private readonly ledger: WebsiteCheckoutNoticeLedger,
    private readonly gmail: WebsiteCheckoutNoticeGmail,
    private readonly now: () => Date = () => new Date(),
  ) {
    if (
      !config.enabled ||
      config.caller !== 'tandem-wordpress-live' ||
      config.offerLocale !== `${OFFER}:${LOCALE}` ||
      config.productName !== PRODUCT ||
      !/^https:\/\//.test(config.courseUrl) ||
      normalizedEmail(config.senderAccount) !==
        config.senderAccount.toLowerCase() ||
      headerEmail(config.senderAddress) !== config.senderAccount ||
      !config.decisionReference ||
      !/^[a-f0-9]{64}$/.test(config.activationReceiptSha256) ||
      config.scope.provider !== 'adyen' ||
      config.scope.environment !== 'live' ||
      config.scope.store === null ||
      !config.cardCaptureConfigurationEvidence
    )
      throw new Error('notice_owner_config_invalid');
  }
  async reconcile(input: {
    attemptId: string;
    idempotencyKey: string;
    enrollment: WebsiteCheckoutEnrollmentResult;
  }) {
    if (
      input.idempotencyKey !==
        `website_checkout_receipt_welcome:${input.attemptId}` ||
      input.enrollment.canonicalEnrollment !== 'materialized' ||
      !['accepted', 'duplicate'].includes(input.enrollment.disposition) ||
      input.enrollment.currentPaymentState !== 'eligible'
    )
      return { state: 'held' as const, receiptReference: null };
    let authority: WebsiteCheckoutNoticeAuthority;
    try {
      authority = await this.authority.read(input.attemptId, input.enrollment);
    } catch {
      return { state: 'held' as const, receiptReference: null };
    }
    const required =
      authority.payerRelationship === 'self_purchase_explicit' ? 1 : 2;
    let notices: NoticeSpec[];
    try {
      notices = specs(authority, this.config);
    } catch {
      return { state: 'held' as const, receiptReference: null };
    }
    if (
      notices.length < required &&
      authority.payerRelationship === 'self_purchase_explicit'
    )
      return { state: 'queued' as const, receiptReference: null };
    const states = [] as WebsiteCheckoutNoticeJob[];
    for (const planned of notices) {
      let current: WebsiteCheckoutNoticeAuthority;
      try {
        current = await this.authority.read(input.attemptId, input.enrollment);
      } catch {
        return { state: 'held' as const, receiptReference: null };
      }
      const spec = specs(current, this.config).find(
        (candidate) => candidate.kind === planned.kind,
      );
      if (!spec) return { state: 'held' as const, receiptReference: null };
      try {
        states.push(
          await this.reconcileOne(input.idempotencyKey, spec, current),
        );
      } catch {
        return { state: 'held' as const, receiptReference: null };
      }
    }
    if (
      authority.payerRelationship === 'separate_payer' &&
      notices.length < required
    )
      return {
        state: states.some((v) => v.state === 'held')
          ? ('held' as const)
          : ('queued' as const),
        // Only the complete required notice set receives a service receipt.
        // Partial payer delivery remains visible in the durable notice ledger.
        receiptReference: null,
      };
    if (states.some((v) => v.state === 'held'))
      return { state: 'held' as const, receiptReference: null };
    if (states.every((v) => v.state === 'confirmed'))
      return {
        state: 'verified' as const,
        receiptReference: `website-checkout-notices:v1:${input.attemptId}`,
      };
    return { state: 'queued' as const, receiptReference: null };
  }
  private async reconcileOne(
    rootKey: string,
    spec: NoticeSpec,
    authority: WebsiteCheckoutNoticeAuthority,
  ) {
    const now = instant(this.now().toISOString());
    const contentSha256 = evidence({
      to: spec.recipient.email,
      subject: spec.subject,
      body: spec.body,
      sender: this.config.senderAddress,
      messageIdentity: spec.messageIdentity,
    });
    let row = await this.ledger.ensure(
      {
        noticeKey: `website_checkout_notice:${authority.attemptId}:${spec.kind}:v1`,
        idempotencyKey: `${rootKey}:${spec.kind}:v1`,
        attemptId: authority.attemptId,
        kind: spec.kind,
        recipientPartyId: spec.recipientPartyId,
        recipientEmailSha256: sha(spec.recipient.email),
        contentSha256,
        senderAccount: this.config.senderAccount,
        senderAddress: this.config.senderAddress,
        messageIdentity: spec.messageIdentity,
      },
      now,
    );
    if (row.state === 'confirmed') return row;
    try {
      await this.gmail.verifyAccount();
    } catch {
      return this.ledger.hold(
        row.noticeKey,
        'gmail_account_mismatch',
        false,
        evidence({ state: 'account_check_failed' }),
        now,
      );
    }
    if (
      row.state === 'claimed' &&
      row.leaseExpiresAt &&
      Date.parse(row.leaseExpiresAt) > Date.parse(now)
    )
      return row;
    if (
      (row.state === 'acknowledged' || row.state === 'held') &&
      row.gmailMessageId &&
      row.gmailThreadId
    ) {
      try {
        const read = await this.gmail.readback({
          messageId: row.gmailMessageId,
          threadId: row.gmailThreadId,
          to: spec.recipient.email,
          subject: spec.subject,
        });
        row = await this.ledger.adopt(
          row.noticeKey,
          read.messageId,
          read.threadId,
          now,
        );
        return this.ledger.confirm(
          row.noticeKey,
          read.messageId,
          read.threadId,
          evidence(read),
          now,
        );
      } catch {
        if (row.state === 'acknowledged') return row;
      }
    }
    try {
      const existing = await this.gmail.findExact({
        to: spec.recipient.email,
        subject: spec.subject,
      });
      if (existing) {
        row = await this.ledger.adopt(
          row.noticeKey,
          existing.messageId,
          existing.threadId,
          now,
        );
        const read = await this.gmail.readback({
          ...existing,
          to: spec.recipient.email,
          subject: spec.subject,
        });
        return this.ledger.confirm(
          row.noticeKey,
          read.messageId,
          read.threadId,
          evidence(read),
          now,
        );
      }
    } catch (error) {
      if (error instanceof Error && /ambiguous|mismatch/.test(error.message))
        return this.ledger.hold(
          row.noticeKey,
          'gmail_reconciliation_conflict',
          true,
          evidence({ state: 'sent_match_conflict' }),
          now,
        );
      if (row.state === 'claimed' || row.state === 'held')
        return this.ledger.hold(
          row.noticeKey,
          'gmail_reconciliation_unavailable',
          true,
          evidence({ state: 'prior_attempt_reconciliation_held' }),
          now,
        );
      return row;
    }
    if (row.state === 'held' && row.uncertainAcceptance) return row;
    if (row.state === 'claimed')
      return this.ledger.hold(
        row.noticeKey,
        'gmail_prior_attempt_unresolved',
        true,
        evidence({ state: row.state }),
        now,
      );
    row = await this.ledger.claim(
      row.noticeKey,
      now,
      new Date(this.now().getTime() + 30000).toISOString(),
    );
    if (row.state !== 'claimed' || !row.leaseToken) return row;
    let sent: { messageId: string; threadId: string };
    try {
      sent = await this.gmail.send({
        to: spec.recipient.email,
        subject: spec.subject,
        body: spec.body,
      });
      if (!sent.messageId || !sent.threadId)
        throw new Error('gmail_ack_missing');
    } catch {
      return this.ledger.hold(
        row.noticeKey,
        'gmail_acceptance_unknown',
        true,
        evidence({ state: 'send_error' }),
        now,
      );
    }
    try {
      row = await this.ledger.acknowledge(
        row.noticeKey,
        row.leaseToken,
        sent.messageId,
        sent.threadId,
        now,
      );
      const read = await this.gmail.readback({
        ...sent,
        to: spec.recipient.email,
        subject: spec.subject,
      });
      return this.ledger.confirm(
        row.noticeKey,
        read.messageId,
        read.threadId,
        evidence(read),
        now,
      );
    } catch {
      return this.ledger.hold(
        row.noticeKey,
        'gmail_readback_unavailable',
        true,
        evidence(sent),
        now,
      );
    }
  }
}

export function createGmailWebsiteCheckoutReceiptWelcomeOwner(
  config: WebsiteCheckoutCustomerNoticeConfig,
  deps: {
    transaction: PaymentTransaction;
    gmail?: gmail_v1.Gmail;
    now?: () => Date;
    uuid?: () => string;
    sendEmail?: typeof sendEmail;
    assertExternalWriteAllowed?: typeof assertExternalWriteAllowed;
  },
): WebsiteCheckoutReceiptWelcomeOwner {
  const gmail = deps.gmail ?? getGmailClient();
  if (config.senderAddress !== GMAIL_SEND_AS)
    throw new Error('notice_sender_configuration_mismatch');
  return new WebsiteCheckoutCustomerNoticeOwner(
    config,
    new PgWebsiteCheckoutNoticeAuthorityReader(
      deps.transaction,
      config.caller,
      config.scope,
      config.cardCaptureConfigurationEvidence,
    ),
    new PgWebsiteCheckoutNoticeLedger(deps.transaction, deps.uuid),
    new CanonicalGmailWebsiteCheckoutNoticeSender(
      gmail,
      config.senderAccount,
      config.senderAddress,
      deps.sendEmail,
      deps.assertExternalWriteAllowed,
    ),
    deps.now,
  );
}
