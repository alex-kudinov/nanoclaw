# Bounded independent adapter review — response

Reviewed exactly the three listed files. One material finding.

## Finding: invalid participant evidence does not withhold seat materialization when its assignment proof independently verifies (new-order path)

`src/student-enrollment-ingress.ts`, the seat-receipt construction inside
`applyEnrollmentIngress` (lines 416–449):

```ts
const personProof = proof('participant', seat.proofKey, participantRoles, index);
const assignmentProof = seat.assignment
  ? proof('assignment', seat.assignment.proofKey, [...], index)
  : undefined;
if (!personProof) participantEvidenceMissing = true;
if (seat.assignment && !assignmentProof) invalidAssignments.add(index);
const usablePerson = personProof && !invalidAssignments.has(index);
return {
  participantPartyId: usablePerson ? seat.participantPartyId : null,
  participantEvidenceSha256: usablePerson ? personProof.payloadSha256 : null,
  payerRelationship: usablePerson ? seat.payerRelationship : 'unknown',
  assignment:
    seat.assignment && assignmentProof
      ? { poolKey: ..., componentKey: ..., evidenceSha256: assignmentProof.payloadSha256 }
      : null,
};
```

The coupling is one-directional: an invalid **assignment** proof forces
`usablePerson = false` (nulling the participant too, via
`invalidAssignments.has(index)`), but an invalid/missing **participant**
proof does *not* null the assignment. `assignment` is computed purely from
`seat.assignment && assignmentProof`, independent of `personProof`/
`usablePerson`.

For a brand-new order, the only guard against incomplete seat evidence is
lines 451–462:

```ts
if (
  original.enrollment.orders[orderKey] &&
  original.enrollment.evidence[`${orderKey}:admission`]?.evidenceSha256 !== hash(receipt) &&
  (participantEvidenceMissing || invalidAssignments.size > 0)
)
  return quarantine(...)
```

This only fires when `original.enrollment.orders[orderKey]` is already
truthy, i.e. it protects *existing* orders from a bad redelivery. It does
nothing on first admission of a new order. So when a seat's participant
proof fails to verify but its assignment proof independently verifies, the
receipt still carries a live `assignment` (`poolKey`/`componentKey`/
`evidenceSha256`) for that seat on the very first delivery, and that receipt
is passed straight into `applyBookkeeperFundingReceipt` (line 463) with no
quarantine.

Per the predecessor mechanics already verified ("Unnamed seats can retain
actual funded class commitments while valid sponsor slots progress"), the
engine cannot distinguish an intentionally anonymous sponsor slot
(`participantPartyId: null`, no proof ever claimed) from this case — a seat
that *did* name a participant and submit a proof key, whose proof simply
failed to verify. Both collapse to the same shape
(`participantPartyId: null` + populated `assignment`) and the engine
materializes a real capacity reservation/class commitment for it either way.

This contradicts the adapter's own documented contract
(`docs/STUDENT-ENROLLMENT-INGRESS-ADAPTERS.md`, "Aliases, retries and
exceptions" section): *"For a new funding order, invalid participant/class
proof withholds that seat's materialization; other valid sponsor seats may
progress."* An invalid participant proof does not withhold materialization
here — only an invalid assignment proof does. The asymmetry is not
channel-scoped: it applies uniformly to every channel, including
non-sponsor channels (`website_stripe_checkout`, `manual_stripe_payment`,
etc.) where every seat is documented as requiring evidenced participant
identity, not just sponsor cohorts.

### Reproduction (using the test file's own fixtures/helpers)

Mirrors the existing test at lines 379–388
("holds an unverified optional assignment instead of silently granting
nonscheduled access"), but drops the **participant** proof instead of the
**assignment** proof:

```ts
const e = envelope(); // default single seat: participantPartyId 2, proof 'proof:participant:1', assignment w/ proof 'proof:assignment:1'
const h = authority(e);
h.proofs = h.proofs.filter((p) => p.purpose !== 'participant');
const out = run(e, state(), h); // fresh order, no prior state
```

Existing sibling test (assignment dropped instead) asserts
`assignment_evidence_unverified`, zero `enrollments`, zero `projections` —
i.e. the seat is fully withheld. Tracing the code for the case above
(participant dropped, assignment kept): `personProof` is `undefined` →
`participantEvidenceMissing = true`; `assignmentProof` is found and
verifies → `invalidAssignments` stays empty → `usablePerson = false` nulls
only the participant fields, while `assignment` is still populated. No
quarantine guard applies (`original.enrollment.orders[orderKey]` is
undefined for a fresh order), so the receipt reaches
`applyBookkeeperFundingReceipt` with a live class assignment for a seat
whose claimed occupant was never verified — i.e. a capacity
reservation/commitment is created despite failed participant evidence,
rather than the seat being withheld as the sibling (assignment-missing)
test and the doc's stated contract require.

### Suggested direction

Make the coupling symmetric: `assignment` should also require
`usablePerson` unless `seat.assignment` was `null`/absent from the start
(the genuine, intentionally-unnamed sponsor case). E.g. gate the returned
`assignment` on `(!seat.participantPartyId || usablePerson) && assignmentProof`,
or fold participant-evidence failure into `invalidAssignments`/an
equivalent flag so any seat that *claimed* a participant but failed to
verify one is withheld the same way an unverified assignment already is.
