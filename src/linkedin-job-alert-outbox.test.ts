import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  captureLinkedInJobAlert,
  extractLinkedInAlertLeads,
  LinkedInAlertCaptureError,
} from './linkedin-job-alert-outbox.js';

const directories: string[] = [];
const trustedHeaders = [
  {
    name: 'Authentication-Results',
    value:
      'mx.google.com; dkim=pass header.i=@linkedin.com; dmarc=pass header.from=linkedin.com',
  },
];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('LinkedIn native job-alert outbox', () => {
  it('extracts canonical deduplicated job pointers from HTML and plain text', () => {
    const leads = extractLinkedInAlertLeads(
      `<a href="https://www.linkedin.com/comm/jobs/view/12345?trackingId=x">VP, Engineering</a>
       <span>Acme · United States (Remote)</span>
       <a href="https://www.linkedin.com/jobs/view/vp-engineering-12345/?trk=email">View job</a>
       <a href="https://www.linkedin.com/jobs/view/67890?trk=email">Head of Platform</a>
       <span>Example Corp · Remote</span>`,
      'Backup https://www.linkedin.com/jobs/view/67890?from=email',
    );

    expect(leads).toHaveLength(2);
    expect(leads[0]).toMatchObject({
      linkedinJobId: '12345',
      linkedinUrl: 'https://www.linkedin.com/jobs/view/12345',
      title: 'VP, Engineering',
    });
    expect(leads[0].context).toContain('Acme');
    expect(leads[1]).toMatchObject({
      linkedinJobId: '67890',
      linkedinUrl: 'https://www.linkedin.com/jobs/view/67890',
      title: 'Head of Platform',
    });
  });

  it('writes one private immutable envelope and replays idempotently', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'linkedin-alert-outbox-'));
    directories.push(root);
    const outboxDir = path.join(root, 'outbox');
    const input = {
      gmailMessageId: '18f00abc123',
      gmailThreadId: '18f00abc999',
      observedAt: '2026-09-15T22:00:00.000Z',
      senderEmail: 'jobalerts-noreply@linkedin.com',
      subject: 'New jobs for VP Engineering',
      body: 'VP Engineering at Acme',
      html: `<a href="https://www.linkedin.com/jobs/view/12345?trackingId=secret">VP Engineering</a><span>Acme · Remote</span>`,
      rawHeaders: trustedHeaders,
      outboxDir,
    };

    const created = captureLinkedInJobAlert(input);
    expect(created).toMatchObject({
      matched: true,
      captured: true,
      duplicate: false,
    });
    expect(created.path).toBeTruthy();
    expect(statSync(outboxDir).mode & 0o777).toBe(0o700);
    expect(statSync(created.path!).mode & 0o777).toBe(0o600);
    const persisted = JSON.parse(readFileSync(created.path!, 'utf8'));
    expect(persisted).toEqual(created.envelope);
    expect(JSON.stringify(persisted)).not.toContain('trackingId=secret');
    expect(JSON.stringify(persisted)).not.toContain(input.body);

    const replay = captureLinkedInJobAlert(input);
    expect(replay).toMatchObject({
      matched: true,
      captured: true,
      duplicate: true,
    });
    expect(replay.path).toBe(created.path);
  });

  it('does not capture spoofed or unrelated mail and holds trusted format drift', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'linkedin-alert-outbox-'));
    directories.push(root);
    const base = {
      gmailMessageId: '18f00abc123',
      gmailThreadId: '18f00abc999',
      observedAt: '2026-09-15T22:00:00.000Z',
      subject: 'New jobs',
      body: '',
      html: '<p>No recognized job links</p>',
      outboxDir: path.join(root, 'outbox'),
    };

    expect(
      captureLinkedInJobAlert({
        ...base,
        senderEmail: 'newsletter@example.com',
        rawHeaders: [],
      }),
    ).toEqual({ matched: false, captured: false, duplicate: false });
    expect(
      captureLinkedInJobAlert({
        ...base,
        senderEmail: 'jobalerts-noreply@linkedin.com',
        rawHeaders: [
          {
            name: 'Authentication-Results',
            value: 'mx.google.com; dmarc=fail header.from=linkedin.com',
          },
        ],
      }),
    ).toEqual({ matched: true, captured: false, duplicate: false });
    expect(() =>
      captureLinkedInJobAlert({
        ...base,
        senderEmail: 'jobalerts-noreply@linkedin.com',
        rawHeaders: trustedHeaders,
      }),
    ).toThrow(LinkedInAlertCaptureError);
  });
});
