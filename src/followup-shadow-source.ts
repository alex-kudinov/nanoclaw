/**
 * Host-only read adapters for the Company OS follow-up shadow.
 *
 * All returned observations are content-free. Customer names, addresses,
 * subjects, bodies, and arbitrary Plutio payloads remain transient in their
 * source systems and are never returned by this adapter.
 */

import path from 'node:path';

import Database from 'better-sqlite3';
import type { QueryResult, QueryResultRow } from 'pg';

import { query } from './business-db.js';
import { STORE_DIR } from './config.js';
import {
  makeFollowupShadowObservation,
  type ExistingFollowupShadowCase,
  type FollowupShadowObservation,
  type FollowupShadowSourceError,
} from './followup-shadow.js';
import type {
  ProposalSignatureCase,
  ReceivableCase,
  SalesConversationCase,
} from './followup-policy.js';
import {
  isInvoicePaymentReconciled,
  listInvoiceSnapshots,
  type InvoiceSnapshot,
} from './plutio-invoices.js';
import {
  listProposalSnapshots,
  resolveProposalUrl,
  resolveRecipients,
  type ProposalSnapshot,
  type Recipient,
  type RecipientMap,
} from './plutio-proposals.js';
import {
  listInvoicePaymentEvidence,
  type InvoicePaymentEvidence,
} from './plutio-transactions.js';

export interface FollowupShadowQueryPort {
  <T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
}

interface SalesSourceRow extends QueryResultRow {
  pipeline_entry_id: string;
  party_id: string;
  stage: string;
  active_entry_count: number;
  thread_id: string | null;
  thread_pipeline_entry_id: string | null;
  last_outbound_at: string | null;
  last_inbound_at: string | null;
  confirmed_attempts: number;
  last_confirmed_attempt_at: string | null;
  suppressed: boolean;
  operator_decision: 'none' | 'declined';
}

interface ProposalLedgerRow extends QueryResultRow {
  confirmed_attempts: number;
  last_confirmed_attempt_at: string | null;
  last_presentation_at: string | null;
  pending_action: boolean;
  uncertain_delivery: boolean;
  suppressed: boolean;
  public_link_verified: boolean;
}

interface PartyFactRow extends QueryResultRow {
  party_id: string;
  suppressed: boolean;
}

interface ExistingCaseRow extends QueryResultRow {
  lane: ExistingFollowupShadowCase['lane'];
  source_system: string;
  source_key: string;
  source_fingerprint: string;
  decision_fingerprint: string;
  disposition: ExistingFollowupShadowCase['disposition'];
  reason_code: string;
  version: number;
}

interface ActionEvidence {
  sales: Map<string, { pending: boolean; uncertain: boolean }>;
  proposals: Map<string, { pending: boolean; uncertain: boolean }>;
}

export interface FollowupShadowSourceResult {
  observations: FollowupShadowObservation[];
  existing: ExistingFollowupShadowCase[];
  sourceErrors: FollowupShadowSourceError[];
}

export interface FollowupShadowSourceDependencies {
  query: FollowupShadowQueryPort;
  listProposals: () => Promise<ProposalSnapshot[]>;
  listInvoices: () => Promise<InvoiceSnapshot[]>;
  listInvoicePayments: (
    invoiceIds: string[],
  ) => Promise<Map<string, InvoicePaymentEvidence>>;
  resolveRecipients: (clientIds: string[]) => Promise<RecipientMap>;
  readActions: () => ActionEvidence;
}

