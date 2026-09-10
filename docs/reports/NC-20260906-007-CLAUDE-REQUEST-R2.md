# Resolve the R1 capacity-versus-enrollment finding

Fresh bounded Sonnet/high re-review. Read ONLY:
- `docs/reports/NC-20260906-007-CLAUDE-RESPONSE-R1.md`
- `docs/reports/NC-20260906-007-PARTICIPANT-PROOF-EVIDENCE.md`
- `docs/BOOKKEEPER-ENROLLMENT-CONTRACT.md`
- `docs/STUDENT-ENROLLMENT-INGRESS-ADAPTERS.md`

Write `docs/reports/NC-20260906-007-CLAUDE-RESPONSE-R2.md` with remaining
material findings or NO MATERIAL FINDINGS and explain the R1 disposition.
No other reads, Bash/web/MCP, source edits, credentials, real records, or runtime.
At most six tool calls, then write and stop. Do not reopen unrelated code paths.

Codex executed R1's exact counterexample. There are ZERO student enrollments,
entitlements, class assignments and projections, one unassigned seat, one owned
participant_missing exception, and one HELD capacity commitment. No source change
was needed; a regression now explicitly tests every entity/state and occupancy.

The owner-accepted Bookkeeper contract predating this adapter requires that an
independently verified funded class promise stay counted even when participant
identity is unknown. This applies to manual/website/off-platform funding as well
as sponsor slots. Funding commitments are not class assignments or materialized
student enrollments. Discarding verified paid commitments would undercount
capacity and violate the accepted simple-capacity strategy.

R1 correctly noticed the asymmetric proof handling but treated creation of a
funding commitment as student materialization. Its suggestion to suppress the
commitment would weaken the existing accepted policy. The adapter document's
ambiguous phrase "withholds that seat's materialization" has been clarified to
name the blocked student enrollment, entitlement, assignment and projection,
while preserving independently verified funding/class commitments. Invalid
class proof still prevents a new class commitment entirely. Existing enrollment
redelivery protection remains unchanged and passes its regression.

Assess whether the reproduction and accepted contract resolve R1's claimed
material defect. Do not accept Codex's conclusion without comparing the
actual policy and exact entity assertions. If a different policy contradiction
remains, identify it precisely. No new policy decision or runtime activation is
authorized. All work remains local/synthetic and the provider/persistence
boundaries described in the contracts remain explicit.
