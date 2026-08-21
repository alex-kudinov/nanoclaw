#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflowPath = new URL('../setup/n8n/heartbeat-journey-workflow.json', import.meta.url);
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
const codeNode = workflow.nodes.find((node) => node.name === 'Validate and classify');
assert.ok(codeNode, 'Validate and classify node is required');

const execute = new Function('$input', codeNode.parameters.jsCode);
const uuidA = '123e4567-e89b-42d3-a456-426614174000';
const uuidB = '223e4567-e89b-42d3-a456-426614174000';

const fixtures = [
  [{courseID: uuidA, courseName: 'Course', userID: uuidB}, 'COURSE_COMPLETED'],
  [{groupID: uuidA, userID: uuidB}, 'GROUP_JOIN'],
  [{id: uuidA, name: 'Learner', email: 'learner@example.com'}, 'USER_JOIN'],
  [{email: 'learner@example.com', invitationLinkID: 'invite-1', groupIDs: [uuidA]}, 'ABANDONED_CART'],
];

for (const [body, expected] of fixtures) {
  const result = execute({first: () => ({json: {body}})});
  assert.equal(result[0].json.event, expected);
  assert.deepEqual(result[0].json.data, body);
}

assert.throws(
  () => execute({first: () => ({json: {body: {email: 'learner@example.com'}}})}),
  /Rejected undocumented Heartbeat payload shape/,
);

console.log(`PASS: ${fixtures.length} documented Heartbeat shapes accepted; unknown shape rejected`);
