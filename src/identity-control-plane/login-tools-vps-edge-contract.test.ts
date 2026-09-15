import fs from 'fs';

import { describe, expect, it } from 'vitest';

const vhost = fs.readFileSync(
  new URL(
    '../../setup/vps/tandem-identity-gateway-vhost.conf',
    import.meta.url,
  ),
  'utf8',
);
const dns = JSON.parse(
  fs.readFileSync(
    new URL(
      '../../setup/vps/tandem-identity-gateway-dns.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

describe('Tandem Identity VPS edge contract', () => {
  it('uses one dedicated hostname and the existing proxied n8n runtime', () => {
    expect(dns).toEqual({
      kind: 'cloudflare_dns_record',
      schemaVersion: 1,
      zone: 'tandemcoach.co',
      type: 'CNAME',
      name: 'identity-gateway',
      content: 'webhooks.tandemcoach.co',
      proxied: true,
      ttl: 1,
    });
    expect(vhost).toContain('<address>127.0.0.1:5678</address>');
    expect(vhost).toContain('<uri>/webhook/tandem-identity-binding-v1</uri>');
  });

  it('enforces 4 KiB before proxying and reuses the wildcard certificate', () => {
    expect(vhost).toContain('<maxReqBodyLen>4096</maxReqBodyLen>');
    expect(vhost).toContain(
      '<keyFile>/etc/letsencrypt/live/tandemcoach.co/privkey.pem</keyFile>',
    );
    expect(vhost).toContain(
      '<certFile>/etc/letsencrypt/live/tandemcoach.co/fullchain.pem</certFile>',
    );
    expect(vhost).not.toMatch(/100\.115\.|authorization|secret|credential/i);
  });
});
