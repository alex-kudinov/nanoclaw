# NC-20260824-004 — Claude implementation review R1 response

## Verdict

`MATERIAL FINDINGS`

One P1 correctness/idempotency deviation from the accepted control-plane
design and one P2 hardening note. No P0. No Circle, production, provider,
deployment, action, message, certificate, or minion boundary violation found.

## Findings

### P1 — `ABANDONED_CART` (and `MENTION`) source-event key does not match the accepted design; genuine relay/provider redelivery is not deduplicated

**Evidence:** `src/student-lifecycle.ts:292-321` (`sourceKey`), specifically:

```ts
case 'USER_UPDATE':
case 'MENTION':
case 'ABANDONED_CART':
  return `${prefix}:${action.toLowerCase()}:delivery:${deliveryId}`;
```

`delivery_id` is not a Heartbeat-issued identifier — it is minted fresh by
the n8n relay on every code-node execution
(`setup/n8n/student-lifecycle-community-dark-workflow.json:22`,
`delivery_id: crypto.randomUUID()`). `docs/STUDENT-LIFECYCLE-CONTROL-PLANE.md`
§7 (source-event identity table) specifies a different, content-derived key
for these two actions:

- `ABANDONED_CART` → `invitation/groups + HMAC identity + canonical-payload
  hash + bounded delivery window`
- `MENTION` → `source object + selection hash`

Both hash/identity ingredients the design calls for are already computed
host-side and available at the point `sourceKey()` runs
(`payload_sha256` via `sha256(JSON.stringify(data))` at
`src/student-lifecycle.ts:438`, and `refs.invitation_id` /
`identity_fingerprint` are already resolved). The implementation instead
falls through to the same bare-`delivery_id` branch used for `USER_UPDATE`,
which is correct for `USER_UPDATE` (design: "unique transport receipt") but
not for these two.

**Consequence:** every relay retry or genuine provider redelivery of an
`ABANDONED_CART` or `MENTION` event produces a *new* `source_event_key`
(because `delivery_id` differs per HTTP call), so `webhook_inbox`'s
`(source, event_id)` idempotency and `student_lifecycle_events.source_event_key
UNIQUE` never collapse the duplicate. This violates
`docs/STUDENT-LIFECYCLE-CONTROL-PLANE.md` §13.1 ("duplicate transport/domain
fact: link to winning receipt and stop before projection") for these two
actions specifically, and is a real risk class already documented in the
control plane's own live-topology findings (§3.1: "two duplicate `USER_JOIN`"
registrations exist today for the *same* provider). `MENTION` is
non-lifecycle (no operational impact beyond duplicate audit rows).
`ABANDONED_CART` does not currently move any projection axis in this dark
slice (`eventCanProject` excludes it), so there is no state-corruption path
today — but the dark-foundation event ledger itself is meant to be the
durable, deduplicated record a later slice (Stage 4+) will reconcile against,
and it currently will not be for this action.

**Minimal correction:** for `ABANDONED_CART`, key on
`invitation_id + identity_fingerprint (or delivery_id if no identity) +
payload_sha256`; for `MENTION`, key on a hash of `channel_id/thread_id/
message_id + mentioned-user selection`. Keep `USER_UPDATE` on `delivery_id`
as designed. `parsePreparedCommunityLifecycleEnvelope`'s recomputation check
(`src/student-lifecycle.ts:516-521`) already re-derives and validates
`source_event_key` from the prepared envelope, so this is a same-file,
same-function change with no store/migration/n8n contract impact.

### P2 — Identity fingerprint and relay-signature HMAC share one secret

**Evidence:** `src/webhook-server.ts:798-801` passes `lifecycle.relaySecret`
(the same `STUDENT_LIFECYCLE_RELAY_SECRET` used for
`verifyCommunityLifecycleSignature`) as the `identitySecret` argument to
`prepareCommunityLifecycleEnvelope`, which keys `fingerprintEmail()`
(`src/student-lifecycle.ts:201-212`) with it. Domain separation is by string
prefix only (`'student-lifecycle-identity-v1\0'`).

