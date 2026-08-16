import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('grader feedback prompt contract', () => {
  const prompt = fs.readFileSync(
    path.join(ROOT, 'groups', 'grader', 'CLAUDE.md'),
    'utf8',
  );
  const prose = prompt.replace(/\s+/g, ' ');

  it('separates a genuine developmental point without forcing one', () => {
    expect(prose).toContain(
      'begin the developmental point after a blank line in paragraph two',
    );
    expect(prose).toContain('never invent a grow merely to fill the shape');
    expect(prose).toContain('If it does not, use one paragraph');
    expect(prose).toContain('Do not label either paragraph');
    expect(prose).toContain(
      'vary the wording instead of substituting a new fixed bridge',
    );
    expect(prose).not.toContain('vary the shape');
    expect(prompt.split('\n')).toHaveLength(201);
  });

  it('keeps minor refinements out of NO PASS and holds a third rejection', () => {
    expect(prose).toContain(
      'NO PASS only when an explicit assignment requirement is missing, materially incomplete, wrong, or still open from a prior attempt',
    );
    expect(prose).toContain(
      'a refinement to already adequate work is a PASS Grow',
    );
    expect(prose).toContain(
      'newly noticed minor issues are grows, not new fail criteria',
    );
    expect(prose).toContain(
      'third NO PASS for the exact student and assignment',
    );
    expect(prose).toContain(
      'produce no staging unit, persist nothing, and wait for human review',
    );
  });
});
