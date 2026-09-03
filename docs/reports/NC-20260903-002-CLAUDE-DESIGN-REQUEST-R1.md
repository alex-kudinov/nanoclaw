# NC-20260903-002 — Inbound customer-work routing design review

## Objective

Review the failure model and proposed architecture for inbound Gmail work. The
required outcome is that every accepted inbound email receives one durable
classification and one explicit primary owner, while customer replies that
need drafting reach Sales as approval-gated `SERVICE` work instead of becoming
Chief-owned dead ends. Identify only material design flaws or missing
acceptance tests before Codex implements.

## Authority and boundaries

- Running host code, database schema, tests, and group prompts describe current
  mechanics. `CLAUDE.md`, `docs/PROJECT-MAP.md`, and
  `docs/CHANGE-PROTOCOL.md` govern operations.
- Sales owns customer-response drafting; Mailman sends only an exact approved
  action; Chief coordinates ambiguity and must not become the reply owner.
- Preserve every current Action-ID, exact-card, recipient, CC, Gmail execution,
  idempotency, and confirmed-receipt guard. No change may authorize or send a
  customer email.
- No credentials, `.env`, auth stores, runtime databases, raw customer bodies,
  or unrelated private material may be read.
- Allowed source files for this review:
  1. `src/host-router.ts`
  2. `src/classify-ipc-handlers.ts`
  3. `src/ipc.ts`
  4. `container/agent-runner/src/ipc-mcp-stdio.ts`
  5. `groups/mailman/CLAUDE.md`
  6. `groups/chief/CLAUDE.md`
  7. `groups/sales/CLAUDE.md`
  8. `src/gmail-ipc-policy.ts`
- Write only `docs/reports/NC-20260903-002-CLAUDE-DESIGN-RESPONSE-R1.md`.

## Verified incident facts (sanitized)

Four access/support cases failed or generated false escalation traffic within
one night.

1. Two emails were classified as `MrGru/student/support`. That label is named
   in operational knowledge but does not exist in the live 25-row taxonomy.
   The handler nevertheless stored it and marked it routed; the hard-coded
   router treated it as unrecognized and sent it only to Chief.
2. A third support email caused Mailman to post a visible `MrGru/other`
   escalation but Mailman never emitted the mandatory classification IPC. It
   therefore has no classification row and the host router never ran. The
   model-authored escalation carried only a summary, while the stored Gmail
   input had exact sender, recipient context, Thread-ID, Message-ID, and body.
3. Chief summarized that escalation into a separate Slack root. When the owner
   replied with the exact clarification to ask, the new thread lacked the
   Gmail identifiers/body. Chief followed its competing support-draft path,
   then blocked when a cross-work-item context lookup was correctly denied.
4. A fourth email was correctly classified `MrGru/client/active` and routed to
   Sales. Mailman also attempted an unapproved Gmail reply during the inbound
   classification turn. The host correctly denied it, but the generic denial
   told Mailman to escalate. Chief and later Sales misread that expected
   security denial plus a Gmail Thread-ID shared by multiple template
   recipients as an integrity failure, so Sales withheld a draft.
5. In the last 30 days, 61 classification rows use six labels absent from the
   live taxonomy; all were marked routed. Twenty-one additional valid,
   actionable classifications have `routed_at IS NULL`.
6. `handleClassifyLabelWrite()` returns before persistence for confidence below
   0.5 and emits a metadata-poor Chief message. It does not validate that the
   proposed label exists or is enabled.
7. Mailman's prompt describes it as a classifier, but the same static tool
   surface exposes Gmail send/reply and instructs it to perform a separate
   escalation before the mandatory raw-file classification write. The two
   actions are not atomic and only classification drives host routing.

## Proposed architecture

### A. One canonical classification and routing policy

- Add a tracked, typed canonical policy enumerating every accepted label and
  its primary disposition: Sales support, Sales lead, Inbox, Contador,
  Procurement, Archivarista, Chief review, or classify-only.
- Add an ordered migration that reconciles the live taxonomy with that policy,
  including canonical `MrGru/student/support` and the five other currently
  emitted-but-absent labels. Correct drifted `auto_archive` flags.
