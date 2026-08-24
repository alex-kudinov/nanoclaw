# NC-20260824-004 — Claude correction review R2 response

## Verdict

`NO MATERIAL FINDINGS`

## P1 — `ABANDONED_CART` / `MENTION` source-event key — resolved

**Evidence:** `src/student-lifecycle.ts:292-328` (`sourceKey`) now branches these
two actions off the bare-`delivery_id` case:

```ts
case 'MENTION':
  return `${prefix}:mention:${refs.channel_id}:${refs.thread_id}:${refs.message_id}:${facts.mentioned_selection_sha256}`;
case 'ABANDONED_CART': {
  const dayBucket = Math.floor(Date.parse(observedAt) / 86_400_000);
  return `${prefix}:abandoned_cart:${refs.invitation_id}:${identityFingerprint ?? deliveryId}:${payloadSha256}:${dayBucket}`;
}
case 'USER_UPDATE':
  return `${prefix}:${action.toLowerCase()}:delivery:${deliveryId}`;
```

`MENTION` keys on `channel_id/thread_id/message_id` plus a selection hash
(`facts.mentioned_selection_sha256`) computed from `mentionedUsers` sorted by
`type:id` before hashing (`src/student-lifecycle.ts:403-425`), matching the
design's "source object + selection hash." `ABANDONED_CART` keys on
`invitation_id`, keyed identity (falling back to `delivery_id` only when no
identity was resolved), `payload_sha256`, and a UTC-day bucket, matching
"invitation/groups + HMAC identity + canonical-payload hash + bounded delivery
window." `payload_sha256` for this action is computed over
`{invitation_id, identity_fingerprint, group_ids}` with `group_ids` sorted
before hashing (`src/student-lifecycle.ts:443-467`), so the canonical payload
is order-independent as the design requires. `USER_UPDATE` is unchanged and
still keys on `delivery_id` alone, correct per the design's "unique transport
receipt" rule.

`parsePreparedCommunityLifecycleEnvelope` recomputes `source_event_key` via
the same `sourceKey()` function and rejects any stored envelope whose key
doesn't match (`src/student-lifecycle.ts:564-577`), so replay cannot diverge
from initial processing.

**Test evidence confirms the fix behaves correctly, not just that the code
changed:**

- `src/student-lifecycle.test.ts:168-185` — same-window `MENTION`/
  `ABANDONED_CART` redelivery with a *different* `delivery_id` still
  dedupes to the same `source_event_key`.
- `src/student-lifecycle.test.ts:187-201` — `ABANDONED_CART` observed on the
  next UTC day produces a *different* key (window correctly bounded, not
  unboundedly deduped).
- `src/student-lifecycle.test.ts:203-245` — reversed `mentionedUsers` order
  and reversed `groupIDs` order both produce the *same* key (canonical/
  order-independent hashing verified, not just assumed).
- `src/student-lifecycle.test.ts:153-166` — `USER_UPDATE` is confirmed to
  still change key per `delivery_id`, proving the correction didn't
  regress the one action the design says should stay delivery-keyed.

No remaining gap: both actions now dedupe genuine relay/provider redelivery
as specified, `USER_UPDATE` is untouched, and the replay path re-derives and
validates the same key.

## P2 — identity-fingerprint HMAC secret reuse — resolved

**Evidence:** `STUDENT_LIFECYCLE_IDENTITY_SECRET` is a distinct, separately
loaded configuration value (`src/config.ts:150-155`, `:174-177`). Startup
enforcement when the feature is enabled requires both the relay secret and
the identity secret to be at least 32 characters **and** requires them to be
unequal, or the process throws (`src/config.ts:179-201`,
specifically `:193-200`: `STUDENT_LIFECYCLE_IDENTITY_SECRET.length < 32 ||
STUDENT_LIFECYCLE_IDENTITY_SECRET === STUDENT_LIFECYCLE_RELAY_SECRET`).
`src/student-lifecycle-config.test.ts:23-36` asserts this exact fail-closed
inequality check is present in the source.

`src/webhook-server.ts:170-171` carries `relaySecret` and `identitySecret` as
two separate typed fields on the `studentLifecycle` deps object.
`verifyCommunityLifecycleSignature` is called with `secret: lifecycle.relaySecret`
(`src/webhook-server.ts:786`), and `prepareCommunityLifecycleEnvelope` is
called separately with `lifecycle.identitySecret` (`src/webhook-server.ts:801`)
— two distinct call sites, two distinct values. `src/index.ts:2199-2200` wires
these from the two distinct exported config constants
(`STUDENT_LIFECYCLE_RELAY_SECRET`, `STUDENT_LIFECYCLE_IDENTITY_SECRET`), no
shared variable.

`.env.example:31-39` documents the identity secret as host-only, never
configured in n8n, and stable across relay-secret rotation. The n8n export
(`setup/n8n/student-lifecycle-community-dark-workflow.json`, per R1 §6, out
of this review's read scope but unchanged by this correction per the request
scope) only ever needed the relay signature secret to sign requests and was
not touched by this fix — it has no reason to reference the identity secret.
Doc hunks confirm the design intent is now implemented:
`docs/STUDENT-LIFECYCLE-CONTROL-PLANE.md:364-367`, `docs/SECURITY.md:195-196`,
`docs/WEBHOOK-RELIABILITY.md:206-207`, `docs/STUDENT-LIFECYCLE-IMPLEMENTATION-PLAN.md`
(no residual single-secret language found in any of the four).

No remaining gap: the two secrets are independently configured, independently
validated, independently wired end to end, and a future relay-secret rotation
cannot silently change stored `identity_fingerprint` values.

## Authority confirmation

Within the corrections reviewed (`src/student-lifecycle.ts`,
`src/student-lifecycle.test.ts`, `src/config.ts`,
`src/student-lifecycle-config.test.ts`, `src/webhook-server.ts`, `.env.example`,
and the task-owned doc hunks), no Circle capability, provider credential,
activation/deployment trigger, action/message/callback authority, or
credential-exposure surface was added or changed. The `ABANDONED_CART` key fix
only changes which string is hashed into `source_event_key` for two
non-projecting/non-lifecycle actions (`eventCanProject` still excludes
`ABANDONED_CART`; `MENTION`'s treatment is `non_lifecycle`); it opens no new
projection, catalog, or messaging path. The identity-secret fix only adds a
second required, host-only, blank-by-default configuration value with the
same fail-closed enable-time validation shape as the existing relay secret —
it grants no new reachability, and `STUDENT_LIFECYCLE_ENABLED` still defaults
to `false`.
