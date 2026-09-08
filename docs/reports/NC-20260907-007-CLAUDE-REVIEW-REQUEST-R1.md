# NC-20260907-007 bounded implementation review

## Objective

Review the implemented source-scoped v2 student-catalog publication and
Contador resolver extension for the current ALT MCS checkout product/default
price pair. Report only material correctness, regression, authority, or release
defects. Do not restate the design or propose a broader backlog.

## Authority and accepted design

The accepted owner decision is
`.program/decisions/decision-mcs-catalog-publication-expansion-2026-09-07.json`.
The current website `mcs-full` source is one active USD 2,997 program enrollment,
three monthly USD 999 obligations, no direct full-payment Price ID, and required
`mcs-practicum` delivery-cohort context. The exact managed native pair is ALT
product `prod_Uk2OvW03ZwxmAj` plus its active monthly default price
`price_1TkYJfA7hTBWpVVqm502swAb`. The installment count is source agreement
policy; native recurrence does not create three orders or seats.

The scoped resolver profile qualifies ALT MCS as managed when the admitted
price is present, or when the exact offer key is present with no price IDs.
A qualified incomplete context or unknown companion conflicts. ALT product-only
context, or ALT product plus only unlisted prices, retains Product Map legacy
behavior unless a known account/offer contradiction exists. Primary
`mcs-full`/`prod_UWzqD2zowB8apy` is an explicit legacy scope, including
incomplete or unlisted-price history without a proved conflict. Known
wrong-account IDs and mixed known offers must hold. With an in-account managed
match plus a wrong-scope companion, preserve v1
`product_identity_conflict`; use `product_identity_scope_conflict` only when no
in-account managed match exists.

Both supervision routes and every existing resolved, conflict, incomplete,
scope, projection, and unrelated legacy outcome must remain unchanged. The
website remains independent of a live NanoClaw call. Bundle inclusion,
conditional components, earned-on-completion certificates, Heartbeat existence,
attachment, learner access, progress, class assignment, completion, payer,
participant, receipt, cohort assignment, and program enrollment remain distinct.

## Review evidence

Read only these artifacts:

1. This request.
2. `/tmp/NC-20260907-007-REVIEW.diff` — complete load-bearing NanoClaw,
   Tandemweb, and isolated Toolbox code diff with one line of context.
3. `/tmp/NC-20260907-007-MANIFEST-CONTEXT.json` — minimized manifest sources,
   MCS relationships, resolution profiles, and holds.
4. `/tmp/NC-20260907-007-MANIFEST-CONTEXT.tandem.json` — minimized generated
   Tandemweb v2 payload.
5. `docs/reports/NC-20260907-007-MCS-SOURCE-EVIDENCE.json` — privacy-safe native
   product/default-price/group/roster-structure evidence and the explicit
   unverified historical-price-population limit.
6. `facts/generated/student-product-bindings-v2.scoped.json` — exact runtime
   consumer artifact.

The isolated Toolbox branch is `codex/stripe-get-price-20260907` at
`b461f3cccfcf`; its clean three-commit diff is included in the review diff.
The primary Toolbox checkout was already heavily dirty; only
`shared/stripe/registry.json`, `shared/stripe/lib/stripe-api.sh`, and the new
`shared/stripe/tools/stripe/get-price.sh` are in this task's evidence. The
operation returns public Price catalog fields only and no customer, payment,
subscription, or credential data.

## Verification already completed

- Nano focused resolver/publication/payment/release checks: 64 passing.
- Nano typecheck passes under pinned Node 22.23.2.
- Deterministic cross-repository generation/check passes: three population
  keys, three managed routes, one primary legacy scope; Nano artifact SHA-256
  `d5efce40…4599`; Tandem artifact SHA-256 `ac3c03f2…b589`.
- Tandem publication validator: 19 passing and exact CLI receipt.
- Tandem installment 11/11, cohort checkout 16/16, regional pricing 95/95, and
  design-system asset gate pass.
- Toolbox strict registry validation, help, invalid-ID refusal, and exact ALT
  price read pass. No product-wide or historical-price completeness is claimed.

## Non-objectives and forbidden actions

Do not inspect credentials, `.env`, auth stores, customer/student/payment
population, private endpoints, or unrelated dirty files. Do not run Bash, web,
MCP, provider calls, tests, commits, pushes, deployment, or any business write.
Do not alter source files. Write only the response path below.

## Response

Write `docs/reports/NC-20260907-007-CLAUDE-REVIEW-RESPONSE-R1.md`. List material
findings in consequence order with exact file/evidence references. If there are
no material findings, write `NO MATERIAL FINDINGS` and briefly name the checked
invariants. Treat cosmetic preferences and already declared coverage limits as
non-findings.
