# NanoClaw instructions for Codex

NanoClaw was developed and is operated primarily through Claude Code. Codex is
an additional collaborator, not a replacement for that operating model.

## Read first

Before investigating or changing this repository, read these in order:

1. `CLAUDE.md` — canonical repository operating instructions.
2. `docs/PROJECT-MAP.md` — verified system map, authority rules, risks, and
   cross-client workflow.
3. The relevant `groups/<group>/CLAUDE.md` for agent behavior changes.
4. The relevant current design or operations document listed in the project
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
nvm use
npm run typecheck
npm test
```

For container-runner changes, also verify its independent package:

```bash
cd container/agent-runner
npm run build
npm test
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
