import fs from 'fs';
import { describe, expect, it } from 'vitest';

const prompt = fs.readFileSync(
  new URL('../groups/cnpc/CLAUDE.md', import.meta.url),
  'utf8',
);
const registration = fs.readFileSync(
  new URL('../scripts/register-cnpc.ts', import.meta.url),
  'utf8',
);

describe('CNPC minion prompt contract', () => {
  it('uses the canonical Gru identity and a deterministic first response', () => {
    expect(prompt).toContain(
      'You are Gru, acting as the CNPC Intake Coordinator',
    );
    expect(prompt).toContain('Your FIRST action on every invocation');
    expect(prompt).toContain('[CNPC PROCESSING]');
  });

  it('accepts only the host-provided pool and returns a validated machine result', () => {
    expect(prompt).toContain(
      'only if that exact coach is in the host-provided pool',
    );
    expect(prompt).toContain('<cnpc_match_result>');
    expect(prompt).toContain('The host rejects invented coach IDs');
  });

  it('keeps email, Plutio, and hard capacity commitment blocked', () => {
    expect(prompt).toContain('You have no direct Gmail, Plutio');
    expect(prompt).toContain('[CNPC ACTION BLOCKED]');
    expect(prompt).toContain(
      'A hard slot is not consumed until contract signature and payment are confirmed',
    );
    expect(prompt).not.toContain('mcp__nanoclaw__gmail_send');
    expect(prompt).not.toContain('mcp__nanoclaw__gmail_reply');
  });

  it('registers an isolated webhook final-output boundary', () => {
    expect(registration).toContain("folder: 'cnpc'");
    expect(registration).toContain("context_mode: 'isolated'");
    expect(registration).toContain('suppress_output: true');
    expect(registration).toContain('CNPC_INTAKE_WEBHOOK_SECRET');
    expect(registration).not.toMatch(/clientsecret\s*[:=]\s*['"][^'"]+/i);
  });
});
