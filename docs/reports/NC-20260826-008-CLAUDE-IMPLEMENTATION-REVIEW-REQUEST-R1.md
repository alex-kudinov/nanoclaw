# NC-20260826-008 — bounded implementation review R1

Review mode: independent bounded review, Claude Sonnet/high.

## Objective

Review the default-off Plutio coaching-engagement adapter, its integration into
the all-Party client projection, and the shared safe-dotenv repair for material
authority, identity, privacy, freshness, pagination, idempotency, failure-
isolation, credential, startup, or release defects.

Write the response only to:

`docs/reports/NC-20260826-008-CLAUDE-IMPLEMENTATION-RESPONSE-R1.md`

Do not edit implementation, tests, authority docs, configuration, Git, or
runtime state. Do not use Bash, web, MCP, provider access, `.env`, credential/
auth/token stores, local databases, or unrelated files.

## Authority and accepted facts

Authority order:

1. `.program/decisions/decision-relationship-context-plutio-engagement-enrichment-2026-08-26.json`
2. the accepted Relationship Context rules summarized here
3. implementation and tests

Accepted facts that must not be reopened:

- Exact base/live release is two-parent merge
  `55efd52fb9919c98e75d41d7a6f200fa4ef87ef2`, which preserves NC-006.
- Current NC-006 projection is healthy at 1,437/1,437 active Parties, 62 paid
  customers, five active subscriptions, nine unproven client labels, version-1
  zero-change replay, and query off/zero grants.
- Complete read-only MCP discovery found 117 projects, 183 contracts, and eight
  exact project custom-field definitions. Fifty-nine projects have nonempty
  accepted coaching fields: 11 In progress, 41 Completed, five Canceled, two
  New. They contain 52 person/eight company links.
- The 11 In-progress projects cover 11 distinct provider clients through nine
  person/three company links with one overlap.
- The Party graph has 1,365 exact Plutio person refs and zero exact Plutio
  company refs. Company links must hold; no name/email matching is allowed.
- Of 131 signed contracts, 109 link to a returned project and 22 do not.
  Contract signatures/signees cannot independently identify the participant.
- Plutio contact presence, project name/title, price, invoice, proposal, task,
  note, activity, recorded role, or payment alone cannot prove active coaching
  engagement.
- No migration is needed; migration 137 already owns observations/projections/
  registrations/merge lineage/admin-only permissions.
- Runtime/group query consumers remain disabled. No Plutio/provider/customer
  write or credential change is authorized.

## Allowed read paths

1. this request
2. `.program/decisions/decision-relationship-context-plutio-engagement-enrichment-2026-08-26.json`
3. `src/relationship-context-plutio-engagement.ts`
4. `src/relationship-context-client-projection.ts`
5. `src/relationship-context-store.integration.test.ts`
6. `src/plutio-cli.ts`
7. `/private/tmp/toolbox-plutio-dotenv.jXD5Kr/shared/plutio/lib/auth.sh`
8. `/private/tmp/toolbox-plutio-dotenv.jXD5Kr/shared/plutio/tests/test-auth-env.sh`

The named response is the only allowed write path.

## Implementation map

- Shared toolbox local commit
  `922b7feab7a99022410a1971891bfe795e2db231` replaces whole-file shell sourcing
  with literal import of only `PLUTIO_ENV_FILE`, `PLUTIO_API_CLIENTID`,
  `PLUTIO_API_CLIENTSECRET`, and `PLUTIO_SUBDOMAIN`. The pointer must be absolute
  and readable; process values win. Tests include shell metacharacters,
  unrelated command substitution non-execution, fallback, precedence, and
  invalid pointer refusal. The toolbox repository has no configured remote.
- `plutio-cli.ts` adds only list-projects/contracts/custom-fields to the
  existing read-only allowlist; writes still hit action safety before child
  invocation.
- Provider reads use complete keyset-by-skip pages (100 rows, 50-page cap),
  unique bounded IDs, exact eight-field definition authority, and in-memory
  minimization before any database transaction.
- A project qualifies only from one or more nonempty accepted custom-field
  values; raw values are discarded. Status mapping is In progress=current,
  Completed=historical, New=planned, Canceled/Cancelled=canceled, else unknown.
- Signed contracts add only a project-corroboration boolean.
- Company/malformed/missing-exact-person links do not emit facts. Person links
  resolve via the existing exact `(plutio,primary,person)` ref; facts are written
  under isolated adapter source scope `primary-engagement` and contain only
  controlled values.
- The client projection selects the latest fact per Party/project. Current
  engagement requires `fresh_until > run_at`; stale current evidence is
  explicit and non-authorizing. Completed evidence is historical. Precedence is
  active coaching, paid customer, historical coaching, recorded labels,
  unknown.
- The adapter flag is separately default-off. Host wiring is fire-and-forget,
  overlap-guarded, unref'ed, aggregate-only, and `consumerEnabled=false`.

## Evidence already produced

- shared toolbox safe-env tests pass; shared Plutio registry validates; exact
  repaired helper is installed locally with backups; project MCP read succeeds;
- live provider normalization through the new code returns complete 117/183/8,
  131 signed/22 unlinked, 59 coaching projects, 52 person/eight company links;
- pinned Node 22.23.2 focused Plutio/relationship/wiring: 23/23 pass;
- typecheck passes;
- disposable PostgreSQL: 6/6, including exact person refs, company/missing
  holds, current/historical/planned/canceled, freshness expiry, registration,
  duplicate replay, aggregate projection, merge/scale continuity, and privacy;
- no Mini/toolbox/provider/database/host release/configuration/customer action
  has occurred.

Full root, runner, continuity, secret/diff checks, commit/release, and deployment
are intentionally after this review.

## Review questions

1. Can project/custom-field/status/client parsing create a false active or
   historical coaching claim, silently omit malformed provider rows, or trust
   an unstable provider field?
2. Is pagination actually complete and safe under provider mutations, page
   caps, duplicates, timeouts, or partial sibling calls?
3. Can a company, missing person, changed client link, merge, duplicate project,
   stale project, reopened project, or removed project retain/misplace authority?
4. Is signed-contract corroboration semantically and mechanically safe, and are
   22 unlinked signed contracts truthfully held?
5. Can source watermarks/freshness/upserts churn versions, fail to refresh, or
   make exact replay claims false?
6. Can any fact/projection/health/log/receipt/toolbox error expose names, custom
   values, signatures, IDs in values, credentials, or provider payloads?
7. Does the literal dotenv loader preserve exact values and avoid all shell/
   path/override/symlink/injection hazards? Does the lack of toolbox remote make
   the deployment/rollback contract incomplete?
8. Can the read-only tool additions bypass action safety or invoke provider
   writes?
9. Are startup, adapter isolation, health, off-first release, external toolbox
   dependency, and rollback claims supported by code/tests?
10. Do tests miss a material failure, transition, scale, privacy, or concurrency
    case?

## Response contract

Report material findings only, ordered by consequence. For each give severity,
exact file/evidence, causal failure mode, smallest safe correction, and an
acceptance test. If there are no material findings, write exactly
`NO MATERIAL FINDINGS` plus at most one short paragraph naming load-bearing
paths checked. Do not provide a speculative backlog, style comments, broad
restatement, or authorization for provider/customer actions.
