/**
 * Plutio proposal + recipient fetch for the follow-up loop.
 *
 * Plutio is the system of record. Open proposals are `status: pending`; the
 * client contact is `proposal.client._id`, resolved to an email via list-people
 * (get-person has a jq bug). The client-facing link is built from the proposal
 * _id — the REST API exposes no public URL field.
 */

import { PROPOSAL_PUBLIC_URL_BASE } from './config.js';
import { callPlutioTool, stripToJson } from './plutio-cli.js';

export interface OpenProposal {
  id: string; // Plutio _id
  number: string; // human label (proposalId), e.g. tca-089-prop
  title: string; // proposal name, used in the email
  pendingAt: Date; // when it was sent (entered pending)
  clientId: string | null; // proposal.client._id
}

/** Content-minimized source truth used by the Company OS follow-up shadow. */
export interface ProposalSnapshot {
  id: string;
  status: string;
  pendingAt: string | null;
  approvedAt: string | null;
  autoInvoiceId: string | null;
  projectId: string | null;
  clientId: string | null;
}

export interface Recipient {
  email: string;
  firstName: string;
  lastName: string;
}

/** Client-facing proposal link (logged-out viewable + signable). */
export function resolveProposalUrl(plutioId: string): string {
  return `${PROPOSAL_PUBLIC_URL_BASE}/${plutioId}`;
}

/** Internal Plutio edit/admin link (for operator close-out actions). */
export function resolveProposalEditUrl(plutioId: string): string {
  const origin = new URL(PROPOSAL_PUBLIC_URL_BASE).origin;
  return `${origin}/proposals/${plutioId}/edit`;
}

/** Tolerate both a bare array and a `{ data: [...] }` envelope. */
function asArray(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray((parsed as { data?: unknown[] }).data)) {
    return (parsed as { data: unknown[] }).data;
  }
  return [];
}

function toOpenProposal(p: Record<string, unknown>): OpenProposal | null {
  if (!p || typeof p._id !== 'string') return null;
  const pendingRaw = (p.pendingAt as string) || (p.createdAt as string);
  const pendingAt = pendingRaw ? new Date(pendingRaw) : null;
  if (!pendingAt || Number.isNaN(pendingAt.getTime())) return null;
  const client = p.client as { _id?: string } | undefined;
  return {
    id: p._id,
    number: (p.proposalId as string) || p._id,
    title: (p.name as string) || (p.proposalId as string) || 'your proposal',
    pendingAt,
    clientId: client?._id ?? null,
  };
}

function idFrom(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value;
  if (
    value &&
    typeof value === 'object' &&
    typeof (value as { _id?: unknown })._id === 'string'
  ) {
    return (value as { _id: string })._id;
  }
  return null;
}

function timestampFrom(value: unknown): string | null {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    return null;
  }
  return new Date(value).toISOString();
}

function toProposalSnapshot(
  proposal: Record<string, unknown>,
): ProposalSnapshot | null {
  const id = idFrom(proposal._id);
  if (!id) return null;
  return {
    id,
    status:
      typeof proposal.status === 'string'
        ? proposal.status.trim().toLowerCase()
        : 'unknown',
    // Deliberately do not fall back to createdAt. Cadence begins only when the
    // proposal actually entered pending state.
    pendingAt: timestampFrom(proposal.pendingAt),
    approvedAt: timestampFrom(proposal.approvedAt),
    autoInvoiceId: idFrom(proposal.autoInvoiceId ?? proposal.autoInvoice),
    projectId: idFrom(proposal.projectId ?? proposal.project),
    clientId: idFrom(proposal.client),
  };
}

/** Parse list-proposals output into open proposals (exported for tests). */
export function parseProposals(raw: string): OpenProposal[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripToJson(raw));
  } catch {
    return [];
  }
  return asArray(parsed)
    .map((p) => toOpenProposal(p as Record<string, unknown>))
    .filter((p): p is OpenProposal => p !== null);
}

/** Parse current Plutio proposal state without inventing a pending date. */
export function parseProposalSnapshots(raw: string): ProposalSnapshot[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripToJson(raw));
  } catch {
    return [];
  }
  return asArray(parsed)
    .map((proposal) => toProposalSnapshot(proposal as Record<string, unknown>))
    .filter((proposal): proposal is ProposalSnapshot => proposal !== null);
}

/** Parse list-people output into a single recipient (exported for tests). */
export function parseRecipient(raw: string): Recipient | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripToJson(raw));
  } catch {
    return null;
  }
  const arr = asArray(parsed);
  const person = (arr.length ? arr[0] : parsed) as
    | Record<string, unknown>
    | undefined;
  if (!person) return null;
  const emails = person.contactEmails as
    | Array<{ address?: string }>
    | undefined;
  const email = emails?.[0]?.address;
  if (!email || typeof email !== 'string') return null;
  const name = person.name as { first?: string; last?: string } | undefined;
  return {
    email,
    firstName: name?.first || '',
    lastName: name?.last || '',
  };
}

export async function listOpenProposals(): Promise<OpenProposal[]> {
  const raw = await callPlutioTool('list-proposals.sh', [
    '--filter',
    '{"status":"pending"}',
    '--limit',
    '200',
  ]);
  return parseProposals(raw);
}

/** Current pending rows for shadow reconciliation, including conversion flags. */
export async function listProposalSnapshots(): Promise<ProposalSnapshot[]> {
  const raw = await callPlutioTool('list-proposals.sh', [
    '--filter',
    '{"status":"pending"}',
    '--limit',
    '200',
  ]);
  if (!stripToJson(raw)) {
    throw new Error('Plutio proposal source returned no JSON');
  }
  return parseProposalSnapshots(raw);
}

/**
 * Set a proposal's status in Plutio. The status field is writable even on a
 * pending (otherwise read-only) proposal. Use 'declined' for a client decline,
 * 'cancelled' to withdraw. Returns true if the status read back as expected.
 */
export async function setProposalStatus(
  plutioId: string,
  status: string,
): Promise<boolean> {
  const raw = await callPlutioTool('update-proposal.sh', [
    '--id',
    plutioId,
    '--data',
    JSON.stringify({ status }),
  ]);
  const parsed = JSON.parse(stripToJson(raw)) as { status?: string };
  return parsed?.status === status;
}

export async function resolveRecipient(
  clientId: string,
): Promise<Recipient | null> {
  if (!clientId) return null;
  const raw = await callPlutioTool('list-people.sh', [
    '--filter',
    JSON.stringify({ _id: clientId }),
  ]);
  return parseRecipient(raw);
}
