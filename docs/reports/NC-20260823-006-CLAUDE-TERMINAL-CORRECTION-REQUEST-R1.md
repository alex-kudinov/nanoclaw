# NC-20260823-006 bounded terminal-state correction review R1

## Review contract

Review the current working-tree implementation for material defects only.
Write findings to:

`docs/reports/NC-20260823-006-CLAUDE-TERMINAL-CORRECTION-RESPONSE-R1.md`

Do not edit implementation or any other file. Do not use Bash, web, MCP,
credentials, `.env`, logs, databases, provider systems, or unrelated files.
Report only material findings ordered by consequence, with exact file/line
evidence and a concrete correction. If none, write `NO MATERIAL FINDINGS`.

The bounded source set is larger than the ordinary eight-file target because
one failure crosses an inline database constraint, host validation/finalization,
an exact repair CLI, immutable packaging, and their direct tests. Do not expand
beyond these files:

- `data/business/migrations/nanoclaw-v2/139_contador_charge_alias_compatibility.sql`
- `data/business/migrations/nanoclaw-v2/rollback_139_contador_charge_alias_compatibility.sql`
- `src/contador-payment-fulfillment-store.ts`
- `src/contador-payment-fulfillment-store.test.ts`
- `src/stripe-payment-host.ts`
- `src/stripe-payment-host.test.ts`
- `src/contador-payment-fulfillment-terminalize-cli.ts`
- `src/contador-payment-fulfillment-terminalize-cli.test.ts`
- `src/contador-payment-terminal-case-migration.test.ts`
- `scripts/build-release.mjs`
- `package.json`
- this request

## Authority and accepted facts

The existing accepted Contador boundary is host-admitted Stripe payment/refund
events only. Each admitted event must become verified complete or a durable
owned terminal exception. Contador is operational fulfillment, not accounting;
Bizmgr owns accounting and QuickBooks stays manual.

Natural evidence on exact live release `6a978328` proved one admitted course
payment complete in one attempt with all stage receipts. It also found:

- two cases still `processing` from August 25–26 with expired leases;
- version/attempt pairs 3/4 and 2/3;
- each has admission receipts only;
- their exact n8n inbox rows dead-lettered after five attempts with bounded
  `invalid_charge_alias`;
- current code/schema accepted `ch_` charge aliases only, while current Stripe
  charge tooling accepts `ch_` and `py_` objects.

The owner authorized this exact correction:

1. support legitimate `ch_` and `py_` charge-object aliases while preserving
   all other typed validation;
2. prevent processor/contract failure from returning to retry after a durable
   terminal exception is recorded;
3. terminalize exactly the two proven expired cases host-side with truthful
   failed-stage/final receipts and no external replay;
4. independently review, verify, package, migrate, deploy, and live-check.

Explicitly unauthorized: replaying provider events; repairing the separate
missed-ingress payment; any Stripe/n8n/Sheet/roster/`public.payments`/payment-
processor call from the repair; product/student redesign; refund closure;
customer communication; accounting/QuickBooks; credentials; ingress-parity
activation; unrelated runtime behavior.

## Implemented mechanics

- Migration 139 replaces only the alias-ID check with the `py_` addition.
- Rollback 139 refuses while a `py_` charge alias exists and deletes nothing.
- Runtime alias validation accepts `ch_`/`py_` for kind `charge`.
- Processor aliases are prevalidated before finalization.
- Processor execution/contract failure finalizes `write_failed` with bounded
  failed-stage receipts and returns a held result so webhook handling can bind
  the owned exception instead of retrying it.
- Terminalizer CLI is dry-run by default and requires repeated
  `--case id:version:attempt`; applied mode processes one bounded transaction.
- Every selected case must exist, match version/attempt, still be `processing`,
  and have an expired lease. A mismatch aborts the batch. Exact repeat after
  terminalization is a no-op.
- Terminalization writes verified source-at-admission, failed Payment Log/
  PostgreSQL/roster-or-refund receipts, then terminal final exception; clears
  lease, sets one-day review deadline, preserves original source-observed time,
  and calls no external system.
- Release builder explicitly binds migration/rollback 139; the CLI is compiled
  into `dist` and exposed by a package script.

## Verification already passed

- format and TypeScript typecheck;
- build;
- focused host/store/source/webhook/reaper/safety/migration/CLI: 123/123;
- disposable PostgreSQL: migrations 133/139, `py_` acceptance, two-case dry
  run/apply, two terminal cases and five receipts each, exact replay no-op,
  version refusal, rollback refusal with `py_`, rollback success after removal;
- disposable database removed;
- no production mutation during implementation.

## Material questions

1. Can any processor/alias error still strand a case or cause external-write
   replay after a terminal exception exists?
2. Are `py_` support and rollback constraint changes typed, minimal, and safe?
3. Can the exact terminalizer mutate an active, drifted, wrong, missing, broad,
   or partially accepted batch?
4. Are its receipts and timestamps truthful, idempotent, privacy-minimized, and
   transactionally atomic?
5. Is any external/provider/payment/Sheet/roster/refund/communication action
   reachable from the terminalizer?
6. Are migration/rollback/CLI files guaranteed to enter the immutable release?
7. Do tests miss a load-bearing negative or replay path that could invalidate
   deployment or exact two-case production terminalization?
