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
    for (const key of [
      'CHECKOUT_RECOVERY_SEND_MODE',
      'CHECKOUT_RECOVERY_SEND_ACTIVATED_AT',
      'CHECKOUT_RECOVERY_PILOT_EMAIL_SHA256',
      'CHECKOUT_RECOVERY_PILOT_TOUCH2_DELAY_MINUTES',
      'ENCHARGE_WRITE_KEY',
    ]) {
      expect(config).toContain(`'${key}'`);
      expect(envExample).toContain(`${key}=`);
    }
    expect(envExample).toContain('CHECKOUT_RECOVERY_SEND_MODE=off');
  });

  it('fails closed on delivery without cutoff, key, base control, or pilot digest', () => {
    expect(config).toContain(
      'CHECKOUT_RECOVERY_SEND_MODE must be off, pilot, or production',
    );
    expect(config).toContain(
      'checkout recovery sends require checkout recovery enabled',
    );
    expect(config).toContain(
      'checkout recovery sends require an ISO activation cutoff',
    );
    expect(config).toContain(
      'checkout recovery sends require an Encharge write key',
    );
    expect(config).toContain(
      'pilot checkout recovery sends require an email digest',
    );
    expect(config).toContain(
      'pilot checkout recovery sends require a touch-two delay from 1 to 60 minutes',
    );
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