export const SALES_SHADOW_SQL = `
WITH relevant_entries AS (
  SELECT pe.id, pe.party_id, pe.stage
    FROM business_v2.pipeline_entries pe
   WHERE (
          pe.stage IN ('new','qualifying','proposal','negotiating','paused','nurture')
          AND EXISTS (
            SELECT 1
              FROM business_v2.interactions outbound
             WHERE outbound.party_id = pe.party_id
               AND outbound.channel = 'email'
               AND outbound.direction = 'outbound'
          )
         )
      OR EXISTS (
           SELECT 1
             FROM business_v2.company_followup_cases c
            WHERE c.lane = 'sales_conversation'
              AND c.pipeline_entry_id = pe.id
         )
), active_counts AS (
  SELECT party_id, count(*)::int AS active_entry_count
    FROM business_v2.pipeline_entries
   WHERE stage IN ('new','qualifying','proposal','negotiating')
   GROUP BY party_id
), interaction_rollup AS (
  SELECT i.party_id,
         max(i.occurred_at) FILTER (
           WHERE i.channel = 'email' AND i.direction = 'outbound'
         ) AS last_outbound_at,
         max(i.occurred_at) FILTER (
           WHERE i.direction = 'inbound'
             AND i.channel IN ('email','form-submission')
         ) AS last_inbound_at,
         count(*) FILTER (
           WHERE i.channel = 'email' AND i.direction = 'outbound'
             AND i.metadata->>'follow_up' = 'true'
         )::int AS confirmed_attempts,
         max(i.occurred_at) FILTER (
           WHERE i.channel = 'email' AND i.direction = 'outbound'
             AND i.metadata->>'follow_up' = 'true'
         ) AS last_confirmed_attempt_at
    FROM business_v2.interactions i
   GROUP BY i.party_id
), last_thread AS (
  SELECT DISTINCT ON (i.party_id)
         i.party_id, nullif(i.metadata->>'thread_id', '') AS thread_id
         , nullif(i.metadata->>'pipeline_entry_id', '') AS thread_pipeline_entry_id
    FROM business_v2.interactions i
   WHERE i.channel = 'email' AND i.direction = 'outbound'
   ORDER BY i.party_id, i.occurred_at DESC, i.id DESC
), operator_decisions AS (
  SELECT DISTINCT ON (c.pipeline_entry_id)
         c.pipeline_entry_id,
         e.operator_decision
    FROM business_v2.company_followup_cases c
    JOIN business_v2.company_followup_events e ON e.case_id = c.id
   WHERE c.lane = 'sales_conversation'
     AND e.event_type = 'operator_decision'
   ORDER BY c.pipeline_entry_id, e.occurred_at DESC, e.id DESC
)
SELECT re.id::text AS pipeline_entry_id,
       re.party_id::text AS party_id,
       re.stage,
       coalesce(ac.active_entry_count, 0)::int AS active_entry_count,
       lt.thread_id,
       lt.thread_pipeline_entry_id,
       ir.last_outbound_at::text,
       ir.last_inbound_at::text,
       coalesce(ir.confirmed_attempts, 0)::int AS confirmed_attempts,
       ir.last_confirmed_attempt_at::text,
       (p.dnd_at IS NOT NULL OR p.no_followup_at IS NOT NULL) AS suppressed,
       coalesce(od.operator_decision, 'none') AS operator_decision
  FROM relevant_entries re
  JOIN business_v2.parties p ON p.id = re.party_id AND p.merged_into IS NULL
  LEFT JOIN active_counts ac ON ac.party_id = re.party_id
  LEFT JOIN interaction_rollup ir ON ir.party_id = re.party_id
  LEFT JOIN last_thread lt ON lt.party_id = re.party_id
  LEFT JOIN operator_decisions od ON od.pipeline_entry_id = re.id
 ORDER BY re.id
 LIMIT 1000
`;

function mergeAction(
  target: Map<string, { pending: boolean; uncertain: boolean }>,
  key: string,
  state: string,
): void {
  const current = target.get(key) ?? { pending: false, uncertain: false };
  if (state === 'uncertain') current.uncertain = true;
  else if (
    [
      'approved',
      'handoff_routed',
      'mailman_started',
      'executing',
      'attention_required',
    ].includes(state)
  ) {
    current.pending = true;
  }
  target.set(key, current);
}

