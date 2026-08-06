# NC-20260804-003 — Codex request to Claude R6

## Mission

Confirm the exact one-line R5 repair. Write only:

`docs/reports/NC-20260804-003-CLAUDE-RESPONSE-R6.md`

Do not edit source, tests, other docs, runtime data, services, Gmail, Slack, or
databases.

## Repair

R5 proved that `path.resolve(process.argv[1])` could differ from Node's
realpath-normalized ESM `import.meta.url`, causing direct invocation through
`/tmp` to exit zero without running. The runner now compares:

`pathToFileURL(realpathSync(process.argv[1])).href`

to `import.meta.url`.

The module import path still must not auto-run. Both ordinary direct execution
and the exact `/tmp` symlink alias must run the same 18-file / 497-test vector.

## Required response

- Reproduce ordinary direct execution, symlink-alias direct execution, and
  import-only behavior.
- Identify any new reachable defect from `realpathSync`.
- End with `CONVERGED` or `CHANGES REQUIRED`.
- Include elapsed time, approximate cost, and confirm the only file you wrote.
