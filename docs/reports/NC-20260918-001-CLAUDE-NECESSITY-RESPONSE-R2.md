# NC-20260918-001 necessity review R2 — response

**Verdict: KEEP**

1. **Largest avoidable operational burden:** any alternative that widens Party
   membership, adds a name-to-address resolver, or introduces a CC-exception
   queue. Those require new schema, a maintenance surface, and ongoing false
   positives/negatives. The proposed equality gate needs none of that — it
   reuses the action-bound approval and content hash that already exist.

2. **Smallest feasible path:** change the guard's CC pass condition to accept
   an address when it is present in both the approved card's CC and the
   execution CC (byte-equal list), without requiring that address to satisfy
   Party membership or latest-visible-inbound participation. No new field,
   worker, queue, or dependency. Primary-recipient Party/thread verification,
   BCC prohibition, and the ten-address/uniqueness/non-primary CC constraints
   are unchanged.

3. **Material authority/privacy flaw:** none that changes the verdict. The
   model still cannot invent a recipient — the equality check against the
   human-approved card is what gates every CC address, not just the
   previously-exempted ones. The one residual risk is UX, not authority: if
   the approval card does not visually distinguish an outside-Party CC from
   an in-Party one, an approver could approve an unintended recipient without
   noticing the elevated trust being granted. That belongs in card rendering,
   not in this guard change, and does not block KEEP.
