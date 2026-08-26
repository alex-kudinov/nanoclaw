# NC-20260826-002 — Natural pipeline-bound Sales receipt

Date: 2026-08-26

Program item: `work:sales-lineage-proof`

Change class: C2 content-free evidence and program reconciliation; no customer
or provider action

## Acceptance condition

A natural approved Sales send must leave one automatic, exact pipeline-bound
Gmail interaction receipt without manual recovery.

## Exact natural receipt

The most recent qualifying chain observed read-only in production is:

| Evidence | Value |
| --- | --- |
| approved action | `5b991b38-7625-48db-ae40-f6269877a09f` |
| exact pipeline entry | `1235` |
| approved at | `2026-08-26T15:40:11.281Z` |
| handoff observed | `2026-08-26T15:40:59.753Z` |
| Mailman started | `2026-08-26T15:41:01.416Z` |
| execution started | `2026-08-26T15:41:15.848Z` |
| Gmail message | `1a03ebb9755bdfd1` |
| Gmail result thread | `1a03e2287df449da` |
| confirmed at | `2026-08-26T15:41:16.492Z` |
| PostgreSQL interaction | `3338` |
| PostgreSQL occurred at | `2026-08-26T15:41:16.741563Z` |
| evidence fingerprint | `fb0a580d39f44a22e788efe3ae508da037e5a1456536f192d8fbcc2357a4299e` |

SQLite `pending_sends` records state `confirmed`, every automatic handoff
and execution timestamp, the exact `Lead #1235` reference, Gmail message and
result-thread IDs, completion time, and no error code.

PostgreSQL `business_v2.interactions` independently records the same
pipeline entry `1235`, Gmail message ID, Gmail thread ID, and an outbound
Sales email occurrence immediately after confirmation. The host-derived
pipeline identity therefore survived approval, handoff, Mailman execution,
Gmail acceptance, and business interaction logging without a model-supplied
override.

## Coverage and boundary

The read-only audit returned 20 recent confirmed Sales sends with corresponding
pipeline-bound outbound interaction rows; the exact chain above is sufficient
for the program completion condition.

No message content, subject, recipient, or customer identity was read or
recorded. This task did not draft, approve, send, backfill, recover, replay,
schedule, project a follow-up case, change a provider, or mutate production
runtime/data. The receipts pre-existed this audit and arose from natural work.

## Conclusion

The natural pipeline-bound Sales receipt gate is complete. This closes only the
lineage dependency. `work:followup-lane-activation` remains a separate
candidate requiring a new exact owner authorization before any projection,
presentation, drafting, sending, or scheduling activation.
