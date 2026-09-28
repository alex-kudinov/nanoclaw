/**
 * Read a group's effective prompt the way Claude Code loads it.
 *
 * Group prompts may pull sibling files in with a line that is exactly
 * `@FILE.md` (Claude Code memory imports). The Sales prompt uses this since
 * NC-20260927-001 to stay under the 200-line CLAUDE.md limit while every rule
 * still loads with each run. Tests and release checks that assert prompt
 * content must read the expanded prompt, not the bare CLAUDE.md.
 */

import fs from 'fs';
import path from 'path';

const IMPORT_LINE = /^@([A-Za-z0-9._-]+\.md)\s*$/;
const MAX_DEPTH = 5;

/** Sibling files a prompt imports, in order (one level, no directories). */
export function listPromptImports(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => IMPORT_LINE.exec(line.trim())?.[1])
    .filter((name): name is string => Boolean(name));
}

function expand(filePath: string, depth: number, seen: Set<string>): string {
  const resolved = path.resolve(filePath);
  if (seen.has(resolved)) throw new Error(`prompt import cycle at ${resolved}`);
  if (depth > MAX_DEPTH)
    throw new Error(`prompt imports deeper than ${MAX_DEPTH}`);
  const text = fs.readFileSync(resolved, 'utf8');
  const next = new Set(seen).add(resolved);
  return text
    .split(/\r?\n/)
    .map((line) => {
      const name = IMPORT_LINE.exec(line.trim())?.[1];
      if (!name) return line;
      return expand(path.join(path.dirname(resolved), name), depth + 1, next);
    })
    .join('\n');
}

/** CLAUDE.md with every `@FILE.md` import inlined. Throws on a missing file. */
export function readGroupPrompt(groupDir: string): string {
  return expand(path.join(groupDir, 'CLAUDE.md'), 0, new Set());
}
