import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { CANONICAL_CLASSIFICATION_LABELS } from './classification-policy.js';

const root = process.cwd();
const mailman = fs.readFileSync(
  path.join(root, 'groups/mailman/CLAUDE.md'),
  'utf8',
);
const chief = fs.readFileSync(
  path.join(root, 'groups/chief/CLAUDE.md'),
  'utf8',
);
const retiredChiefDraft = fs.readFileSync(
  path.join(root, 'groups/chief/SUPPORT-REPLY.md'),
  'utf8',
);
const sales = fs.readFileSync(
  path.join(root, 'groups/sales/CLAUDE.md'),
  'utf8',
);
const runner = fs.readFileSync(
  path.join(root, 'container/agent-runner/src/ipc-mcp-stdio.ts'),
  'utf8',
);
const capability = JSON.parse(
  fs.readFileSync(path.join(root, 'capabilities/mailman.json'), 'utf8'),
) as { tools: { mcp: string[] } };
const migration = fs.readFileSync(
  path.join(
    root,
    'data/business/migrations/nanoclaw-v2/141_classification_routing_integrity.sql',
  ),
  'utf8',
);
const ipc = fs.readFileSync(path.join(root, 'src/ipc.ts'), 'utf8');
const releaseBuilder = fs.readFileSync(
  path.join(root, 'scripts/build-release.mjs'),
  'utf8',
);
const normalizedMailman = mailman.replace(/\s+/g, ' ');

describe('Mailman classification contract', () => {
  it('exposes one typed classification action and forbids parallel escalation', () => {
    expect(runner).toContain("'classify_email'");
    expect(capability.tools.mcp).toContain('classify_email');
    expect(normalizedMailman).toContain(
      'call `mcp__nanoclaw__classify_email` exactly once',
    );
    expect(normalizedMailman).toContain('Do not call `send_message`');
    expect(mailman).not.toContain('Write a JSON IPC file');
    expect(ipc).toContain("if (data.type === 'classify_label_write')");
    expect(ipc).not.toContain(
      "data.type === 'classify_label_write' && data.run_id",
    );
  });

  it('keeps the prompt, executable policy, and ordered migration label-complete', () => {
    for (const label of CANONICAL_CLASSIFICATION_LABELS) {
      expect(mailman, label).toContain(`\`${label}\``);
      expect(migration, label).toContain(`'${label}'`);
    }
    expect(releaseBuilder).toContain(
      '141_classification_routing_integrity.sql',
    );
    expect(releaseBuilder).toContain(
      'rollback_141_classification_routing_integrity.sql',
    );
  });

  it('makes Sales the only customer-reply drafting owner', () => {
    expect(chief).toContain('Chief never drafts a customer email.');
    expect(retiredChiefDraft).toContain('Status: retired');
    expect(sales).toContain('[SOURCE: email-support]');
    expect(sales).toContain('Shared Gmail Thread-ID');
  });
});