export function readFollowupActionEvidence(
  sqlitePath = path.join(STORE_DIR, 'messages.db'),
): ActionEvidence {
  const database = new Database(sqlitePath, {
    readonly: true,
    fileMustExist: true,
  });
  database.pragma('query_only = ON');
  try {
    if (database.pragma('quick_check', { simple: true }) !== 'ok') {
      throw new Error('followup-shadow: SQLite quick-check failed');
    }
    const rows = database
      .prepare(
        `SELECT lead_ref, state
           FROM pending_sends
          WHERE group_folder = 'sales'
            AND lead_ref IS NOT NULL
            AND state <> 'confirmed'`,
      )
      .all() as Array<{ lead_ref: string; state: string }>;
    const evidence: ActionEvidence = {
      sales: new Map(),
      proposals: new Map(),
    };
    for (const row of rows) {
      const sales = /^Lead\s*#\s*([1-9][0-9]*)$/i.exec(row.lead_ref);
      if (sales) {
        mergeAction(evidence.sales, sales[1], row.state);
        continue;
      }
      const proposal = /^Proposal\s+(\S+)\s+follow-up\s+#\d+$/i.exec(
        row.lead_ref,
      );
      if (proposal) mergeAction(evidence.proposals, proposal[1], row.state);
    }
    return evidence;
  } finally {
    database.close();
  }
}

function mapSales(
  row: SalesSourceRow,
  observedAt: string,
  action: { pending: boolean; uncertain: boolean } | undefined,
  proposalSourceComplete: boolean,
  openProposalParties: Set<string>,
): SalesConversationCase {
  const activeStage = ['new', 'qualifying', 'proposal', 'negotiating'].includes(
    row.stage,
  );
  return {
    lane: 'sales_conversation',
    sourceKey: `pipeline-entry:${row.pipeline_entry_id}`,
    observedAt,
    sourceEvidenceComplete: proposalSourceComplete,
    sourceIdentityConflict: activeStage && row.active_entry_count !== 1,
    pendingAction: action?.pending ?? false,
    uncertainDelivery: action?.uncertain ?? false,
    suppressed: row.suppressed,
    partyId: row.party_id,
    pipelineEntryId: row.pipeline_entry_id,
    pipelineStage: row.stage,
    threadId: row.thread_id,
    threadBindingVerified:
      row.thread_pipeline_entry_id === row.pipeline_entry_id,
    lastOutboundAt: row.last_outbound_at,
    lastInboundAt: row.last_inbound_at,
    confirmedAttempts: row.confirmed_attempts,
    lastConfirmedAttemptAt: row.last_confirmed_attempt_at,
    hasOpenProposal: openProposalParties.has(row.party_id),
    operatorDecision: row.operator_decision,
  };
}

async function resolvePartyFacts(
  deps: FollowupShadowSourceDependencies,
  clientId: string | null,
  recipient: Recipient | null,
): Promise<{
  partyId: string | null;
  suppressed: boolean;
  identityConflict: boolean;
}> {
  const candidates = new Set<string>();
  if (clientId) {
    const ref = await deps.query<PartyFactRow>(
      `SELECT p.id::text AS party_id,
              (p.dnd_at IS NOT NULL OR p.no_followup_at IS NOT NULL) AS suppressed
         FROM business_v2.plutio_refs r
         JOIN business_v2.parties p ON p.id = r.entity_id
        WHERE r.entity_type = 'party'
          AND r.plutio_entity_type = 'party'
          AND r.plutio_id = $1
          AND p.merged_into IS NULL`,
      [clientId],
    );
    for (const row of ref.rows) candidates.add(row.party_id);
  }
  if (recipient?.email) {
    const byEmail = await deps.query<PartyFactRow>(
      `SELECT p.id::text AS party_id,
              (p.dnd_at IS NOT NULL OR p.no_followup_at IS NOT NULL) AS suppressed
         FROM business_v2.parties p
        WHERE p.id = business_v2.best_party_by_email($1::citext)
          AND p.merged_into IS NULL`,
      [recipient.email],
    );
    for (const row of byEmail.rows) candidates.add(row.party_id);
  }
  const partyId = candidates.size === 1 ? [...candidates][0] : null;
  if (!partyId) {
    return {
      partyId: null,
      suppressed: false,
      identityConflict: candidates.size > 1,
    };
  }
  const facts = await deps.query<PartyFactRow>(
    `SELECT id::text AS party_id,
            (dnd_at IS NOT NULL OR no_followup_at IS NOT NULL) AS suppressed
       FROM business_v2.parties
      WHERE id = $1`,
    [partyId],
  );
  return {
    partyId,
    suppressed: facts.rows[0]?.suppressed ?? false,
    identityConflict: false,
  };
}

