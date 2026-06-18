/**
 * Plutio proposal + recipient fetch for the follow-up loop.
 *
 * Plutio is the system of record. Open proposals are `status: pending`; the
 * client contact is `proposal.client._id`, resolved to an email via list-people
 * (get-person has a jq bug). The client-facing link is built from the proposal
 * _id — the REST API exposes no public URL field.
 */

import { PROPOSAL_PUBLIC_URL_BASE } from './config.js';
import { callPlutioTool } from './plutio-cli.js';

export interface OpenProposal {
  id: string; // Plutio _id
  number: string; // human label (proposalId), e.g. tca-089-prop
  title: string; // proposal name, used in the email
  pendingAt: Date; // when it was sent (entered pending)
  clientId: string | null; // proposal.client._id
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

/**
 * The Plutio toolbox scripts prefix output with a status token (e.g. `OK [...]`
 * on success, `ERR ...` on failure). Slice from the first JSON bracket so the
 * status word doesn't break JSON.parse. Returns '' when there's no JSON.
 */
function stripToJson(raw: string): string {
  const s = (raw || '').trim();
  const arr = s.indexOf('[');
  const obj = s.indexOf('{');
  const start = arr === -1 ? obj : obj === -1 ? arr : Math.min(arr, obj);
  return start === -1 ? '' : s.slice(start);
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
