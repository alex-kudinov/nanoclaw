import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

import { getBusinessPool } from '../src/business-db.js';
import {
  CoachingToolsPlusCanaryRequestSchema,
  grantCoachingToolsPlusCanaryWithClient,
  revokeCoachingToolsPlusCanaryWithClient,
  type CoachingToolsPlusCanaryPolicy,
} from '../src/identity-control-plane/coaching-tools-plus-canary.js';

const manifestSchema = z.discriminatedUnion('kind', [
  CoachingToolsPlusCanaryRequestSchema.extend({
    kind: z.literal('tandem_identity_coaching_tools_plus_canary_grant'),
  }).strict(),
  CoachingToolsPlusCanaryRequestSchema.extend({
    kind: z.literal('tandem_identity_coaching_tools_plus_canary_revoke'),
  }).strict(),
]);

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const manifestPath = argument('--manifest');
const apply = process.argv.includes('--apply');
if (!manifestPath) throw new Error('canary manifest path is required');
const absolute = path.resolve(manifestPath);
const mode = fs.statSync(absolute).mode & 0o777;
if (mode !== 0o600) throw new Error('canary manifest must have mode 0600');
const manifest = manifestSchema.parse(JSON.parse(fs.readFileSync(absolute, 'utf8')));

if (!apply) {
  process.stdout.write(
    `${JSON.stringify({ mode: 'dry_run', kind: manifest.kind, projectId: manifest.projectId, ready: true })}\n`,
  );
  process.exit(0);
}

const policy: CoachingToolsPlusCanaryPolicy = {
  projectId: 'tandem-identity-dev-2026',
  environment: 'development',
  partyId: 10069,
  verifiedEmailSha256:
    '929e062a5f6c3a1708d539ddebfaf7b05d4fbceb009de8b8362b748bb3a5cf81',
  heartbeatUserId: 'bc42394c-ad45-4d81-89eb-448347b3d518',
  heartbeatGroupId: 'bc095770-0c8b-4495-9369-985e4c4649d7',
  decisionRef:
    '.program/decisions/decision-tandem-identity-coaching-tools-plus-alex-canary-2026-09-16.json',
  decisionUuid: '083c2829-0151-4f95-a6aa-8df28c29123d',
};

const pool = getBusinessPool();
const client = await pool.connect();
try {
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  await client.query('SET LOCAL ROLE nanoclaw_admin');
  await client.query(`SELECT set_config('app.current_agent',$1,true)`, [
    'tandem-identity-plus-canary',
  ]);
  const request = {
    schemaVersion: manifest.schemaVersion,
    projectId: manifest.projectId,
    uid: manifest.uid,
    verifiedEmailSha256: manifest.verifiedEmailSha256,
    partyId: manifest.partyId,
    heartbeatUserId: manifest.heartbeatUserId,
    heartbeatGroupId: manifest.heartbeatGroupId,
    expiresAt: manifest.expiresAt,
  };
  const observedAt = new Date().toISOString();
  const result =
    manifest.kind === 'tandem_identity_coaching_tools_plus_canary_grant'
      ? await grantCoachingToolsPlusCanaryWithClient({
          client,
          request,
          policy,
          observedAt,
        })
      : await revokeCoachingToolsPlusCanaryWithClient({
          client,
          request,
          policy,
          observedAt,
        });
  await client.query('COMMIT');
  process.stdout.write(`${JSON.stringify({ mode: 'applied', ...result })}\n`);
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
