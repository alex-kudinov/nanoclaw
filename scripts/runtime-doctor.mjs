#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const root = process.cwd();
const pin = fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const dockerfile = fs.readFileSync(
  path.join(root, 'container', 'Dockerfile'),
  'utf8',
);
const workflowDir = path.join(root, '.github', 'workflows');
const workflows = fs
  .readdirSync(workflowDir)
  .filter((name) => /\.ya?ml$/.test(name))
  .sort()
  .map((name) => ({
    name,
    text: fs.readFileSync(path.join(workflowDir, name), 'utf8'),
  }));

const errors = [];
if (process.versions.node !== pin) {
  errors.push(`runtime ${process.versions.node} does not match ${pin}`);
}
if (pkg.engines?.node !== pin) {
  errors.push(`package engine ${String(pkg.engines?.node)} does not match ${pin}`);
}
if (!dockerfile.includes(`FROM node:${pin}-slim`)) {
  errors.push(`agent image is not pinned to node:${pin}-slim`);
}

const setupNodeBlocks = workflows.flatMap(({ name, text }) =>
  [...text.matchAll(/uses:\s*actions\/setup-node@[^\n]+\n([\s\S]*?)(?=\n\s*-\s|\n\S|$)/g)].map(
    (match) => ({ name, block: match[1] }),
  ),
);
for (const { name, block } of setupNodeBlocks) {
  if (!block.includes('node-version-file: .nvmrc')) {
    errors.push(`${name} has a setup-node step that does not use .nvmrc`);
  }
}

const result = {
  status: errors.length === 0 ? 'ok' : 'error',
  node_pin: pin,
  node_runtime: process.versions.node,
  node_executable: process.execPath,
  native_abi: process.versions.modules,
  package_engine: pkg.engines?.node ?? null,
  agent_image: `node:${pin}-slim`,
  setup_node_steps: setupNodeBlocks.length,
  errors,
};

console.log(JSON.stringify(result, null, 2));
if (errors.length > 0) process.exitCode = 1;
