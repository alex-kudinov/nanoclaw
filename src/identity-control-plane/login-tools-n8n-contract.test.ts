import fs from 'fs';

import { describe, expect, it } from 'vitest';

const workflowPath = new URL(
  '../../setup/n8n/tandem-identity-binding-workflow.json',
  import.meta.url,
);
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

const node = (name: string) =>
  workflow.nodes.find((candidate: { name: string }) => candidate.name === name);

const runAdmission = (input: unknown) => {
  const code = node('Transport Admission').parameters.jsCode;
  return new Function('$input', code)({
    first: () => ({ json: input }),
  });
};

describe('Tandem Identity n8n relay contract', () => {
  it('is one stable inactive exact POST webhook', () => {
    expect(workflow).toMatchObject({
      id: 'tandem-identity-binding-v1',
      active: false,
    });
    expect(node('Identity Webhook').parameters).toEqual({
      httpMethod: 'POST',
      path: 'tandem-identity-binding-v1',
      responseMode: 'responseNode',
      options: {},
    });
  });

  it('admits only determinate JSON bodies no larger than 4 KiB', () => {
    const body = {
      kind: 'tandem_identity_binding_lookup',
      schemaVersion: 1,
      projectId: 'tandem-identity-dev-2026',
      uid: 'pilot-uid',
    };
    const serialized = JSON.stringify(body);
    const admitted = runAdmission({
      headers: {
        authorization: 'Bearer unchanged-sentinel',
        'content-length': String(Buffer.byteLength(serialized)),
        'content-type': 'application/json',
      },
      body,
    });
    expect(admitted).toEqual([
      {
        json: {
          route: 'forward',
          authorization: 'Bearer unchanged-sentinel',
          body,
        },
      },
    ]);

    expect(
      runAdmission({
        headers: {
          'content-type': 'application/json',
          'transfer-encoding': 'chunked',
        },
        body,
      }),
    ).toEqual([
      {
        json: {
          route: 'reject',
          statusCode: 411,
          responseBody: { error: 'content_length_required' },
        },
      },
    ]);
    expect(
      runAdmission({
        headers: {
          'content-length': '4097',
          'content-type': 'application/json',
        },
        body,
      }),
    ).toMatchObject([{ json: { route: 'reject', statusCode: 413 } }]);
    expect(
      runAdmission({
        headers: {
          'content-length': '10',
          'content-type': 'application/json',
        },
        body: { value: 'x'.repeat(5000) },
      }),
    ).toMatchObject([{ json: { route: 'reject', statusCode: 413 } }]);
  });

  it('forwards only to the fixed Mini route and preserves downstream status', () => {
    expect(node('Relay to Company OS').parameters).toMatchObject({
      method: 'POST',
      url: 'http://100.115.115.206:8088/identity/v1/binding',
      sendHeaders: true,
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ JSON.stringify($json.body) }}',
      options: {
        timeout: 2000,
        response: {
          response: {
            fullResponse: true,
            neverError: true,
            responseFormat: 'json',
          },
        },
      },
    });
    expect(
      node('Relay to Company OS').parameters.headerParameters.parameters,
    ).toEqual([
      { name: 'Authorization', value: '={{ $json.authorization }}' },
      { name: 'Content-Type', value: 'application/json' },
    ]);
    expect(node('Return Company OS Response').parameters).toMatchObject({
      respondWith: 'json',
      responseBody: '={{ JSON.stringify($json.body) }}',
      options: { responseCode: '={{ $json.statusCode }}' },
    });
  });

  it('persists no execution data or credentials', () => {
    expect(workflow.settings).toMatchObject({
      saveDataErrorExecution: 'none',
      saveDataSuccessExecution: 'none',
      saveManualExecutions: false,
      saveExecutionProgress: false,
      executionTimeout: 10,
    });
    expect(workflow.settings).not.toHaveProperty('errorWorkflow');
    expect(
      JSON.stringify(node('Return Transport Rejection').parameters),
    ).not.toMatch(/authorization/i);
    expect(
      runAdmission({
        headers: {
          'content-length': '4097',
          'content-type': 'application/json',
          authorization: 'Bearer rejection-sentinel',
        },
        body: {},
      }),
    ).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          json: expect.objectContaining({ authorization: expect.anything() }),
        }),
      ]),
    );
    expect(JSON.stringify(workflow)).not.toMatch(
      /"credentials"|api[_-]?key|client[_-]?secret|shared[_-]?secret/i,
    );
  });
});
