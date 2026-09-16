import fs from 'fs';

import { describe, expect, it } from 'vitest';

const rulePath = new URL(
  '../../setup/vps/cloudflare-tandem-identity-gateway-rule.json',
  import.meta.url,
);
const rule = JSON.parse(fs.readFileSync(rulePath, 'utf8'));

describe('Tandem Identity Cloudflare edge contract', () => {
  it('blocks non-POST or bodies over 4 KiB only on the exact gateway path', () => {
    expect(rule).toEqual({
      kind: 'cloudflare_custom_rule',
      schemaVersion: 1,
      zone: 'tandemcoach.co',
      phase: 'http_request_firewall_custom',
      description: 'Tandem Identity gateway exact POST and 4 KiB request bound',
      expression:
        'http.host eq "webhooks.tandemcoach.co" and http.request.uri.path eq "/webhook/tandem-identity-binding-v1" and (http.request.method ne "POST" or http.request.body.size gt 4096)',
      action: 'block',
      enabled: true,
    });
  });

  it('contains no credential, dynamic target, or broad-host match', () => {
    expect(JSON.stringify(rule)).not.toMatch(
      /token|secret|credential|api[_-]?key|100\.115\./i,
    );
    expect(rule.expression).not.toContain('http.host contains');
    expect(rule.expression).not.toContain('http.request.uri.path contains');
  });
});
