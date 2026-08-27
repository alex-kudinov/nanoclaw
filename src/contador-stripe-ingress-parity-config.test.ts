import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');

describe('Contador Stripe ingress parity configuration', () => {
  it('is explicit and default-off in every supported host template', () => {
    for (const relative of [
      '.env.example',
      'launchd/com.nanoclaw.plist',
      'setup/launchd/com.nanoclaw.plist',
      'setup/service.ts',
    ]) {
      const source = fs.readFileSync(path.join(root, relative), 'utf8');
      expect(source, relative).toContain(
        'CONTADOR_STRIPE_INGRESS_PARITY_ENABLED',
      );
      expect(source, relative).toMatch(
        /CONTADOR_STRIPE_INGRESS_PARITY_ENABLED(?:<\/key>\s*<string>|=)0/,
      );
    }
  });

  it('exposes aggregate health without enabling a consumer', () => {
    const indexSource = fs.readFileSync(
      path.join(root, 'src/index.ts'),
      'utf8',
    );
    const paritySource = fs.readFileSync(
      path.join(root, 'src/contador-stripe-ingress-parity.ts'),
      'utf8',
    );
    expect(indexSource).toContain(
      'contadorStripeIngressParity: getContadorStripeIngressParityHealth()',
    );
    expect(paritySource).toContain('consumerEnabled: false');
  });
});
