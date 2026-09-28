import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, describe, expect, it } from 'vitest';

import { listPromptImports, readGroupPrompt } from './group-prompt.js';

const root = path.resolve(import.meta.dirname, '..');
const dirs: string[] = [];

function groupDir(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'group-prompt-'));
  dirs.push(dir);
  for (const [name, text] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), text);
  }
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true });
});

describe('readGroupPrompt', () => {
  it('inlines whole-line @imports in order and leaves other @ text alone', () => {
    const dir = groupDir({
      'CLAUDE.md': 'top\n@A.md\nmail me @ home\n@B.md\n',
      'A.md': 'alpha',
      'B.md': 'beta',
    });
    expect(readGroupPrompt(dir)).toBe('top\nalpha\nmail me @ home\nbeta\n');
  });

  it('fails loudly on a missing import or a cycle', () => {
    expect(() =>
      readGroupPrompt(groupDir({ 'CLAUDE.md': '@MISSING.md' })),
    ).toThrow();
    expect(() =>
      readGroupPrompt(groupDir({ 'CLAUDE.md': '@A.md', 'A.md': '@CLAUDE.md' })),
    ).toThrow(/cycle/);
  });

  it('keeps the live Sales prompt under 200 lines with every import present', () => {
    const salesDir = path.join(root, 'groups', 'sales');
    const bare = fs.readFileSync(path.join(salesDir, 'CLAUDE.md'), 'utf8');
    expect(bare.split('\n').length).toBeLessThanOrEqual(200);
    const imports = listPromptImports(bare);
    expect(imports).toEqual([
      'OPERATOR-TURNS.md',
      'PROCESSING-PROTOCOL.md',
      'EDGE-CASES-AND-TOOLS.md',
    ]);
    const expanded = readGroupPrompt(salesDir);
    expect(expanded).toContain('### 4. Approval');
    expect(expanded).toContain('## Processing Protocol');
    expect(expanded).toContain('## Edge Cases');
  });
});
