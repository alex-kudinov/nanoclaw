# NC-20260918-001 Polish attestation necessity checkpoint

## Current observable result and authority

Production release `3dd0eb671203f6f25bbd87afe7f97eeb911dac39` accepts one
optional privileged `submission_language=it` field on the existing
main/chief-only grader-file IPC. The host binds it to the exact Slack root
before that root is persisted, includes it in request identity, stores it only
in bounded in-memory run context, and leaves the registered course locale and
feedback language unchanged.

Michał Bloch is registered in the English `foundation` / `en-US` course. His
current `facilitation-m6` file contains a Polish original plus an English
parallel section. The grader correctly refused both the unattested root and a
later authenticated Slack owner reply because chat text is not the host trust
channel. No verdict was produced or persisted.

Applicable constraints: preserve exact-root host authority, original-language
primary evidence, English student-facing feedback, idempotency, bounded TTL,
and fail-closed behavior. Do not add a generic language override, infer from
file content, trust Slack prose, route to a nonexistent Polish course variant,
or make certificate decisions.

Required evidence class now: tested source plus an immutable deployed release,
verified health identity, a newly staged `pl`-attested copy of the same file,
and an explicit grader verdict on that new root.

## Operational-obligation delta

Proposed change: add `pl` beside `it` in the existing closed
`GraderSubmissionLanguage` enum and the toolbox argument validator/help/tests.
No new state or topology is introduced. The same privileged route, exact-root
map, request hash, receipt conflict behavior, TTL, prompt block, deployment,
and recovery obligations remain.

If the enum addition is removed, Polish-original submissions remain held. If
the assertion is delayed until after root persistence or moved into Slack chat,
the grader can race without trusted context or accept an untrusted override.
If generalized beyond the exact enum, the host could authorize unsupported
languages without a reviewed policy.

## Next falsifiable proof and bounded work

Bounded work is limited to the existing language enum/validator, adjacent
tests, discovery text, grader behavior documentation, continuity records, and
the shared Heartbeat grading skill wording. The next proof is that `pl` passes
through toolbox IPC into `<submission_language>pl</submission_language>`, `de`
still fails before external action, omitted language behaves unchanged, and a
new Polish-attested root grades the original while returning English feedback.

## Reviewer question

Return exactly one of `KEEP`, `DEFER`, `REMOVE`, or `OWNER`. Identify the
largest avoidable burden and propose a smaller feasible path if one exists.
Do not broaden into a course-wide multilingual policy or future roadmap.
