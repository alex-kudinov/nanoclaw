# NanoClaw instructions for Codex

NanoClaw was developed and is operated primarily through Claude Code. Codex is
an additional collaborator, not a replacement for that operating model.

## Read first

Before investigating or changing this repository, read these in order:

1. `CLAUDE.md` — canonical repository operating instructions.
2. `docs/PROJECT-MAP.md` — verified system map, authority rules, risks, and
   cross-client workflow.
3. `docs/ACTIVE-WORK.md` — current work, owners, overlap, and exact next steps.
4. `docs/CHANGE-PROTOCOL.md` — shared task, documentation, verification, and
   handoff contract.
5. The latest relevant entries in `docs/ENGINEERING-CHANGELOG.md`.
6. The relevant `groups/<group>/CLAUDE.md` for agent behavior changes.
7. The relevant current design or operations document listed in the project
   map.

Treat `.claude/skills/*/SKILL.md` as canonical procedures even when Codex does
not expose the corresponding Claude slash command. Follow the procedure
manually and preserve its safety checks.

## Source authority

- Running code, database schemas, and tests describe implemented mechanics.
- `groups/<group>/CLAUDE.md` describes that agent's intended behavior and
  approval boundary.
- `CLAUDE.md` describes repository-wide operating rules.
- `docs/PROJECT-MAP.md` reconciles those sources and records known drift.
- Design documents, archived handoffs, backups, generated files, and local
  runtime databases are evidence, not automatically current authority.

When sources disagree, do not silently choose one. Verify the implementation,
state the discrepancy, and update all authoritative surfaces in the same
change when authorized.

## Safety and change discipline

- Start unfamiliar work read-only. Check `git status` before editing.
- Preserve all pre-existing working-tree changes. This repository commonly
  carries operational work that is not yet committed.
- Never print, copy, commit, or summarize secret values. Treat `.env*`, OAuth
  files, session directories, browser profiles, database dumps, and local MCP
  settings as sensitive.
- Keep tracked schema references structure-only. Never publish live sample rows
  or customer/operational content as “schema documentation.”
- Inspect the actual schema before querying a database. `store/messages.db` is
  SQLite; business data is PostgreSQL. Do not use the legacy business SQLite
  model.
- Do not perform production writes, send messages/email, approve drafts,
  change schedules, rotate credentials, or deploy unless the user explicitly
  asks for that state change.
- Preserve container isolation and host-side enforcement. An agent prompt is
  not a security boundary.
- Use the Node version pinned by `.nvmrc` and rebuild native dependencies for
  that version before interpreting database-test failures.
- Use `apply_patch` for hand edits. Keep generated/runtime state out of source
  changes.

## Verification

For ordinary TypeScript changes, run the narrow tests first, then:

```bash
./scripts/with-pinned-node.sh node --version
npm run typecheck
npm test
```

For container-runner changes, also verify its independent package:

```bash
./scripts/with-pinned-node.sh npm --prefix container/agent-runner run build
./scripts/with-pinned-node.sh npm --prefix container/agent-runner test
```

Container, channel, database, webhook, scheduler, and outbound-action changes
require the focused checks described in `docs/PROJECT-MAP.md`. Never describe a
deployment as successful from a build alone; verify the service, health,
channel, and relevant side effect.

## Documentation contract

Keep Claude and Codex aligned. When a change alters architecture, operations,
group behavior, schemas, setup, or safety controls, update the corresponding
source of truth plus `docs/PROJECT-MAP.md`. Do not fork `CLAUDE.md` into a
Codex-only copy.

For every non-trivial change:

- create or continue an `NC-YYYYMMDD-NNN` entry in `docs/ACTIVE-WORK.md` before
  the first edit;
- confirm required migrations, group procedures, and other authoritative files
  are Git-trackable before relying on them;
- check active entries for overlapping files or external systems;
- follow the documentation impact matrix in `docs/CHANGE-PROTOCOL.md`;
- keep the entry current through implementation, validation, handoff, and
  deployment;
- append factual evidence to `docs/ENGINEERING-CHANGELOG.md` at the
  review/commit/release boundary;
- distinguish uncommitted, committed, migrated, deployed, live-verified, and
  outcome-validated states.

If another Codex or Claude Code session could not resume from tracked files
without reading this conversation, the work is not properly handed off.

Run `npm run docs:continuity-check` before handoff; CI runs the same check.
