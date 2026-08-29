#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const workflowPath = path.join(
  root,
  'setup',
  'n8n',
  'checkout-recovery-website-shadow-workflow.json',
);
const sourcePath = path.join(
  root,
  'setup',
  'n8n',
  'checkout-recovery-website-verify.js',
);
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
const trigger = workflow.nodes.find(
  (node) => node.type === 'n8n-nodes-base.webhook',
);
const verifier = workflow.nodes.find(
  (node) => node.name === 'Verify Normalize and Sign Checkout Recovery',
);
if (!trigger || !verifier) throw new Error('checkout workflow nodes missing');
trigger.parameters.options = {
  ...(trigger.parameters.options ?? {}),
  rawBody: true,
};
verifier.parameters.jsCode = fs.readFileSync(sourcePath, 'utf8');
fs.writeFileSync(workflowPath, `${JSON.stringify(workflow, null, 2)}\n`);