- Validate labels at the host boundary. Never persist or mark an unknown or
  disabled label as successfully routed. Normalize an invalid/low-confidence
  proposal to a recorded `MrGru/other` fallback with the original proposal in
  audit reasoning, then route the exact source to Chief.
- Route `student/support` and all `client/*` labels to Sales using a neutral
  `[SOURCE: email-support]` contract that does not claim a paid relationship.
  Route `financial/refund` to Sales as the primary response owner while
  retaining a non-blocking Chief visibility path.
- Make non-actionable notification/newsletter/spam dispositions explicit
  `classify_only`, not unrecognized Chief fallbacks.

### B. One Mailman decision, owned by the host

- Add a typed `classify_email` MCP tool available only to Mailman. The model
  supplies label/confidence/reasoning; exact sender, subject, Thread-ID,
  Message-ID, body, and recipient context are reloaded from the host-stored
  Gmail message.
- Validate the source container is currently bound to the same Gmail
  chat/thread before accepting the classification. Keep the existing raw IPC
  parser only for backward-compatible recovery, with the same validation.
- Remove Mailman's separate model-authored escalation step. The host performs
  all dispatch/fan-out after the single classification receipt.

### C. Durable missing-classification closure

- Add a bounded host reaper over retained raw inbound Gmail rows older than a
  grace period. If no classification exists, record one idempotent
  `MrGru/other` host-fallback classification and route the complete exact
  source. Run after startup and periodically so a daemon restart cannot strand
  accepted mail.
- A visible escalation or model final text is not a classification receipt.
  The source message ID is the idempotency key.

### D. Keep policy denials out of customer-work semantics

- An unapproved Gmail send/reply attempted from an inbound Mailman turn remains
  quarantined and never calls Gmail, but the source response must say this is
  an expected approval-boundary denial and to finish classification only. It
  must not instruct Mailman to escalate the customer case or post a generic
  Chief customer-work card.
- Genuine approved-action failures retain the current Chief/approval-thread
  visibility and fail-closed semantics.

### E. Remove competing ownership and false identity inference

- Chief must route any customer reply needing composition to Sales; remove its
  competing one-off support-draft workflow. Preserve the exact source fields in
  any Chief review card/handoff.
- Sales must treat the current `Lead Email`/From + Message-ID + Thread-ID work
  tuple as source identity. Gmail may group template replies from different
  external recipients under one mailbox Thread-ID; Thread-ID reuse alone is
  not evidence of collision, spoofing, or an unsafe recipient. The host's
  exact approval/recipient guards remain authoritative.
- Mailman's expected unapproved inbound-send denials are not evidence that an
  approved customer action failed.

## Acceptance tests

1. The three sanitized support cases each produce exactly one Sales support
   handoff with Email/From, visible-recipient context, Thread-ID, Message-ID,
   subject, and body; zero Chief-owned reply work and zero Gmail call.
2. Invalid and disabled labels cannot be persisted as successful
   classifications; low confidence produces one durable fallback and one
   complete Chief review handoff.
3. A Mailman turn that posts text but omits classification is recovered after
   grace and after restart, once only.
4. An inbound Mailman `gmail_reply` without Action-ID is quarantined, does not
   call Gmail, does not create a customer-work Chief alert, and tells that exact
   source container to classify only.
5. A real approved action failure behaves exactly as before.
6. Same Gmail Thread-ID with two different current senders produces two
   separately recipient-bound Sales work items; neither is blocked merely by
   the shared Thread-ID.
7. Every label in the Mailman classification contract is present in the
   tracked policy and migration; every policy disposition has a routing test.
8. Existing email-critical/replay tests, typecheck, full root suite, runner
   build/tests, continuity checks, immutable release verification, and a live
   no-send canary pass.

## Questions for Claude

Report material findings only, ordered by consequence and tied to exact source
evidence. In particular:

1. Does the plan actually remove the model-dependent split-brain, or does any
   path still permit a visible but non-durable completion?
2. Is the proposed work identity and Thread-ID treatment safe under existing
   approval/recipient enforcement?
3. Is the fallback/reaper idempotent and restart-safe without converting
   classification uncertainty into unauthorized Sales work?
4. Which parts are too broad or should be sequenced differently to minimize
   production risk?

End with `GO`, `GO WITH REQUIRED CHANGES`, or `STOP`, followed by the smallest
set of required design changes.
