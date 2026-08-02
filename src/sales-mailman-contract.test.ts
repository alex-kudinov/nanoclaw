import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const salesPrompt = fs.readFileSync(
  path.join(root, 'groups', 'sales', 'CLAUDE.md'),
  'utf8',
);
const workflow = fs.readFileSync(
  path.join(root, 'groups', 'sales', 'WORKFLOWS.md'),
  'utf8',
);

describe('Sales to Mailman approval contract', () => {
  it('requires one lead and a successful typed handoff', () => {
    expect(salesPrompt).toContain('One approval turn = one lead');
    expect(salesPrompt).toContain('target_group: "mailman"');
    expect(salesPrompt).toContain('is a delivery failure');
    expect(workflow).toContain(
      'This turn is exclusively for this one approved',
    );
    expect(workflow).toContain(
      'Never print this block as final assistant prose',
    );
  });

  it('forbids fake Thread-ID placeholders', () => {
    expect(salesPrompt).toContain(
      'include the line only when a real Gmail thread ID',
    );
    expect(workflow).toContain('OMIT THIS ENTIRE LINE when none exists');
    expect(workflow).toContain('never use "(none)"');
  });
});
