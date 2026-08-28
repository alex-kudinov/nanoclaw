# NC-20260827-004 bounded implementation review — response R1

## Material findings

1. **`docs/RELEASE-INTEGRITY.md` (lines 773–782) misdescribes what the
   verifier's `absent` label actually reports; an operator following this
   text during incident recovery will look for the wrong error.**

   Evidence — `scripts/verify-release.mjs` lines 121–137:

   ```js
   for (const line of fs.readFileSync(fileListPath, 'utf8').split('\n')) {
     ...
     listed.add(match[2]);
     const file = safeBundlePath(root, match[2]);
     if (
       !fs.existsSync(file) ||
       !fs.lstatSync(file).isFile() ||
       sha256(file) !== match[1]
     ) {
       throw new Error(`release bundle file mismatch: ${match[2]}`);
     }
   }
   ...
   const absent = [...listed].filter(
     (relative) => !expectedBundleFiles.includes(relative),
   );
   ```

   Every entry that reaches the `listed` set has already passed
   `fs.existsSync`/`isFile` in the same loop iteration, or the script throws
   `release bundle file mismatch: <name>` immediately and never reaches the
   `unlisted`/`absent` accounting below. So a FILES.sha256 entry that is
   genuinely missing from disk is always reported as `release bundle file
   mismatch: <name>`, never as `inventory mismatch: ... absent=<name>`. The
   `absent` bucket can only be populated by a listed, existing, correctly
   hashed path whose string does not appear in `expectedBundleFiles` — in
   practice the self-referential case of `FILES.sha256` naming itself, or a
   listed/on-disk name differing only in case on a case-insensitive
   filesystem. `release-bundle-verifier.test.ts` correspondingly has no test
   that exercises the doc's claimed "file missing from disk → `absent`"
   scenario, because that scenario is unreachable through that message.

   Verification stays fail-closed either way (acceptance criterion is met),
   but the operational guidance is factually wrong about which message a
   missing inventoried file produces, which will misdirect release-recovery
   troubleshooting under this same authoritative document.

   Minimum required correction: reword `docs/RELEASE-INTEGRITY.md` lines
   773–782 so `absent` is described accurately (a listed inventory entry that
   does not correspond to an enumerated on-disk file by exact name, e.g. a
   stale/duplicate-cased FILES.sha256 self-entry) and note that a genuinely
   missing or modified inventoried file is reported via `release bundle file
   mismatch: <name>` instead. No code change is required for this item.

## Scope confirmation

- `src/logger-path.ts` / `src/logger-path.test.ts`: `resolveJsonlPath`
  correctly walks up from `cwd` to the nearest directory containing
  `RELEASE.json`, `FILES.sha256`, and `dist/release-manifest.json`, disables
  the implicit sink for that root and any descendant, and still honors an
  explicit `NANOCLAW_JSONL_PATH` (including an explicit empty string, per the
  existing convention in `src/logger.ts`). Ordinary operational directories
  (no release markers) are unaffected. Matches acceptance criteria 1–3.
- `src/logger.ts`: pretty stdout/stderr stream is always attached; the file
  stream is added only when `resolveJsonlPath()` returns non-empty. No
  regression to the existing best-effort/never-crash behavior.
- `scripts/verify-release.mjs` / `src/release-bundle-verifier.test.ts`: the
  `unlisted`/`absent` rename is otherwise consistent, and the tested paths
  (unlisted file, unsafe path, symlink, complete bundle) all still fail
  closed as before. No other stale `missing`/`extra` label remains in this
  file.
- `docs/PROJECT-MAP.md` (lines 1829–1834): accurately summarizes the new
  release-aware logger behavior; does not repeat the `unlisted`/`absent`
  claim above and is not implicated by finding 1.
- No new provider, job, payment, communication, credential, or customer
  authority is introduced by any reviewed file.
