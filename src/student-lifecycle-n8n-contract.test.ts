import fs from 'fs';
import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

import {
  prepareCommunityLifecycleEnvelope,
  verifyCommunityLifecycleSignature,
} from './student-lifecycle.js';

const workflowPath = new URL(
  '../setup/n8n/student-lifecycle-community-dark-workflow.json',
  import.meta.url,
);
const raw = fs.readFileSync(workflowPath, 'utf8');
const workflow = JSON.parse(raw) as {
  active: boolean;
  nodes: Array<{
    name: string;
    type: string;
    parameters: Record<string, unknown>;
    retryOnFail?: boolean;
    maxTries?: number;
    waitBetweenTries?: number;
  }>;
  settings: Record<string, unknown>;
};

describe('inactive Community lifecycle n8n export', () => {
  it('is dark, Community-only, and retains no execution payloads', () => {
    expect(workflow.active).toBe(false);
    expect(raw.toLowerCase()).not.toContain('circle');
    expect(workflow.settings).toMatchObject({
      saveDataErrorExecution: 'none',
      saveDataSuccessExecution: 'none',
      saveExecutionProgress: false,
    });
  });

  it('uses runtime references instead of credentials, URLs, IPs, or digests', () => {
    expect(raw).toContain('$env.HEARTBEAT_COMMUNITY_ID');
    expect(raw).toContain('$env.STUDENT_LIFECYCLE_RELAY_SECRET');
    expect(raw).toContain('$env.STUDENT_LIFECYCLE_HOST_URL');
    expect(raw).not.toMatch(/https?:\\?\/\\?\/[A-Za-z0-9]/);
    expect(raw).not.toMatch(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
    expect(raw).not.toMatch(/["'](?:[0-9a-f]{64})["']/i);
    expect(raw).not.toContain('Bearer ');
  });

  it('allowlists all 11 official actions and only their documented fields', () => {
    const code = String(
      workflow.nodes.find((node) => node.type === 'n8n-nodes-base.code')
        ?.parameters.jsCode,
    );
    for (const action of [
      'USER_JOIN',
      'USER_UPDATE',
      'EVENT_CREATE',
      'EVENT_RSVP',
      'THREAD_CREATE',
      'MENTION',
      'DIRECT_MESSAGE',
      'COURSE_COMPLETED',
      'GROUP_JOIN',
      'ABANDONED_CART',
      'DOCUMENT_CREATE',
    ]) {
      expect(code).toContain(`${action}:`);
    }
    expect(code).toContain('unsupported_heartbeat_action');
    expect(code).toContain('payload_too_large');
  });

  it('signs the exact body and uses bounded retry for the private host relay', () => {
    const code = String(
      workflow.nodes.find((node) => node.type === 'n8n-nodes-base.code')
        ?.parameters.jsCode,
    );
    expect(code).toContain("timestamp + '.' + bodyText");
    expect(code).toContain("createHmac('sha256', relaySecret)");
    const relay = workflow.nodes.find(
      (node) => node.type === 'n8n-nodes-base.httpRequest',
    );
    expect(relay).toMatchObject({
      retryOnFail: true,
      maxTries: 5,
      waitBetweenTries: 5000,
    });
  });

  it('produces a body and signature accepted by the host contract', () => {
    const code = String(
      workflow.nodes.find((node) => node.type === 'n8n-nodes-base.code')
        ?.parameters.jsCode,
    );
    const run = new Function('$input', '$env', 'require', code) as (
      input: unknown,
      env: Record<string, string>,
      requireFn: NodeRequire,
    ) => Array<{ json: Record<string, string> }>;
    const secret = 'test-only-relay-secret-at-least-32-characters';
    const result = run(
      {
        first: () => ({
          json: {
            body: {
              action: { name: 'GROUP_JOIN' },
              data: {
                userID: '11111111-1111-4111-8111-111111111111',
                groupID: '22222222-2222-4222-8222-222222222222',
              },
            },
          },
        }),
      },
      {
        HEARTBEAT_COMMUNITY_ID:
          '33333333-3333-4333-8333-333333333333',
        STUDENT_LIFECYCLE_RELAY_SECRET: secret,
        STUDENT_LIFECYCLE_HOST_URL:
          'https://disabled.invalid/private-lifecycle-path',
      },
      createRequire(import.meta.url),
    )[0].json;
    const rawBody = Buffer.from(result.body_text, 'utf8');
    expect(() =>
      verifyCommunityLifecycleSignature({
        rawBody,
        timestampHeader: result.timestamp,
        signatureHeader: result.signature,
        secret,
        nowMs: Number(result.timestamp) * 1000,
      }),
    ).not.toThrow();
    expect(
      prepareCommunityLifecycleEnvelope(JSON.parse(result.body_text), secret)
        .prepared,
    ).toMatchObject({
      workspace: 'community',
      action: 'GROUP_JOIN',
    });
  });

  it('contains no Slack, Encharge, email, certificate, action, or minion node', () => {
    const serialized = raw.toLowerCase();
    for (const forbidden of [
      'slack',
      'encharge',
      'send email',
      'certificate',
      'minion',
      'chat.postmessage',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