async function proposalLedger(
  deps: FollowupShadowSourceDependencies,
  proposal: ProposalSnapshot,
): Promise<ProposalLedgerRow> {
  const result = await deps.query<ProposalLedgerRow>(
    `SELECT
       count(*) FILTER (WHERE status = 'sent')::int AS confirmed_attempts,
       (max(sent_at) FILTER (WHERE status = 'sent'))::text
         AS last_confirmed_attempt_at,
       (max(created_at) FILTER (
         WHERE status IN ('pending_approval','expired')
       ))::text AS last_presentation_at,
       bool_or(status = 'pending_approval') AS pending_action,
       bool_or(status = 'sent' AND gmail_message_id IS NULL) AS uncertain_delivery,
       bool_or(status = 'cancelled') AS suppressed,
       bool_or(status = 'sent' AND gmail_message_id IS NOT NULL AND proposal_url = $2)
         AS public_link_verified
     FROM business_v2.proposal_followups
    WHERE proposal_plutio_id = $1`,
    [proposal.id, resolveProposalUrl(proposal.id)],
  );
  return (
    result.rows[0] ?? {
      confirmed_attempts: 0,
      last_confirmed_attempt_at: null,
      last_presentation_at: null,
      pending_action: false,
      uncertain_delivery: false,
      suppressed: false,
      public_link_verified: false,
    }
  );
}

async function mapProposal(
  deps: FollowupShadowSourceDependencies,
  proposal: ProposalSnapshot,
  observedAt: string,
  action: { pending: boolean; uncertain: boolean } | undefined,
  businessSourceComplete: boolean,
  recipient: Recipient | null,
  recipientSourceComplete: boolean,
): Promise<{ case: ProposalSignatureCase; partyId: string | null }> {
  const party = await resolvePartyFacts(deps, proposal.clientId, recipient);
  const ledger = await proposalLedger(deps, proposal);
  const input: ProposalSignatureCase = {
    lane: 'proposal_signature',
    sourceKey: `plutio-proposal:${proposal.id}`,
    observedAt,
    sourceEvidenceComplete: businessSourceComplete && recipientSourceComplete,
    sourceIdentityConflict: party.identityConflict,
    pendingAction: ledger.pending_action || (action?.pending ?? false),
    uncertainDelivery:
      ledger.uncertain_delivery || (action?.uncertain ?? false),
    suppressed: party.suppressed || ledger.suppressed,
    partyId: party.partyId,
    proposalStatus: proposal.status,
    pendingAt: proposal.pendingAt,
    approvedAt: proposal.approvedAt,
    autoInvoiceId: proposal.autoInvoiceId,
    projectId: proposal.projectId,
    recipientResolved: Boolean(recipient && party.partyId),
    // The current business schema has no assigned relationship-owner field.
    ownerResolved: false,
    publicLinkVerified: ledger.public_link_verified,
    confirmedAttempts: ledger.confirmed_attempts,
    lastConfirmedAttemptAt: ledger.last_confirmed_attempt_at,
    lastPresentationAt: ledger.last_presentation_at,
  };
  return { case: input, partyId: party.partyId };
}

async function mapInvoice(
  deps: FollowupShadowSourceDependencies,
  invoice: InvoiceSnapshot,
  payment: InvoicePaymentEvidence | undefined,
  observedAt: string,
  businessSourceComplete: boolean,
  recipient: Recipient | null,
  recipientSourceComplete: boolean,
): Promise<ReceivableCase> {
  const party = await resolvePartyFacts(deps, invoice.clientId, recipient);
  return {
    lane: 'receivable',
    sourceKey: `plutio-invoice:${invoice.id}`,
    observedAt,
    sourceEvidenceComplete: businessSourceComplete && recipientSourceComplete,
    sourceIdentityConflict: party.identityConflict,
    pendingAction: false,
    uncertainDelivery: false,
    suppressed: party.suppressed,
    partyId: party.partyId,
    invoiceStatus: invoice.status,
    dueAt: invoice.dueAt,
    outstandingAmount: invoice.outstandingAmount,
    currency: invoice.currency,
    paymentReconciled: isInvoicePaymentReconciled(invoice, payment),
    collectionApproved: false,
    specialHandling: false,
    recipientResolved: Boolean(recipient && party.partyId),
    ownerResolved: false,
    confirmedAttempts: 0,
    lastConfirmedAttemptAt: null,
  };
}

