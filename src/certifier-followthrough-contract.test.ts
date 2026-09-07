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

describe('Gru certificate API follow-through contract', () => {
  it('uses the combined issuance wrapper instead of direct issuance', () => {
    expect(prompt).toContain(
      'ONLY use `issue-and-followthrough.sh` for a Gru-issued certificate',
    );
    expect(steps).toContain(
      'bash /workspace/extra/sertifier/tools/sertifier/issue-and-followthrough.sh',
    );
    expect(steps).not.toContain(
      'bash /workspace/extra/sertifier/tools/sertifier/issue-certificate.sh',
    );
  });

  it('requires independent verified DM and Our Graduates outcomes', () => {
    expect(prompt).toContain(
      'one combined receipt verifies both the direct Heartbeat message and the `Our Graduates` announcement',
    );
    expect(steps).toContain('followthrough.directMessage.verified=true');
    expect(steps).toContain('followthrough.graduateAnnouncement.verified=true');
    expect(steps).toContain('status=issued_followthrough_complete');
    expect(steps).toContain('Neither action uses Browser or Computer Use.');
  });

  it('keeps existing-credential repair explicit and prevents reissuance', () => {
    expect(prompt).toContain('| Follow-through repair |');
    expect(steps).toContain('--mode repair-existing');
    expect(steps).toContain(
      '--confirm REPAIR-EXISTING-CREDENTIAL-FOLLOWTHROUGH',
    );
    expect(steps).toContain('without reissuing');
    expect(steps).toContain('Never delete its durable receipt');
  });

  it('tracks the execution contract in Git', () => {
    expect(
      fs.existsSync(path.join(root, 'groups/certifier/EXECUTION-STEPS.md')),
    ).toBe(true);
    const ignored = fs
      .readFileSync(path.join(root, '.gitignore'), 'utf8')
      .includes('!groups/certifier/EXECUTION-STEPS.md');
    expect(ignored).toBe(true);
  });
});
