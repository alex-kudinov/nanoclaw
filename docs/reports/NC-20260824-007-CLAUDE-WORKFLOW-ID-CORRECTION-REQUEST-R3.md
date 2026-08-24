# NC-20260824-007 workflow-ID correction review R3

## Objective

Review one load-bearing correction discovered by the first live inactive n8n
import. n8n 2.9.4 refused the reviewed workflow ID
`student-lifecycle-community-shadow-v1` because its database column is
`varchar(36)`. The import failed before creation and the target remains absent.

The correction shortens the exact workflow ID to
`student-lifecycle-community-shadow` (34 characters), adds a static `<= 36`
contract assertion, and narrows the shared guarded toolbox validator from 200
to 36 characters with a regression test. Report material findings only. Do not
reopen the previously accepted lifecycle or checkout-recovery design.

## Allowed artifacts

1. This request.
2. `setup/n8n/student-lifecycle-community-shadow-workflow.json`.
3. `src/student-lifecycle-shadow-n8n-contract.test.ts`.
4. `/private/tmp/toolbox-n8n-lifecycle/shared/n8n/lib/n8n-ssh.sh`.
5. `/private/tmp/toolbox-n8n-lifecycle/shared/n8n/tests/test-n8n.sh`.

Do not read any secrets, rendered workflow, environment, databases, dumps, or
other repository files. Do not use Bash, web, MCP, or broad search. Do not edit
implementation files.

## Acceptance

- Exact ID is 1-36 characters and valid under both the source contract and the
  guarded importer/activator.
- The correction does not change workflow nodes, webhook path placeholders,
  four-action allowlist, retention, active state, or secrets.
- The toolbox regression distinguishes the live length boundary.

Write only
`docs/reports/NC-20260824-007-CLAUDE-WORKFLOW-ID-CORRECTION-RESPONSE-R3.md`.
End with `NO MATERIAL FINDINGS` or the unresolved material findings.
