# NC-20260918-001 necessity review R2

Return one verdict: `KEEP`, `DEFER`, `REMOVE`, or `OWNER`. Then give only:

1. the largest avoidable operational burden;
2. the smallest feasible path; and
3. any material authority/privacy flaw that changes the verdict.

Do not inspect any other file. This packet is complete.

Observed production behavior: an exact human-approved email card carried
`Cc: cherie@tandemcoach.co`, but the final Gmail recipient guard blocked it
because Cherie was neither part of the customer's Party, a configured sending
mailbox, nor visible on the latest inbound message. Gmail was not called.

Existing mandatory controls:

- one exact operator-visible card;
- one explicit human approval and one Action-ID;
- stored/execution To, ordered Cc, subject, body, and thread equality;
- bare CC addresses only, unique, not the primary recipient, maximum ten;
- BCC forbidden;
- primary recipient Party/thread verification;
- exact content hash, one-time execution, and Gmail receipt.

Proposed minimum change: once the existing action-bound approved CC equals the
execution CC, permit that exact list without Party membership or latest-visible
Gmail participation. Keep every control above. Update Sales/Mailman instructions
to allow an operator-directed exact address beyond Reply-All-Candidates. Do not
add name-to-address resolution.

Operational-obligation delta: none. No schema, migration, durable field, worker,
queue, scheduler, dependency, tool, or second send path. No customer or test
email is authorized for verification.

Removing the action/card equality would enable model-invented recipients and is
not proposed. Retaining latest-visible membership makes the owner's explicit CC
instruction impossible.

Write only
`/Users/xbohdpukc/dev/NanoClaw/.worktrees/owner-directed-cc-20260918/docs/reports/NC-20260918-001-CLAUDE-NECESSITY-RESPONSE-R2.md`.

