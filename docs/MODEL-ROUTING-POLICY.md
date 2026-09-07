# NanoClaw model routing policy

Status: adopted project-local operating policy under `NC-20260907-003`.

This policy assigns strategy and acceptance to Astra, detailed execution to an
explicit Sol High worker, and independent review to Claude Code Sonnet High. It
changes how Codex work is routed. It does not change NanoClaw runtime behavior,
business authority, release gates, or Company OS concurrency.

## Roles

| Responsibility | Default owner |
| --- | --- |
| Clarify intent, settle strategy and architecture, define acceptance | Astra |
| Bound work packets, assign files, resolve consequential ambiguity | Astra |
| Investigate source, implement, document, test, and diagnose failures | Sol High |
| Fix verified review findings and rerun affected checks | The same Sol High worker |
| Review implementation independently against accepted requirements | Claude Code Sonnet, high effort, through `work-with-claude` |
| Inspect decisive evidence and grant internal release acceptance | Astra |
| Run the established commit, release, and live verification sequence | One designated Sol High writer within the task's existing authority |
| Report the final result and remaining owner decisions | Astra |

Astra remains accountable for the result and inspects evidence for load-bearing
decisions. Sol owns the detailed execution slice through verification. Claude's
review is evidence, not action or release authority.

## Dispatch contract

1. Keep the parent strategy task on Astra. Dispatch routine execution with
   `model: "gpt-5.6-sol"`, `reasoning_effort: "high"`, and
   `fork_turns: "none"` plus a self-contained work packet.
2. Use one execution writer. A second child is optional and read-only unless
   Astra assigns genuinely separate files in an isolated worktree.
3. A Sol worker does not create more Codex workers. It may run the required
   bounded Claude review procedure without delegating to another Codex agent.
4. Reuse the same Sol worker for routine corrections on its slice. Start a new
   worker for a materially different slice or after a durable handoff.
5. Every dispatch states the model and effort. Report an unavailable or rejected
   selection; do not silently perform the execution slice on Astra.
6. One Company OS `.program` claim covers Astra and workers on the same slice.
   The project-local child ceiling does not authorize multiple program claims,
   releases, or writers. Resource-scoped concurrent claims remain an unimplemented
   strategy proposal.

The project defaults in [`.codex/config.toml`](../.codex/config.toml) set Sol,
high effort, and a maximum of two child threads. Codex loads project settings
only for a trusted project, and explicit spawn arguments take precedence. The
current task proves an explicit Sol High dispatch. Fresh-task use of these
defaults remains unverified until directly observed. Defaults are defense in
depth; explicit model and effort selection remains required on every dispatch
after that observation. No global configuration or trust setting is changed.

## Reusable worker packet

```text
Outcome: <concrete behavior or artifact to deliver>
Accepted decisions: <authoritative specs and recorded owner corrections>
Starting state: <worktree, branch, base commit, preserved local changes>
Ownership: <files and subsystem this worker may change; protected owners/files>
Bounds: <excluded features/actions; authorized environment and release target>
Acceptance: <positive, negative, and user-visible examples>
Verification: <focused checks, full gates, live/readback evidence if authorized>
Review: Claude Code Sonnet High, bounded and secret-free, using work-with-claude
Stop conditions: <unresolved strategy, missing authority, repeated blocker>
Return: <revision, files, checks, review/corrections, release state, decisions>
```

Packets reference authoritative files instead of copying private conversations.
They never include credentials, raw customer or student records, browser history,
or broad logs. A worker starts read-only, registers non-trivial work, preserves
dirty checkouts, and respects every repository, migration, provider, message,
and release gate.

## Review and release

Use one fresh bounded Claude Sonnet/high review after implementation and focused
verification. Sol checks every finding, fixes verified material defects, reruns
affected checks, and sends load-bearing corrections through review. Astra accepts
the prepared revision only after inspecting the scope, material findings, and
decisive evidence.

Implementation authority includes the project's normal review and release path
only when the task already authorizes that target. Provider writes, student or
financial changes, messages, migrations, credentials, schedules, and other
consequential effects retain their existing explicit gates. A build, push, or
deployment receipt is not live or business-outcome proof.

## Provenance

This policy adapts the hash-verified CoachGrader proposal at
`/Users/xbohdpukc/dev/coach-grader/docs/MODEL_ROUTING_POLICY.md` (SHA-256
`478b36376c451b731dd12d17402a1464a6909060831f6760f99a5541937ce23f`).
That source remained proposed at inspection, although its named pilot had
successfully dispatched a Sol High worker. NanoClaw does not claim the pilot is
complete, its savings are measured, or its project defaults are proven.

Configuration key support comes from the official Codex configuration reference:
`agents.default_subagent_model`,
`agents.default_subagent_reasoning_effort`, and
`agents.max_concurrent_threads_per_session`. The last setting excludes the
parent task.
