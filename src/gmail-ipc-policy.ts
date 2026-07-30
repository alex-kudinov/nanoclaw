/**
 * Host-owned authorization for the Gmail IPC surface.
 *
 * The container MCP server exposes one static tool list to every agent, so the
 * host must enforce both capability and resource scope. A prompt cannot grant
 * itself mailbox access: grants originate from Gmail/host code and may only be
 * propagated between groups when the source already holds the resource.
 */

import { normalizeRecipient } from './email-recipient-guard.js';

export type GmailIpcOperation =
  | 'gmail_reply'
  | 'gmail_send'
  | 'gmail_search'
  | 'gmail_read'
  | 'gmail_get_thread';

export interface GmailIpcRequest {
  type: GmailIpcOperation;
  threadId?: string;
  messageId?: string;
  query?: string;
}

const CAPABILITIES: Readonly<Record<string, ReadonlySet<GmailIpcOperation>>> =
  Object.freeze({
    mailman: new Set<GmailIpcOperation>([
      'gmail_reply',
      'gmail_send',
      'gmail_search',
      'gmail_read',
      'gmail_get_thread',
    ]),
    sales: new Set<GmailIpcOperation>(['gmail_search', 'gmail_get_thread']),
    contador: new Set<GmailIpcOperation>(['gmail_read']),
    archivarista: new Set<GmailIpcOperation>(['gmail_read']),
    chief: new Set<GmailIpcOperation>(['gmail_read']),
  });

const GRANT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_RESOURCES_PER_KIND = 5_000;
const THREAD_ID_RE = /^\s*Thread-ID:\s*(\S+)\s*$/gim;
const MESSAGE_ID_RE = /^\s*Message-ID:\s*(\S+)\s*$/gim;
const EMAIL_RE =
  /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+/gi;

interface ResourceGrant {
  expiresAt: number;
  threadIds: Set<string>;
  messageIds: Set<string>;
  emailAddresses: Set<string>;
}

const grants = new Map<string, ResourceGrant>();

function activeGrant(groupFolder: string): ResourceGrant | undefined {
  const grant = grants.get(groupFolder);
  if (!grant) return undefined;
  if (grant.expiresAt <= Date.now()) {
    grants.delete(groupFolder);
    return undefined;
  }
  return grant;
}

function writableGrant(groupFolder: string): ResourceGrant {
  const existing = activeGrant(groupFolder);
  if (existing) {
    existing.expiresAt = Date.now() + GRANT_TTL_MS;
    return existing;
  }
  const created: ResourceGrant = {
    expiresAt: Date.now() + GRANT_TTL_MS,
    threadIds: new Set(),
    messageIds: new Set(),
    emailAddresses: new Set(),
  };
  grants.set(groupFolder, created);
  return created;
}

function normalizedToken(value: string | undefined): string | null {
  const token = value?.trim();
  return token ? token : null;
}

function extractAll(pattern: RegExp, text: string): Set<string> {
  const result = new Set<string>();
  pattern.lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const token = normalizedToken(match[1]);
    if (token) result.add(token);
  }
  return result;
}

function extractEmails(text: string): Set<string> {
  const result = new Set<string>();
  EMAIL_RE.lastIndex = 0;
  for (const match of text.matchAll(EMAIL_RE)) {
    result.add(normalizeRecipient(match[0]));
  }
  return result;
}

function extractHandoffHeaderEmails(text: string): Set<string> {
  const result = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    if (
      /^\s*(?:Body|Message|Original-Message|DRAFT RESPONSE|THEIR REQUEST)\s*:/i.test(
        line,
      )
    ) {
      break;
    }
    const value = /^\s*(?:From|To|CC|Email)\s*:\s*(.+)$/i.exec(line)?.[1];
    if (value) {
      for (const email of extractEmails(value)) result.add(email);
    }
  }
  return result;
}

function addBounded(set: Set<string>, value: string): void {
  if (set.has(value)) set.delete(value);
  set.add(value);
  while (set.size > MAX_RESOURCES_PER_KIND) {
    const oldest = set.values().next().value as string | undefined;
    if (!oldest) break;
    set.delete(oldest);
  }
}

export interface GmailResourceGrantInput {
  threadId?: string;
  messageId?: string;
  emailAddresses?: Iterable<string>;
}

/**
 * Grant resources that trusted host code just obtained from Gmail or another
 * authoritative source. Do not call this with model-authored text.
 */
export function grantHostGmailResources(
  groupFolder: string,
  input: GmailResourceGrantInput,
): void {
  const threadId = normalizedToken(input.threadId);
  const messageId = normalizedToken(input.messageId);
  const emails = [...(input.emailAddresses ?? [])]
    .map(normalizeRecipient)
    .filter(Boolean);
  if (!threadId && !messageId && emails.length === 0) return;

  const grant = writableGrant(groupFolder);
  if (threadId) addBounded(grant.threadIds, threadId);
  if (messageId) addBounded(grant.messageIds, messageId);
  for (const email of emails) addBounded(grant.emailAddresses, email);
}

/**
 * Propagate only resources already granted to the source group. The handoff
 * text is model-authored and therefore supplies candidates, never authority.
 */