async function readExisting(
  deps: FollowupShadowSourceDependencies,
): Promise<ExistingFollowupShadowCase[]> {
  const result = await deps.query<ExistingCaseRow>(
    `SELECT lane, source_system, source_key, source_fingerprint,
            decision_fingerprint, disposition, reason_code, version
       FROM business_v2.company_followup_cases
      ORDER BY lane, source_system, source_key`,
  );
  return result.rows.map((row) => ({
    lane: row.lane,
    sourceSystem: row.source_system,
    sourceKey: row.source_key,
    sourceFingerprint: row.source_fingerprint,
    decisionFingerprint: row.decision_fingerprint,
    disposition: row.disposition,
    reasonCode: row.reason_code,
    version: row.version,
  }));
}

export const followupShadowSourceDependencies: FollowupShadowSourceDependencies =
  {
    query,
    listProposals: listProposalSnapshots,
    listInvoices: listInvoiceSnapshots,
    listInvoicePayments: listInvoicePaymentEvidence,
    resolveRecipients,
    readActions: readFollowupActionEvidence,
  };

/**
 * Read all three lanes. A failed required source never turns into permission:
 * affected cases carry sourceEvidenceComplete=false and evaluate as blocked.
 */
export async function readFollowupShadowSources(
  observedAt: string,
  deps: FollowupShadowSourceDependencies = followupShadowSourceDependencies,
): Promise<FollowupShadowSourceResult> {
  const sourceErrors: FollowupShadowSourceError[] = [];
  const pushError = (error: FollowupShadowSourceError): void => {
    if (
      !sourceErrors.some(
        (item) => item.source === error.source && item.code === error.code,
      )
    ) {
      sourceErrors.push(error);
    }
  };
  let actions: ActionEvidence = { sales: new Map(), proposals: new Map() };
  let actionsComplete = true;
  try {
    actions = deps.readActions();
  } catch {
    actionsComplete = false;
    pushError({ source: 'sqlite_actions', code: 'read_failed' });
  }

  const [salesRead, proposalsRead, invoicesRead, existingRead] =
    await Promise.allSettled([
      deps.query<SalesSourceRow>(SALES_SHADOW_SQL),
      deps.listProposals(),
      deps.listInvoices(),
      readExisting(deps),
    ]);
  const businessComplete =
    salesRead.status === 'fulfilled' && existingRead.status === 'fulfilled';
  const proposalComplete = proposalsRead.status === 'fulfilled';
  const invoiceComplete = invoicesRead.status === 'fulfilled';
  if (!businessComplete) {
    pushError({ source: 'business_v2', code: 'read_failed' });
  }
  if (!proposalComplete) {
    pushError({ source: 'plutio_proposals', code: 'read_failed' });
  }
  if (!invoiceComplete) {
    pushError({ source: 'plutio_invoices', code: 'read_failed' });
  }

  let invoicePayments = new Map<string, InvoicePaymentEvidence>();
  let invoicePaymentsComplete = invoiceComplete;
  if (invoicesRead.status === 'fulfilled' && invoicesRead.value.length > 0) {
    try {
      invoicePayments = await deps.listInvoicePayments(
        invoicesRead.value.map((invoice) => invoice.id),
      );
    } catch {
      invoicePaymentsComplete = false;
      pushError({ source: 'plutio_transactions', code: 'read_failed' });
    }
  }

  const proposalClientIds =
    proposalsRead.status === 'fulfilled'
      ? proposalsRead.value
          .map((proposal) => proposal.clientId)
          .filter((id): id is string => Boolean(id))
      : [];
  const invoiceClientIds =
    invoicesRead.status === 'fulfilled'
      ? invoicesRead.value
          .map((invoice) => invoice.clientId)
          .filter((id): id is string => Boolean(id))
      : [];
  let recipients: RecipientMap = new Map();
  let recipientSourceComplete = true;
  if (proposalClientIds.length > 0 || invoiceClientIds.length > 0) {
    try {
      recipients = await deps.resolveRecipients([
        ...proposalClientIds,
        ...invoiceClientIds,
      ]);
    } catch {
      recipientSourceComplete = false;
      if (proposalClientIds.length > 0) {
        pushError({
          source: 'plutio_proposals',
          code: 'recipient_read_failed',
        });
      }
      if (invoiceClientIds.length > 0) {
        pushError({
          source: 'plutio_invoices',
          code: 'recipient_read_failed',
        });
      }
    }
  }

  const proposalCases: Array<{
    case: ProposalSignatureCase;
    partyId: string | null;
  }> = [];
  if (proposalsRead.status === 'fulfilled') {
    for (const proposal of proposalsRead.value) {
      try {
        const mapped = await mapProposal(
          deps,
          proposal,
          observedAt,
          actions.proposals.get(proposal.id),
          businessComplete && actionsComplete,
          proposal.clientId
            ? (recipients.get(proposal.clientId) ?? null)
            : null,
          recipientSourceComplete,
        );
        proposalCases.push(mapped);
      } catch {
        pushError({ source: 'business_v2', code: 'identity_read_failed' });
        proposalCases.push({
          partyId: null,
          case: {
            lane: 'proposal_signature',
            sourceKey: `plutio-proposal:${proposal.id}`,
            observedAt,
            sourceEvidenceComplete: false,
            sourceIdentityConflict: false,
            pendingAction: false,
            uncertainDelivery: false,
            suppressed: false,
            partyId: null,
            proposalStatus: proposal.status,
            pendingAt: proposal.pendingAt,
            approvedAt: proposal.approvedAt,
            autoInvoiceId: proposal.autoInvoiceId,
            projectId: proposal.projectId,
            recipientResolved: false,
            ownerResolved: false,
            publicLinkVerified: false,
            confirmedAttempts: 0,
            lastConfirmedAttemptAt: null,
            lastPresentationAt: null,
          },
        });
      }
    }
  }
  const openProposalParties = new Set(
    proposalCases
      .filter(
        ({ case: item }) =>
          item.proposalStatus === 'pending' &&
          !item.approvedAt &&
          !item.autoInvoiceId &&
          !item.projectId,
      )
      .map((item) => item.partyId)
      .filter((partyId): partyId is string => partyId !== null),
  );

  const observations: FollowupShadowObservation[] = [];
  if (salesRead.status === 'fulfilled') {
    for (const row of salesRead.value.rows) {
      observations.push(
        makeFollowupShadowObservation(
          'business-v2',
          mapSales(
            row,
            observedAt,
            actions.sales.get(row.pipeline_entry_id),
            businessComplete && proposalComplete && actionsComplete,
            openProposalParties,
          ),
        ),
      );
    }
  }
  for (const proposal of proposalCases) {
    observations.push(makeFollowupShadowObservation('plutio', proposal.case));
  }
  if (invoicesRead.status === 'fulfilled') {
    for (const invoice of invoicesRead.value) {
      try {
        observations.push(
          makeFollowupShadowObservation(
            'plutio',
            await mapInvoice(
              deps,
              invoice,
              invoicePayments.get(invoice.id),
              observedAt,
              businessComplete && actionsComplete && invoicePaymentsComplete,
              invoice.clientId
                ? (recipients.get(invoice.clientId) ?? null)
                : null,
              recipientSourceComplete,
            ),
          ),
        );
      } catch {
        pushError({ source: 'business_v2', code: 'identity_read_failed' });
        observations.push(
          makeFollowupShadowObservation('plutio', {
            lane: 'receivable',
            sourceKey: `plutio-invoice:${invoice.id}`,
            observedAt,
            sourceEvidenceComplete: false,
            sourceIdentityConflict: false,
            pendingAction: false,
            uncertainDelivery: false,
            suppressed: false,
            partyId: null,
            invoiceStatus: invoice.status,
            dueAt: invoice.dueAt,
            outstandingAmount: invoice.outstandingAmount,
            currency: invoice.currency,
            paymentReconciled: false,
            collectionApproved: false,
            specialHandling: false,
            recipientResolved: false,
            ownerResolved: false,
            confirmedAttempts: 0,
            lastConfirmedAttemptAt: null,
          }),
        );
      }
    }
  }
  return {
    observations,
    existing: existingRead.status === 'fulfilled' ? existingRead.value : [],
    sourceErrors,
  };
}
