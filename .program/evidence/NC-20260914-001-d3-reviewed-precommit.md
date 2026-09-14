# NC-20260914-001 D3 reviewed precommit evidence

- State: source, disposable PostgreSQL verification and bounded independent
  review are complete. Production is unchanged; backup, immutable release,
  import, exact replay and live readback remain pending.
- Authority: accepted decision
  `.program/decisions/decision-tandem-identity-d3-heartbeat-reconciliation-2026-09-14.json`.
- Source: complete Heartbeat `main` censuses observed at
  `2026-09-14T11:22:41.000Z` and `2026-09-14T11:29:22.000Z` reproduce 1,694
  users, 79 groups, 4,202 membership edges, user-set SHA-256
  `f0db648918b6dd9cc881c2e5cdeaee05220d9dec20fd059929ca50d128beb161`
  and census SHA-256
  `ae9e0e828b11489b2ee1972bfb425a34580b172966cdced1ee4dea903d61e742`.
  Both have zero missing emails, duplicate email values and groupless users.
  The contemporaneous webhook inventory contains 22 registrations.
- Minimized evidence: private mode-0600 artifact
  `/Users/xbohdpukc/.local/share/tandem-identity-evidence/NC-20260914-001/heartbeat-main-aggregate-20260914T112922Z.json`
  is 16,797 bytes, file SHA-256
  `4a4d560a26309cf7670e1c478bd8a29ab8bdbfca9f5bf0ff4cf5d6655b6ca24c`
  and canonical artifact SHA-256
  `f6e9e057ea609d3bba25d9aff7b2cd0a4bf22f305a8f510bdf9d00d7a1b69a35`.
  Raw census/webhook intermediates were moved to Trash after minimization.
  Literal inspection retains no group-name, filter, destination, URL,
  password, secret, token or API-key field. Email appears only in aggregate
  zero-quality counters and `containsEmails: false`.
- Implementation: a strict two-census sanitizer, strict import validator,
  host-pinned one-shot CLI, advisory-locked transaction and host-pinned
  read-only production validator. Mini receives no Heartbeat credential and
  runs no recurring provider client.
- Stored state: one complete full run; 79 group fingerprints plus aggregate
  user-set, membership-edge and webhook fingerprints; one aggregate control
  projection; one blocked command; and one unavailable readback. The reason is
  `INDIVIDUAL_IDENTITY_GRAPH_UNAVAILABLE`.
- Forbidden state: importer has no provider client and cannot insert Party,
  reference, auth, resolution or provider-attempt rows. It compares all of
  those plus D2 counts before and after. Migration 167 independently forces
  commands to zero-write/zero-attempt and rejects every attempt insert.
- Focused verification: 3 files/9 tests pass, including real disposable
  PostgreSQL D2-to-D3 import, database-recomputed completion and exact replay
  with zero new rows. Typecheck, build, formatting and documentation continuity
  pass.
- Full verification: 4,407 pass, 32 skip and 19 failures in the same five
  unrelated baseline files as D2; no D3 or identity-control-plane test failed.
- Review: bounded Claude Sonnet/high session
  `ed0bdbcc-6a73-42a3-8b5c-93573b866c92` reported no material finding.
  Measured usage: 7 model calls, 135,768 cache-create, 568,014 cache-read,
  18,208 output tokens and maximum 135,770 context. The context target warning
  is recorded; no second round is warranted. Claude had read-only access to
  eight declared files and could write only its response artifact; it had no
  provider data, credential, Bash, deployment or implementation-edit authority.

Next gate: commit and push the exact source, build and verify a clean immutable
release, revalidate D2 production, acquire narrow database/release leases, take
a protected backup, validate the empty D3 target, deploy, import the still-fresh
artifact once, replay it exactly, compare pre/post protected counts, and release
the leases.

Post-import acceptance exposed one integration-only validator defect: the D2
validator counted projection/command/readback/reconciliation/drift tables
globally, so it rejected D3's authorized `main` rows even though D2's
`community` scope remained exact. The D2 validator now scopes those reads to
Heartbeat production/community while retaining a global zero-attempt check.
The D3 validator now pins the database-recomputed snapshot hash and asserts the
complete protected D2/canonical baseline. Four focused files/12 tests and
typecheck pass. This correction changes read-only acceptance logic only and is
mechanically verified; no second Claude round is warranted.