**Consequence:** this secret already has to remain confidential for relay
authenticity; reuse doesn't open a new remote attack surface, but it does mean
anyone who ever needs the relay secret (e.g., for n8n credential rotation) can
also compute/verify the pseudonymized email fingerprint stored durably in
`student_lifecycle_events.identity_fingerprint`, and a future planned rotation
of the relay secret (e.g., after a suspected leak) will silently change future
fingerprint values without a corresponding plan to reconcile old rows. Not
blocking for this dark, credential-free slice, but worth a dedicated
`STUDENT_LIFECYCLE_IDENTITY_SECRET` before any live canary that persists real
fingerprints.

## Answers to required review questions

1. **Reachability without valid current HMAC / over byte bound:** No. The
   dedicated route (`src/webhook-server.ts:727-881`) checks
   `content-type`, then reads via `readBodyBounded(..., STUDENT_LIFECYCLE_MAX_BODY_BYTES)`
   which rejects mid-stream with 413 before any parsing (`src/webhook-server.ts:761-778`),
   then calls `verifyCommunityLifecycleSignature` before any JSON parse or
   archive (`src/webhook-server.ts:780-793`). Only after both succeed is the
   body parsed and archived. Confirmed by
   `src/webhook-server.test.ts:1274-1313` (oversize rejected before archive;
   invalid signature 401; wrong content-type 415).

2. **Raw email/name/content/header/secret persistence:** No, with the P2
   caveat above being about secret *reuse*, not persistence. Secret-bearing
   headers (`x-webhook-signature`, `authorization`, `cookie`, etc.) are
   stripped before archive (`src/webhook-inbox.ts:32-51`). Only the
   already-minimized `parsed.prepared` object is archived as `raw_body`
   (`src/webhook-server.ts:812-819`) — never the raw Heartbeat payload.
   `parsePreparedCommunityLifecycleEnvelope` additionally scans the stored
   envelope for forbidden substrings (`"email"`, `"name"`, `"text"`,
   `"body"`, `"content"`, `"authorization"`, `"cookie"`) before accepting it
   for replay (`src/student-lifecycle.ts:522-537`). Transient email exists
   only in-process, passed by reference into `record()`/
   `processPreparedCommunityLifecycle`, and is never written to the migration
   134 tables (verified against `134_student_lifecycle_community_dark.sql`
   column list — no email/name column exists anywhere in the schema).

3. **Reachability of webhooks.json/group/prompt/channel/callback/runAgent/
   action consumer:** No, on both paths. `webhook-server.ts`'s lifecycle
   branch returns before reaching the generic `/hook/:id` handler
   (`src/webhook-server.ts:727-881`, all exit paths `return` before line 884's
   generic match). The reaper's `dispatchRow` checks
   `row.source === STUDENT_LIFECYCLE_SOURCE` and returns before
   `loadWebhooks()`/group lookup (`src/webhook-inbox-reaper.ts:186-205`).
   Confirmed by `src/webhook-server.test.ts:1227-1255` and
   `src/webhook-inbox-reaper.test.ts:203-273` (`runAgent`/`getRegisteredGroups`
   asserted not called).

4. **Source-event/duplicate/post-archive-identity/catalog-ambiguity/episode/
   axis/CAS/replay correctness:** Correct for 9 of 11 actions; **not**
   correct for `ABANDONED_CART` and `MENTION` per the P1 finding above.
   Post-archive identity resolution matches the design (transient email used
   only after `archiveWebhook` succeeds, `src/webhook-server.ts:812-855`;
   replay never receives `transientEmail`,
   `src/webhook-inbox-reaper.ts:191-194`). Enrollment CAS is a single
   `UPDATE ... WHERE id = $1 AND version = $2` with a `rowCount`/version
   check that throws on mismatch (`src/student-lifecycle-store.ts:729-763`).
   `USER_JOIN` correctly applies only to existing active enrollments and
   never creates one (`src/student-lifecycle-store.ts:298-317`). Independent
   axes are enforced by `reduceLifecycleProjection`, which only ever changes
   one axis per action (`src/student-lifecycle.ts:634-642`).

