# NC-20260913-001 review disposition R2

Status: all material findings resolved mechanically

Claude Sonnet/high found no D0 mechanism defect. Its two material findings and
three minor findings were all missing replay-fixture coverage:

| Finding | Disposition |
| --- | --- |
| Weak/rejected authenticity untested | R17-R18 prove unverified exact refs never resolve and rejected authenticity stops |
| Both reducer conflict branches untested | R19-R20 prove conflicting transport duplicate and same-version/different-hash holds |
| Tombstone, accepted-subject and merge-cycle conflicts untested | R21-R23 prove null-Party conflict outcomes |
| Manifest scope/entity/event mismatch untested | R24-R26 prove exact rejection codes |
| Duplicate snapshot fact untested | R27 proves rejection |
| Parallel `evaluateProofCase` divergence risk | removed; proof cases use resolver plus `proofActionFromDecision` only |

Pinned Node 22.23.2 focused result after correction: 47/47. Replay result:
12/12 proof, 27/27 failure, zero provider/Party/access writes. The corrections
add tests/remove dead logic only around already-reviewed mechanisms, so a
ceremonial second review round is not required.

Review session: `f8964047-dd86-451e-a776-5bdcedb7e412`. The response artifact
exists; the shared usage reporter has no persisted transcript for this forced
account, so numeric usage is unavailable rather than zero.
