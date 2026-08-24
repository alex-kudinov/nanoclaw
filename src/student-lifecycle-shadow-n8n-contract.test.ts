import fs from 'node:fs';
import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

import { STUDENT_LIFECYCLE_SHADOW_ACTIONS } from './student-lifecycle-shadow-manifest.js';
import { verifyCommunityLifecycleSignature } from './student-lifecycle.js';

const workflowPath = new URL(
  '../setup/n8n/student-lifecycle-community-shadow-workflow.json',
  import.meta.url,
);
const raw = fs.readFileSync(workflowPath, 'utf8');
const releaseBuilder = fs.readFileSync(
  new URL('../scripts/build-release.mjs', import.meta.url),
  'utf8',
);
const workflow = JSON.parse(raw) as {
  id: string;
  active: boolean;
  nodes: Array<{
    type: string;
    parameters: Record<string, unknown>;
    retryOnFail?: boolean;
    maxTries?: number;
    waitBetweenTries?: number;
  }>;
  settings: Record<string, unknown>;
};

describe('Community lifecycle four-action shadow workflow', () => {
  it('imports disabled with an opaque-path placeholder and no retained data', () => {
    expect(workflow.id).toBe('student-lifecycle-community-shadow-v1');
    expect(workflow.active).toBe(false);
    expect(raw.match(/__STUDENT_LIFECYCLE_N8N_WEBHOOK_PATH__/g)).toHaveLength(
      2,
    );
    expect(workflow.settings).toMatchObject({
      errorWorkflow: 'shared-error-handler',
      saveDataErrorExecution: 'none',
      saveDataSuccessExecution: 'none',
      saveExecutionProgress: false,
    });
    expect(raw).not.toMatch(/"credentials"\s*:/);
    expect(raw.toLowerCase()).not.toContain('circle');
    expect(releaseBuilder).toContain(
      "'setup/n8n/student-lifecycle-community-shadow-workflow.json'",
    );
    expect(releaseBuilder).toContain(
      "'scripts/render-student-lifecycle-shadow-workflow.mjs'",
    );
  });

  it('admits only the four approved actions and minimizes their fields', () => {
    const code = String(
      workflow.nodes.find((node) => node.type === 'n8n-nodes-base.code')
        ?.parameters.jsCode,
    );
    for (const action of STUDENT_LIFECYCLE_SHADOW_ACTIONS) {
      expect(code).toContain(`${action}:`);
    }
    for (const action of [
      'EVENT_CREATE',
      'EVENT_RSVP',
      'THREAD_CREATE',
      'MENTION',
      'DIRECT_MESSAGE',
      'ABANDONED_CART',
      'DOCUMENT_CREATE',
    ]) {
      expect(code).not.toContain(`${action}:`);
    }
    expect(code).toContain("USER_JOIN: ['id', 'email']");
    expect(code).toContain("COURSE_COMPLETED: ['courseID', 'userID']");
    expect(code).not.toContain('courseName');
    expect(code).not.toContain("'name'");
  });

  it('signs a byte-identical body and retries only the private host hop', () => {
    const code = String(
      workflow.nodes.find((node) => node.type === 'n8n-nodes-base.code')
        ?.parameters.jsCode,
    );
    const run = new Function('$input', '$env', 'require', code) as (
      input: unknown,
      env: Record<string, string>,
      requireFn: NodeRequire,
    ) => Array<{ json: Record<string, string> }>;
    const secret = 'test-only-shadow-relay-secret-at-least-32-chars';
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
        HEARTBEAT_COMMUNITY_ID: '33333333-3333-4333-8333-333333333333',
        STUDENT_LIFECYCLE_RELAY_SECRET: secret,
        STUDENT_LIFECYCLE_HOST_URL: 'https://host.invalid/opaque',
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
      workflow.nodes.find((node) => node.type === 'n8n-nodes-base.httpRequest'),
    ).toMatchObject({
      retryOnFail: true,
      maxTries: 5,
      waitBetweenTries: 5000,
    });
  });
});
