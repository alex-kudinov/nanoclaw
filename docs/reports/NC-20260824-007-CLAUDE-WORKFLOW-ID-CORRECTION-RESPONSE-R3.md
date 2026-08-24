# NC-20260824-007 workflow-ID correction review R3 — response

## Scope

Reviewed only the five allowed artifacts listed in the request: the request
itself, `setup/n8n/student-lifecycle-community-shadow-workflow.json`,
`src/student-lifecycle-shadow-n8n-contract.test.ts`,
`/private/tmp/toolbox-n8n-lifecycle/shared/n8n/lib/n8n-ssh.sh`, and
`/private/tmp/toolbox-n8n-lifecycle/shared/n8n/tests/test-n8n.sh`. No Bash,
web, MCP, or broad search was used. No implementation files were edited.

## Findings against acceptance criteria

**Exact ID, 1–36 chars, valid under both source contract and guarded
importer/activator.**
`workflow.json` sets `id: "student-lifecycle-community-shadow"` (34
characters). The contract test asserts this exact string
(`expect(workflow.id).toBe(...)`) and a static `expect(workflow.id.length)
.toBeLessThanOrEqual(36)`. The shared toolbox validator
`n8n_validate_workflow_id` in `n8n-ssh.sh` enforces
`^[A-Za-z0-9_-]{1,36}$`, which the 34-character ID satisfies. `test-n8n.sh`
exercises the importer with a 37-character ID and asserts it is rejected
with the same `"workflow id is invalid"` message the shared validator
produces, confirming the importer is wired to this bound.

**No change to nodes, webhook path placeholders, four-action allowlist,
retention, active state, or secrets.**
`workflow.json` contains the same three nodes (webhook trigger, code node,
HTTP request), `active: false`, the `__STUDENT_LIFECYCLE_N8N_WEBHOOK_PATH__`
placeholder in both the `path` and `webhookId` fields, retention settings
(`saveDataErrorExecution`/`saveDataSuccessExecution: "none"`,
`saveExecutionProgress: false`), no `"credentials"` key, and the four-action
allowlist (`USER_JOIN`, `USER_UPDATE`, `COURSE_COMPLETED`, `GROUP_JOIN`)
with the same minimized field lists. All of this matches what the contract
test in scope independently asserts.

**Toolbox regression distinguishes the live length boundary.**
`test-n8n.sh` line 28 tests a 37-character workflow ID — the first invalid
value immediately above the 36-character bound — rather than an arbitrary
oversized string, so the regression is anchored to the actual boundary
rather than a generic "too long" case. The file's own header restricts it to
argument/contract tests with no SSH or n8n calls, so a live positive-path
import at exactly 36 characters is out of scope for this file; the 34-char
production ID is exercised only through the contract test's static
assertions, not through a live importer call. This is consistent with the
stated no-SSH scope of `test-n8n.sh` and not a gap introduced by this
correction.

## Conclusion

NO MATERIAL FINDINGS
