# NC-20260905-010 — Academy capacity prevention first slice

Date: 2026-09-06

The owner confirmed September 7 capacity was 12. Against 21 operational unique
participants, the cohort is oversold by 9; the held 22-seat upper boundary
would be oversold by 10. Company OS evidence and its validator now enforce
capacity 12, zero availability, overage 9/10, and sold-out state.

Tandemweb commit `6509cef2` replaces its unsafe lower owner override. The
reconciler separately adjusts the Stripe floor, then computes occupancy as the
maximum of active roster assignments, adjusted Stripe evidence, and a
nonnegative owner assertion. Owner assertions may raise safety but never hide a
roster assignment. Any owner variance remains `needs_review`.

Claude Sonnet/high returned `NO MATERIAL FINDINGS`. Tandemweb focused tests are
10/10; a current read-only no-Stripe run proves Friday remains 13 occupied
against owner estimate 12 and capacity 12, over by 1, sold out, and needs
review. NanoClaw's combined validator and focused 14/14, typecheck,
continuity/capability, and diff checks pass.

No provider, roster, payment, public website, production database, runtime,
minion, migration, deployment, backfill, communication, or authority-cutover
write occurred. The work item waits on a separate source-repair authorization;
the exact remaining exceptions are the May 27 boundary, 11 Full Program offer
bindings, eight funding gaps, missing combined-program projections, and the
probable Friday MCS origin history.
