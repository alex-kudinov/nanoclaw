import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const prompt = fs.readFileSync(
  path.join(root, 'groups/certifier/CLAUDE.md'),
  'utf8',
);
const steps = fs.readFileSync(
  path.join(root, 'groups/certifier/EXECUTION-STEPS.md'),
  'utf8',
);

describe('Certifier canonical campaign prompt contract', () => {
  it('treats campaigns as preset-owned versioned containers', () => {
    expect(prompt).toContain('| `icf-competencies` |');
    expect(prompt).toContain('versioned canonical Sertifier campaign');
    expect(prompt).toContain('Individual issuance NEVER creates a campaign');
    expect(prompt).toContain(
      'Gru never invents, creates, selects, or passes a campaign ID',
    );
    expect(prompt).not.toContain('Each issuance creates its own campaign');
    expect(steps).toContain('Pending scripts never contain');
    expect(steps).toContain('`--campaign-id`');
  });

  it('gives exact campaign-send grammar precedence over bare send', () => {
    expect(prompt).toContain(
      'test the exact Explicit campaign send grammar before the generic Send/Cancel bucket',
    );
    expect(prompt).toContain('prepare-send-command.sh --text');
    expect(prompt).toContain('send ai for coaches to person@example.com');
    expect(steps).toContain('runs before generic bare-`send` handling');
    expect(steps).toContain('attributes_required');
  });

  it('fails identity and uncertain provider outcomes closed', () => {
    expect(steps).toContain('case-insensitive');
    expect(prompt).toContain('requires one nonblank exact result');
    expect(prompt).toContain('AWAITING_NAME');
    expect(prompt).toContain('issued_pending_reconciliation');
    expect(prompt).toContain('pending/uncertain/');
    expect(steps).toContain('explicit send not retained');
    expect(steps).toContain('never retry');
  });

  it('reports duplicate and delivery outcomes truthfully', () => {
    expect(prompt).toContain('`already_issued` means no add/no resend');
    expect(prompt).toContain('`issued` also requires `emailConfirmed:true`');
    expect(steps).toContain('duplicate-safe no-op');
    expect(steps).toContain(
      'Campaign ID, API acceptance, or `emailRequested:true` alone is not',
    );
  });
});
