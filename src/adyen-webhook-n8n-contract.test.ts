import fs from 'fs';

import { describe, expect, it } from 'vitest';

const workflowPath = new URL(
  '../setup/n8n/adyen-test-payments-workflow.json',
  import.meta.url,
);
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

describe('Adyen TEST n8n relay contract', () => {
  it('has a stable importable identity and stays inactive', () => {
    expect(workflow.id).toBe('adyen-test-payments');
    expect(workflow.id).toMatch(/^[A-Za-z0-9_-]{1,36}$/);
    expect(workflow.active).toBe(false);
  });

  it('relays the notification body before acknowledging it', () => {
    const webhook = workflow.nodes.find(
      (node: { name: string }) => node.name === 'Adyen TEST Webhook',
    );
    const relay = workflow.nodes.find(
      (node: { name: string }) => node.name === 'Relay to NanoClaw',
    );
    const response = workflow.nodes.find(
      (node: { name: string }) => node.name === 'Respond Accepted',
    );

    expect(webhook.parameters).toMatchObject({
      httpMethod: 'POST',
      path: 'adyen-test-payments',
      responseMode: 'responseNode',
      options: { rawBody: true },
    });
    expect(relay.parameters).toMatchObject({
      method: 'POST',
      url: 'http://100.115.115.206:8088/hook/adyen-test-payments',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ JSON.stringify($json.body || $json) }}',
    });
    expect(response.parameters).toMatchObject({
      respondWith: 'text',
      responseBody: '[accepted]',
      options: { responseCode: 202 },
    });
    expect(workflow.connections['Adyen TEST Webhook'].main[0][0].node).toBe(
      'Relay to NanoClaw',
    );
    expect(workflow.connections['Relay to NanoClaw'].main[0][0].node).toBe(
      'Respond Accepted',
    );
  });

  it('stores neither execution payloads nor credentials', () => {
    expect(workflow.settings).toMatchObject({
      saveDataErrorExecution: 'none',
      saveDataSuccessExecution: 'none',
      saveManualExecutions: false,
      saveExecutionProgress: false,
    });
    expect(JSON.stringify(workflow)).not.toMatch(
      /"credentials"|api[_-]?key|client[_-]?secret|authorization/i,
    );
  });
});
