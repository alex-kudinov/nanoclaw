import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

import { initDatabase, setRegisteredGroup } from './db.js';
import { readEnvFile } from './env.js';
import type { WebhookDefinition } from './types.js';
import { CNPC_INTAKE_WEBHOOK_ID } from './cnpc-intake.js';

export const CNPC_CHANNEL_ID_RE = /^C[A-Z0-9]+$/;

export function registerCnpcRuntime(
  channelId: string,
  webhookSecret: string,
  runtimeRoot = process.cwd(),
): { jid: string; webhooksPath: string } {
  if (!CNPC_CHANNEL_ID_RE.test(channelId)) {
    throw new Error('CNPC Slack channel ID is invalid');
  }
  if (webhookSecret.length < 32) {
    throw new Error(
      'CNPC_INTAKE_WEBHOOK_SECRET must be a random value of at least 32 characters',
    );
  }

  const jid = `slack:${channelId}`;
  initDatabase();
  setRegisteredGroup(jid, {
    name: 'gru-cnpc',
    folder: 'cnpc',
    trigger: '',
    added_at: new Date().toISOString(),
    requiresTrigger: false,
    containerConfig: {
      model: 'sonnet',
      threadPerMessage: true,
      timeout: 600000,
      additionalMounts: [
        {
          hostPath: 'knowledge/agents/cnpc',
          containerPath: 'knowledge',
          readonly: true,
        },
      ],
    },
  });

  const webhooksPath = path.join(runtimeRoot, 'data', 'webhooks.json');
  let webhooks: WebhookDefinition[] = [];
  if (fs.existsSync(webhooksPath)) {
    const parsed: unknown = JSON.parse(fs.readFileSync(webhooksPath, 'utf8'));
    if (!Array.isArray(parsed)) {
      throw new Error('data/webhooks.json must contain an array');
    }
    webhooks = parsed as WebhookDefinition[];
  }

  const definition: WebhookDefinition = {
    id: CNPC_INTAKE_WEBHOOK_ID,
    name: 'CNPC Gravity Forms coaching intake',
    group: 'cnpc',
    chat_jid: jid,
    prompt_template: '[CNPC_INTAKE]\n{{payload}}',
    secret: webhookSecret,
    context_mode: 'isolated',
    suppress_output: true,
    created_at: new Date().toISOString(),
  };
  const index = webhooks.findIndex(
    (webhook) => webhook.id === CNPC_INTAKE_WEBHOOK_ID,
  );
  if (index === -1) webhooks.push(definition);
  else webhooks[index] = { ...webhooks[index], ...definition };

  fs.mkdirSync(path.dirname(webhooksPath), { recursive: true });
  fs.writeFileSync(webhooksPath, `${JSON.stringify(webhooks, null, 2)}\n`, {
    mode: 0o600,
  });
  fs.chmodSync(webhooksPath, 0o600);
  return { jid, webhooksPath };
}

export function runCnpcRegistrationCli(): void {
  const channelId = process.argv[2];
  if (!channelId) {
    console.error('Usage: node dist/cnpc-register.js <slack_channel_id>');
    process.exitCode = 1;
    return;
  }

  const env = readEnvFile(['CNPC_INTAKE_WEBHOOK_SECRET']);
  const webhookSecret =
    process.env.CNPC_INTAKE_WEBHOOK_SECRET ?? env.CNPC_INTAKE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('CNPC_INTAKE_WEBHOOK_SECRET is not configured.');
    process.exitCode = 1;
    return;
  }

  try {
    const result = registerCnpcRuntime(channelId, webhookSecret);
    console.log(`Registered CNPC group: ${result.jid} -> groups/cnpc/`);
    console.log(
      `n8n target: http://mini-claw:8088/hook/${CNPC_INTAKE_WEBHOOK_ID}`,
    );
    console.log('Required header: X-Webhook-Secret (value not printed)');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  runCnpcRegistrationCli();
}
