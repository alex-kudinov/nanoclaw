# NC-20260907-004 checkpoint B1 progress

Captured at: 2026-09-07T18:05:42.859Z

Saved sanitized native Student Roster and Heartbeat main snapshots. The roster read retained metadata, eight structural header rows, and the Product Map A:C mapping only; it read zero student rows. The Heartbeat reads retained IDs, public labels, and course-to-cohort nesting only; they read zero member or progress rows.

Roster: 14 native tabs, 156 Product Map rows, 136 distinct product labels, 17 multi-destination labels, and 0 invalid tab/column targets. Seven rows explicitly use the native `(not a student)` sentinel. The spreadsheet modification timestamp was stable across the bounded read.

Heartbeat main: 101 groups, 40 courses, and 43 course-nested cohorts. Exact current native existence was confirmed for 24/25 catalog-declared group IDs and 20/20 catalog-declared course IDs.

Mismatch: catalog group ID `5c2616f5-3379-4144-bbef-8fc225e701c3` was not returned. A current group named `PCC/MCC Practice Test` has near-match ID `5c2616f5-3379-4144-bbef-8fc746415cdc`; this remains unresolved rather than auto-bound.

Unsupported by these reads: group-to-course attachment, checkout/product identity, purchase, entitlement, membership, progress, dated class assignment, roster population, publication state, and capacity.

Next reads: integrate the separate sanitized Stripe/Plutio snapshot when supplied, then reconcile localized checkout/publishing owners plus curriculum, assessment, schedule, delivery-block, and pool authorities.
