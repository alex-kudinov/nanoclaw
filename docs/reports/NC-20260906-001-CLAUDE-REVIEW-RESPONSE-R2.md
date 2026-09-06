# NC-20260906-001 — graduate announcement correction review R2 response

## Scope

Reviewed only the two files listed in the R2 request packet:

1. `/private/tmp/toolbox-graduate-announcements/shared/sertifier/tools/sertifier/announce-graduate.sh`
2. `/private/tmp/toolbox-graduate-announcements/shared/sertifier/tests/test-announce-graduate.sh`

No other files, credentials, or external systems were inspected.

## Correction 1 — duplicate-guard anchoring

`announce-graduate.sh:134-135` now searches for `href="<registrar URL>"` (open
quote before, close quote after the URL), not the bare URL. Because the close
quote is part of the search pattern, a stored anchor for `CERT-1234` cannot
satisfy a search built from `CERT-123` (the character after `CERT-123` in the
stored content is `4`, not `"`), and the reverse direction (stored `CERT-1`
vs. searched `CERT-123`) fails the same way. This correctly closes the prefix
collision. `test-announce-graduate.sh:131-134` (`prefix_collision` scenario,
existing thread anchored on `CERT-1234`, evaluated credential `CERT-123`)
exercises exactly this case and asserts `dry_run` with zero `PUT` calls; the
exact-match case is covered separately by the `duplicate` scenario
(`test-announce-graduate.sh:126-129`). Both pass by inspection of the mock
harness and script logic. **No defect.**

## Correction 2 — certificate-number gate and HTML-escaping

`announce-graduate.sh:87-88` restricts `certificate_number` to RFC 3986
unreserved characters (`[A-Za-z0-9._~-]+`) before it is ever interpolated into
`registrar_url` (line 131), so no HTML-significant character (`&`, `<`, `>`,
`"`, `'`) can reach the attribute value through that field. `html_escape` is
additionally applied to `registrar_url` before it goes into the anchor
(`safe_registrar_url`, lines 153-154), and the escaping order (`&` first, then
`<`/`>`/`"`) avoids double-escaping. This is defense in depth and is
implemented correctly. **No code defect.**

## Material finding: invariant 3 is unverified by the regression suite

Required invariant "Provider-derived certificate-number content cannot break
the link attribute" is enforced only by static code (the character-class gate
and `html_escape`). No scenario in `test-announce-graduate.sh` exercises a
`certificateNO` value containing an HTML-significant character. The mock
`curl` (`test-announce-graduate.sh:50`) hard-codes `certificateNO` to
`CERT-123` in every scenario, including the three negative-path scenarios
tested at lines 136-141 (`private`, `chat_channel`, `invalid_png`).

Consequence: if the character-class gate at `announce-graduate.sh:87-88` were
ever weakened, removed, or reordered relative to `registrar_url` construction,
no test in this suite would fail. The suite currently proves the gate exists
by reading the script, not by exercising it. Recommend adding a
`MOCK_SCENARIO` (e.g. `unsafe_cert_number`) that returns a `certificateNO`
containing `"` or `<` and asserts the script fails with `PERMISSION`/exit 1,
mirroring the pattern already used for `private`/`chat_channel`/`invalid_png`.

## Invariant checklist

- Exact prior post → `already_announced`, no PUT: verified (code + test).
- Prefix-collision post → not `already_announced`, no PUT in dry-run: verified (code + test).
- Provider-derived certificate-number content cannot break the link attribute: verified in code only — **not covered by a regression test** (see finding above).
- Dry-run and live-confirmation behavior unchanged: verified (code + test, both paths present and unmodified in relevant respects).
