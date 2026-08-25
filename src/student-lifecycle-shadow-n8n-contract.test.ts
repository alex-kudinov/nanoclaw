import fs from 'node:fs';
import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

import { STUDENT_LIFECYCLE_SHADOW_ACTIONS } from './student-lifecycle-shadow-manifest.js';
import {
  prepareCommunityLifecycleEnvelope,
  verifyCommunityLifecycleSignature,
} from './student-lifecycle.js';

const workflowPath = new URL(
  '../setup/n8n/student-lifecycle-community-shadow-workflow.json',
  import.meta.url,
);
const raw = fs.readFileSync(workflowPath, 'utf8');
const codeSource = fs
  .readFileSync(
    new URL(
      '../setup/n8n/student-lifecycle-community-shadow-code.txt',
      import.meta.url,
    ),
    'utf8',
  )
  .trimEnd();
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
const code = String(
  workflow.nodes.find((node) => node.type === 'n8n-nodes-base.code')?.parameters
    .jsCode,
);
const run = new Function('$input', '$env', 'require', code) as (
  input: unknown,
  env: Record<string, string>,
  requireFn: NodeRequire,
) => Array<{ json: Record<string, string> }>;
const secret = 'test-only-shadow-relay-secret-at-least-32-chars';
const runtimeEnv = {
  HEARTBEAT_COMMUNITY_ID: '33333333-3333-4333-8333-333333333333',
  STUDENT_LIFECYCLE_RELAY_SECRET: secret,
  STUDENT_LIFECYCLE_HOST_URL: 'https://host.invalid/opaque',
};

function runBody(body: Record<string, unknown>): Record<string, string> {
  return run(
    { first: () => ({ json: { body } }) },
    runtimeEnv,
    createRequire(import.meta.url),
  )[0].json;
}

describe('Community lifecycle four-action shadow workflow', () => {
  it('imports disabled with an opaque-path placeholder and no retained data', () => {
    expect(workflow.id).toBe('student-lifecycle-community-shadow');
    expect(workflow.id.length).toBeLessThanOrEqual(36);
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
      "'setup/n8n/student-lifecycle-community-shadow-code.txt'",
    );
    expect(releaseBuilder).toContain(
      "'scripts/render-student-lifecycle-shadow-workflow.mjs'",
    );
  });

  it('admits only the four approved actions and minimizes their fields', () => {
    expect(code).toBe(codeSource);
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

  it.each([
    [
      'USER_JOIN',
      {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'fixture@example.invalid',
      },
    ],
    ['USER_UPDATE', { id: '11111111-1111-4111-8111-111111111111' }],
    [
      'GROUP_JOIN',
      {
        userID: '11111111-1111-4111-8111-111111111111',
        groupID: '22222222-2222-4222-8222-222222222222',
      },
    ],
    [
      'COURSE_COMPLETED',
      {
        userID: '11111111-1111-4111-8111-111111111111',
        courseID: '22222222-2222-4222-8222-222222222222',
      },
    ],
  ] as const)(
    'infers a minimal real %s payload without an action marker',
    (action, body) => {
      const envelope = JSON.parse(runBody(body).body_text) as {
        action: { name: string };
        data: Record<string, unknown>;
      };
      expect(envelope.action.name).toBe(action);
      expect(envelope.data).toEqual(body);
      expect(
        prepareCommunityLifecycleEnvelope(
          envelope,
          'test-only-distinct-identity-secret-at-least-32-chars',
        ).prepared.action,
      ).toBe(action);
    },
  );

  it('refuses ambiguous and explicit-mismatch payloads', () => {
    expect(() =>
      runBody({
        id: '11111111-1111-4111-8111-111111111111',
        email: 'fixture@example.invalid',
        userID: '22222222-2222-4222-8222-222222222222',
        groupID: '33333333-3333-4333-8333-333333333333',
      }),
    ).toThrow('unsupported_heartbeat_action');
    expect(() =>
      runBody({
        action: { name: 'USER_UPDATE' },
        data: {
          id: '11111111-1111-4111-8111-111111111111',
          email: 'fixture@example.invalid',
        },
      }),
    ).toThrow('heartbeat_action_payload_mismatch');
  });

  it('signs a byte-identical body and retries only the private host hop', () => {
    const result = runBody({
      userID: '11111111-1111-4111-8111-111111111111',
      groupID: '22222222-2222-4222-8222-222222222222',
    });
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