5. **Migration/rollback safety and compatibility with 133:** Sound. All
   seven tables are `nanoclaw_admin`-owned, `REVOKE ALL FROM PUBLIC`, no
   other role granted (`134_...sql:571-614`). `workspace` is hardcoded to a
   single-value CHECK (`= 'community'`) on every table, not just a default —
   Circle cannot enter through this schema regardless of application-layer
   bugs. The core-fact immutability trigger only guards the originally
   inserted columns, correctly leaving `party_id`/`catalog_entry_id`/
   `mapping_status`/`processing_status` mutable for the store's `markEvent`
   UPDATE (compare `134_...sql:486-517` against
   `src/student-lifecycle-store.ts:590-612`). Rollback refuses if any of the
   seven tables is non-empty and drops cleanly otherwise
   (`rollback_134_student_lifecycle_community_dark.sql`). No FK, index, or
   name collision with a documented migration-133 object was found within
   the read scope.

6. **n8n byte-identical HMAC / no credential or PII persistence:** Confirmed
   structurally. The code node computes
   `HMAC-SHA256(secret, timestamp + '.' + bodyText)` and header name
   `X-Webhook-Signature: v1=<hex>` identically to
   `verifyCommunityLifecycleSignature`
   (`src/student-lifecycle.ts:587-592` vs. workflow JSON code node). The
   65536-byte ceiling in the code node matches
   `STUDENT_LIFECYCLE_MAX_BODY_BYTES` exactly. Per-action `allowedFields`
   maps match the host parser's expected `data.*` field names for all 11
   actions (spot-checked against `src/student-lifecycle.ts:349-422`). No
   message/DM/thread content field is in any allowlist. `active: false`,
   `saveDataSuccessExecution`/`saveDataErrorExecution: "none"`, no inline
   credential, host IP, or Circle string present.

7. **Fail-closed default-off/Circle exclusion at every layer:** Yes.
   Config: `STUDENT_LIFECYCLE_ENABLED` defaults false; when true, the path
   must match `/hook/[A-Za-z0-9._-]{16,200}` and must not contain "circle"
   (case-insensitive), and the secret must be ≥32 chars, or the process
   throws at startup (`src/config.ts:174-188`). Route: the dedicated branch
   only engages when `enabled === true` and the path matches exactly
   (`src/webhook-server.ts:732-737`). Payload: `workspace must be community`
   is enforced on both the inbound envelope and the replay-parsed prepared
   envelope (`src/student-lifecycle.ts:331-333`, `:456-460`). Schema: every
   `workspace` column is `CHECK (workspace = 'community')`, not just a
   default. n8n: hardcoded `workspace: 'community'` in the generated
   envelope, `active: false`. Tests: explicit Circle-rejection tests exist at
   both layers (`src/student-lifecycle.test.ts:109-119`,
   `src/webhook-server.test.ts:1257-1272`). Authority: `.env.example` ships
   all three lifecycle vars empty/false.

8. **Implementation/release/test/docs completeness to commit:** Yes, with the
   P1 correction folded in first. Documentation (`docs/SECURITY.md`
   "Community student-lifecycle ingress boundary", `docs/PROJECT-MAP.md`'s
   Student lifecycle row) accurately describes the implemented mechanics and
   does not imply migration/deployment/live proof beyond what the code does.
   The migration README's task-owned hunk correctly states migration 134 is
   local/unapplied.

## Circle and external/production boundary confirmation

Read scope was limited to the paths listed in the request. Within that scope:
no Circle identifier, credential literal, host IP, live provider ID, or
production write appears in any touched file. `STUDENT_LIFECYCLE_ENABLED`
defaults to `false` and every enabled-state check fails closed. The n8n
export is `active: false` and uses only runtime environment references. No
action/outbox/message/certificate/minion code path is reachable from either
the webhook-server or reaper lifecycle branch. Nothing in this diff imports,
activates, registers, deploys, or reads any live credential or database.
