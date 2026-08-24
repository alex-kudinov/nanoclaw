import fs from 'fs';
import { describe, expect, it } from 'vitest';

const config = fs.readFileSync(new URL('./config.ts', import.meta.url), 'utf8');
const envExample = fs.readFileSync(
  new URL('../.env.example', import.meta.url),
  'utf8',
);

describe('Community lifecycle default-off configuration', () => {
  it('loads the relay secret from the host env file and defaults disabled', () => {
    expect(config).toContain("'STUDENT_LIFECYCLE_ENABLED'");
    expect(config).toContain("'STUDENT_LIFECYCLE_WEBHOOK_PATH'");
    expect(config).toContain("'STUDENT_LIFECYCLE_RELAY_SECRET'");
    expect(config).toContain("'STUDENT_LIFECYCLE_IDENTITY_SECRET'");
    expect(config).toContain("'false'");
    expect(envExample).toContain('STUDENT_LIFECYCLE_ENABLED=false');
    expect(envExample).toContain('STUDENT_LIFECYCLE_WEBHOOK_PATH=');
    expect(envExample).toContain('STUDENT_LIFECYCLE_RELAY_SECRET=');
    expect(envExample).toContain('STUDENT_LIFECYCLE_IDENTITY_SECRET=');
  });

  it('fails closed on invalid enable values, predictable paths, or short secrets', () => {
    expect(config).toContain(
      'STUDENT_LIFECYCLE_ENABLED must be true, false, 1, or 0',
    );
    expect(config).toContain(
      "STUDENT_LIFECYCLE_WEBHOOK_PATH.toLowerCase().includes('circle')",
    );
    expect(config).toContain('STUDENT_LIFECYCLE_RELAY_SECRET.length < 32');
    expect(config).toContain('STUDENT_LIFECYCLE_IDENTITY_SECRET.length < 32');
    expect(config).toContain(
      'STUDENT_LIFECYCLE_IDENTITY_SECRET === STUDENT_LIFECYCLE_RELAY_SECRET',
    );
    expect(config).toContain('/^\\/hook\\/[A-Za-z0-9._-]{16,200}$/');
  });

  it('declares no Circle credential, path, enable flag, or runtime setting', () => {
    expect(envExample).not.toMatch(/CIRCLE_(API|WEBHOOK|LIFECYCLE|SECRET)/);
    expect(config).not.toMatch(/CIRCLE_(API|WEBHOOK|LIFECYCLE|SECRET)/);
  });
});
