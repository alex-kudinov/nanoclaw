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
    expect(prompt.split('\n')).toHaveLength(217);
  });

  it('requires discrepancy notices to use the thread-bound staging tool', () => {
    expect(prose).toContain(
      "Call `mcp__nanoclaw__send_message` with `text` and the triggering message's exact `thread_ts`",
    );
    expect(prose).toContain('do not leave the notice only in final text');
  });

  it('accepts the Module 4 observation form as a container while enforcing live requirements', () => {
    expect(prose).toContain(
      'For `eval-m4`, an ACC Session Observation Form is an accepted submission container',
    );
    expect(prose).toContain(
      'Do not require a separate essay merely because the form was used',
    );
    expect(prose).toContain(
      'including the word floor and the overall 67% assessment',
    );
    expect(prose).toContain(
      'a completed or signed form alone is not sufficient',
    );
  });
});
