import crypto from 'crypto';
import fs from 'fs';
import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

import {
  prepareWebsiteCheckoutRecoveryEnvelope,
  verifyCheckoutRecoverySignature,
} from './checkout-recovery.js';

const raw = fs.readFileSync(
  new URL(
    '../setup/n8n/checkout-recovery-website-shadow-workflow.json',
    import.meta.url,
  ),
  'utf8',
);
const verifierSource = fs.readFileSync(
  new URL('../setup/n8n/checkout-recovery-website-verify.js', import.meta.url),
  'utf8',
);
const patch = fs.readFileSync(
  new URL('../setup/n8n/checkout-failure-workflow-patch.json', import.meta.url),
  'utf8',
);
const workflow = JSON.parse(raw) as {
  active: boolean;
  settings: Record<string, unknown>;
  nodes: Array<{
    type: string;
    parameters: Record<string, unknown>;
    retryOnFail?: boolean;
    maxTries?: number;
  }>;
};

describe('inactive website checkout recovery relay', () => {
  it('is dark, retention-free, and uses only environment references', () => {
    expect(workflow.active).toBe(false);
    expect(workflow.settings).toMatchObject({
      saveDataErrorExecution: 'none',
      saveDataSuccessExecution: 'none',
      saveExecutionProgress: false,
    });
    expect(raw).toContain('$env.CHECKOUT_RECOVERY_INGRESS_SECRET');
    expect(raw).toContain('$env.CHECKOUT_RECOVERY_RELAY_SECRET');
    expect(raw).toContain('$env.CHECKOUT_RECOVERY_HOST_URL');
    const trigger = workflow.nodes.find(
      (node) => node.type === 'n8n-nodes-base.webhook',
    );
    expect(trigger?.parameters.responseMode).toBe('lastNode');
    expect(trigger?.parameters.options).toMatchObject({ rawBody: true });
    expect(patch).toContain('"rawBody": true');
    expect(raw).not.toMatch(/https?:\\?\/\\?\/[A-Za-z0-9]/);
    expect(raw).not.toMatch(/["'][0-9a-f]{64}["']/i);
  });

  it('verifies ingress and emits a host-accepted bounded envelope', () => {
    const embeddedCode = String(
      workflow.nodes.find((node) => node.type === 'n8n-nodes-base.code')
        ?.parameters.jsCode,
    );
    expect(embeddedCode).toBe(verifierSource);
    const run = new Function('$input', '$env', 'require', verifierSource) as (
      input: unknown,
      env: Record<string, string>,
      requireFn: NodeRequire,
    ) => Array<{ json: Record<string, string> }>;
    const ingressSecret = 'checkout-ingress-test-secret-at-least-32-chars';
    const relaySecret = 'checkout-relay-test-secret-at-least-32-characters';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = {
      schema_version: 1,
      source_event_key: `tw:v1:${'A'.repeat(32)}:captured`,
      event_type: 'checkout.captured',
      observed_at: new Date().toISOString(),
      checkout_token: 'A'.repeat(32),
      email: 'buyer@example.com',
      program_slug: 'acc',
      product_slug: 'acc-full',
      amount_cents: 399900,
      currency: 'usd',
      consent_state: 'denied',
      consent_policy_version: 'checkout-reminder-v2',
      locale: 'en',
      return_url: 'https://tandemcoach.co/acc/?ignored=yes#pay',
      product_name: 'ACC Level 1 Full Program',
      ignored: 'not-forwarded',
    };
    const exactRawBody = JSON.stringify(body).replace(/\//g, '\\/');
    expect(exactRawBody).not.toBe(JSON.stringify(body));
    const ingressSignature = crypto
      .createHmac('sha256', ingressSecret)
      .update(`${timestamp}.${exactRawBody}`, 'utf8')
      .digest('hex');
    const result = run(
      {
        first: () => ({
          json: {
            headers: {
              'x-checkout-timestamp': timestamp,
              'x-checkout-signature': `sha256=${ingressSignature}`,
            },
            body,
            rawBody: exactRawBody,
          },
        }),
      },
      {
        CHECKOUT_RECOVERY_INGRESS_SECRET: ingressSecret,
        CHECKOUT_RECOVERY_RELAY_SECRET: relaySecret,
        CHECKOUT_RECOVERY_HOST_URL: 'https://disabled.invalid/private-path',
      },
      createRequire(import.meta.url),
    )[0].json;
    const rawBody = Buffer.from(result.body_text, 'utf8');
    expect(() =>
      verifyCheckoutRecoverySignature({
        rawBody,
        timestampHeader: result.timestamp,
        signatureHeader: result.signature,
        secret: relaySecret,
        nowMs: Number(result.timestamp) * 1000,
      }),
    ).not.toThrow();
    const parsed = JSON.parse(result.body_text);
    expect(parsed.ignored).toBeUndefined();
    expect(
      prepareWebsiteCheckoutRecoveryEnvelope(parsed, relaySecret).prepared,
    ).toMatchObject({
      stripe_account: 'tandem',
      product_slug: 'acc-full',
      checkout_locale: 'en',
      return_url: 'https://tandemcoach.co/acc/',
      product_name: 'ACC Level 1 Full Program',
    });
    const wrongSignature = crypto
      .createHmac('sha256', ingressSecret)
      .update(`${timestamp}.${JSON.stringify(body)}`, 'utf8')
      .digest('hex');
    expect(() =>
      run(
        {
          first: () => ({
            json: {
              headers: {
                'x-checkout-timestamp': timestamp,
                'x-checkout-signature': `sha256=${wrongSignature}`,
              },
              body,
              rawBody: exactRawBody,
            },
          }),
        },
        {
          CHECKOUT_RECOVERY_INGRESS_SECRET: ingressSecret,
          CHECKOUT_RECOVERY_RELAY_SECRET: relaySecret,
          CHECKOUT_RECOVERY_HOST_URL: 'https://disabled.invalid/private-path',
        },
        createRequire(import.meta.url),
      ),
    ).toThrow(/signature/);
  });

  it('contains no customer action or Encharge node', () => {
    const serialized = raw.toLowerCase();
    for (const forbidden of [
      'send email',
      'encharge',
      'chat.postmessage',
      'recovery.url',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    const relay = workflow.nodes.find(
      (node) => node.type === 'n8n-nodes-base.httpRequest',
    );
    expect(relay).toMatchObject({ retryOnFail: true, maxTries: 5 });
  });
});
