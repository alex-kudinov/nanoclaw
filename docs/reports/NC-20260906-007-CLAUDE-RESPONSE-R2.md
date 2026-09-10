# Bounded re-review of R1's claimed material finding — response

Reviewed exactly the four listed files. NO MATERIAL FINDINGS. R1's finding is
resolved by the accepted contract clarification plus the reproduced evidence;
no code or policy defect remains.

## Disposition of R1

R1 flagged asymmetric coupling in `applyEnrollmentIngress`'s seat-receipt
construction: an invalid **assignment** proof nulls both participant and
assignment fields, but an invalid **participant** proof only nulls the
participant fields, leaving `assignment` (poolKey/componentKey/evidenceSha256)
populated. R1 read this against the adapter doc's then-ambiguous phrase
"invalid participant/class proof withholds that seat's materialization" and
concluded the seat's capacity reservation/class commitment was wrongly
materialized on a first delivery with no participant proof.

That phrase has since been clarified in
`docs/STUDENT-ENROLLMENT-INGRESS-ADAPTERS.md`, "Aliases, retries and
exceptions":

> For a new funding order, invalid participant proof withholds the student's
> enrollment, entitlements, class assignment and roster projection. An
> independently verified funded class commitment remains counted even for a
> named participant whose identity proof fails; this is funding/seat-pool
> evidence, not an assigned student. This applies to every payment channel,
> not just anonymous sponsor slots. Suppressing that verified commitment
> would undercount an actual paid promise. Invalid class proof prevents even
> the class commitment; other valid sponsor seats may progress.

`docs/BOOKKEEPER-ENROLLMENT-CONTRACT.md` states the same requirement from the
funding side: "It counts through the delivery block end, even if the
participant is still unknown. No temporary checkout hold is created," and "A
failed seat materialization is rolled back while its genuine funding
commitment stays counted."

The independently executed reproduction in
`docs/reports/NC-20260906-007-PARTICIPANT-PROOF-EVIDENCE.md` confirms the code
matches this clarified policy exactly, with zero source changes: dropping only
the participant proof yields `disposition: 'held'`, reason
`participant_missing`, zero `enrollments`/`entitlements`/`assignments`/
`projections`, a seat left `{ participantPartyId: null, state: 'unassigned' }`,
and exactly one capacity reservation `{ channel: 'commitment', state: 'held' }`
counted against inventory. This is precisely: student materialization
withheld, funding/seat-pool commitment preserved. R1's own cited sibling case
(invalid assignment proof) still yields zero commitment, consistent with
"invalid class proof prevents even the class commitment."

R1's suggested fix — gating `assignment` on `usablePerson` — would suppress
the verified capacity commitment whenever participant proof fails, which is
exactly the outcome the accepted contract forbids ("Suppressing that verified
commitment would undercount an actual paid promise"). Applying it would
create a new policy violation, not fix one.

## Remaining check: is the "assignment" field being conflated with a class assignment?

R1's underlying concern — that a seat-receipt field named `assignment`
might silently produce a materialized student class assignment without
verified participant identity — does not hold up against the evidence.
`out.enrollment.assignments` (the canonical materialized class assignment
aggregate) is empty; only `out.capacity.reservations` (the funding/seat-pool
commitment) is populated. The seat receipt's `assignment` sub-object supplies
pool/component identity for the capacity commitment, not a student class
assignment — those are different aggregates, and the doc is explicit that
"Funding commitments are not class assignments or materialized student
enrollments." No conflation exists in the observed behavior.

## Conclusion

R1 correctly identified real, non-obvious asymmetric code behavior. Its
characterization of that behavior as a contract violation does not survive
comparison against the accepted contract (as clarified) and the reproduced
entity/state assertions. No different policy contradiction was found within
the four documents reviewed. No new policy decision, code change, or runtime
activation is proposed or authorized by this response.
