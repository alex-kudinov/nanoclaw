import fs from 'fs';
import { describe, expect, it } from 'vitest';

const config = fs.readFileSync(new URL('./config.ts', import.meta.url), 'utf8');
const envExample = fs.readFileSync(
  new URL('../.env.example', import.meta.url),
  'utf8',
);

describe('checkout recovery default-off configuration', () => {
  it('declares an opaque path and separate relay/identity secrets', () => {
    for (const key of [
      'CHECKOUT_RECOVERY_ENABLED',
      'CHECKOUT_RECOVERY_WEBHOOK_PATH',
      'CHECKOUT_RECOVERY_RELAY_SECRET',
      'CHECKOUT_RECOVERY_IDENTITY_SECRET',
    ]) {
      expect(config).toContain(`'${key}'`);
      expect(envExample).toContain(`${key}=`);
    }
    expect(envExample).toContain('CHECKOUT_RECOVERY_ENABLED=false');
  });

  it('fails closed on invalid enable, predictable path, short or reused secrets', () => {
    expect(config).toContain(
      'CHECKOUT_RECOVERY_ENABLED must be true, false, 1, or 0',
    );
    expect(config).toContain('CHECKOUT_RECOVERY_RELAY_SECRET.length < 32');
    expect(config).toContain('CHECKOUT_RECOVERY_IDENTITY_SECRET.length < 32');
    expect(config).toContain(
      'CHECKOUT_RECOVERY_IDENTITY_SECRET === CHECKOUT_RECOVERY_RELAY_SECRET',
    );
    expect(config).toContain('/^\\/hook\\/[A-Za-z0-9._-]{16,200}$/');
  });

  it('states shadow-only authority and no customer-send grant', () => {
    expect(envExample).toContain('grants no customer-send');
    expect(envExample).toContain(
      'never reuse the relay or WordPress ingress secret',
    );
  });
});