export function propagateGmailResources(
  sourceGroup: string,
  targetGroup: string,
  handoffText: string,
): void {
  const source = activeGrant(sourceGroup);
  if (!source) return;

  const threadIds = extractAll(THREAD_ID_RE, handoffText);
  const messageIds = extractAll(MESSAGE_ID_RE, handoffText);
  const emailAddresses = extractHandoffHeaderEmails(handoffText);
  const allowed: GmailResourceGrantInput = {
    emailAddresses: [...emailAddresses].filter((v) =>
      source.emailAddresses.has(v),
    ),
  };

  for (const value of threadIds) {
    if (source.threadIds.has(value)) {
      allowed.threadId = value;
      break;
    }
  }
  for (const value of messageIds) {
    if (source.messageIds.has(value)) {
      allowed.messageId = value;
      break;
    }
  }
  grantHostGmailResources(targetGroup, allowed);
}

export function extractScopedGmailSearchAddresses(
  query: string,
): string[] | null {
  const compact = query.trim().replace(/\s+/g, ' ');
  const clause = "(?:from|to):([A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+)";
  const safeShape = new RegExp(`^${clause}(?: OR ${clause})?$`, 'i').exec(
    compact,
  );
  if (!safeShape) return null;

  return safeShape
    .slice(1)
    .filter((v): v is string => Boolean(v))
    .map(normalizeRecipient);
}

function searchIsResourceScoped(query: string, grant: ResourceGrant): boolean {
  const addresses = extractScopedGmailSearchAddresses(query);
  return (
    addresses !== null &&
    addresses.length > 0 &&
    addresses.every((address) => grant.emailAddresses.has(address))
  );
}

export interface GmailIpcAuthorization {
  ok: boolean;
  reason?: string;
}

/**
 * Final host authorization for a container-originated Gmail IPC request.
 */
export function authorizeGmailIpc(
  groupFolder: string,
  request: GmailIpcRequest,
): GmailIpcAuthorization {
  if (!CAPABILITIES[groupFolder]?.has(request.type)) {
    return {
      ok: false,
      reason: `${groupFolder} is not allowed to invoke ${request.type}`,
    };
  }

  const grant = activeGrant(groupFolder);
  if (request.type === 'gmail_reply') {
    const threadId = normalizedToken(request.threadId);
    if (!threadId || !grant?.threadIds.has(threadId)) {
      return {
        ok: false,
        reason: 'gmail_reply thread was not assigned by the host',
      };
    }
  }
  if (request.type === 'gmail_send' && request.threadId) {
    const threadId = normalizedToken(request.threadId);
    if (!threadId || !grant?.threadIds.has(threadId)) {
      return {
        ok: false,
        reason: 'gmail_send thread was not assigned by the host',
      };
    }
  }
  if (request.type === 'gmail_get_thread') {
    const threadId = normalizedToken(request.threadId);
    if (!threadId || !grant?.threadIds.has(threadId)) {
      return {
        ok: false,
        reason: 'gmail_get_thread resource was not assigned by the host',
      };
    }
  }
  if (request.type === 'gmail_read') {
    const messageId = normalizedToken(request.messageId);
    if (!messageId || !grant?.messageIds.has(messageId)) {
      return {
        ok: false,
        reason: 'gmail_read resource was not assigned by the host',
      };
    }
  }
  if (request.type === 'gmail_search') {
    if (
      !request.query ||
      !grant ||
      !searchIsResourceScoped(request.query, grant)
    ) {
      return {
        ok: false,
        reason:
          'gmail_search must be an exact from:/to: query for a host-assigned address',
      };
    }
  }
  return { ok: true };
}

export type GmailResourceResolver = (
  groupFolder: string,
  request: GmailIpcRequest,
) => Promise<boolean>;

/**
 * Retry a resource denial only when a trusted host resolver proves that the
 * requested resource belongs to durable work assigned to this group. The
 * resolver never overrides the operation matrix or the safe search grammar.
 */
export async function authorizeGmailIpcWithResolver(
  groupFolder: string,
  request: GmailIpcRequest,
  resolveResource: GmailResourceResolver,
): Promise<GmailIpcAuthorization> {
  const initial = authorizeGmailIpc(groupFolder, request);
  if (initial.ok || !CAPABILITIES[groupFolder]?.has(request.type)) {
    return initial;
  }

  const input: GmailResourceGrantInput = {};
  if (
    request.type === 'gmail_reply' ||
    request.type === 'gmail_get_thread' ||
    (request.type === 'gmail_send' && request.threadId)
  ) {
    const threadId = normalizedToken(request.threadId);
    if (!threadId) return initial;
    input.threadId = threadId;
  } else if (request.type === 'gmail_read') {
    const messageId = normalizedToken(request.messageId);
    if (!messageId) return initial;
    input.messageId = messageId;
  } else if (request.type === 'gmail_search') {
    const addresses = request.query
      ? extractScopedGmailSearchAddresses(request.query)
      : null;
    if (!addresses?.length) return initial;
    input.emailAddresses = addresses;
  } else {
    return initial;
  }

  if (!(await resolveResource(groupFolder, request))) return initial;
  grantHostGmailResources(groupFolder, input);
  return authorizeGmailIpc(groupFolder, request);
}

/** Test isolation only. */
export function resetGmailResourceGrantsForTest(): void {
  grants.clear();
}
