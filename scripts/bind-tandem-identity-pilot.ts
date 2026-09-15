import fs from 'fs';
import path from 'path';
import { z } from 'zod';

import { getBusinessPool } from '../src/business-db.js';
import {
  bindLoginToolsPilotWithClient,
  disableLoginToolsPilotBindingWithClient,
} from '../src/identity-control-plane/login-tools-gateway.js';

const manifestBase = {
  schemaVersion: z.literal(1),
  projectId: z.literal('tandem-identity-dev-2026'),
  uid: z.string().min(1).max(500),
  verifiedEmailSha256: z.literal(
    '929e062a5f6c3a1708d539ddebfaf7b05d4fbceb009de8b8362b748bb3a5cf81',
  ),
};
const manifestSchema = z.discriminatedUnion('kind', [
  z
    .object({
    kind: z.literal('tandem_identity_pilot_binding'),
      ...manifestBase,
  })
    .strict(),
  z
    .object({
      kind: z.literal('tandem_identity_pilot_binding_disable'),
      ...manifestBase,
      rollbackDecisionRef: z.string().min(1).max(500),
      rollbackDecisionUuid: z.uuid(),
    })
    .strict(),
]);

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const manifestPath = argument('--manifest');
const apply = process.argv.includes('--apply');
if (!manifestPath) throw new Error('pilot manifest path is required');
const absolute = path.resolve(manifestPath);
const mode = fs.statSync(absolute).mode & 0o777;
if (mode !== 0o600) throw new Error('pilot manifest must have mode 0600');
const manifest = manifestSchema.parse(
  JSON.parse(fs.readFileSync(absolute, 'utf8')),
);

if (!apply) {
  process.stdout.write(
    `${JSON.stringify({ mode: 'dry_run', projectId: manifest.projectId, ready: true })}\n`,
  );
  process.exit(0);
}

const pool = getBusinessPool();
const client = await pool.connect();
try {
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  await client.query('SET LOCAL ROLE nanoclaw_admin');
  await client.query(`SELECT set_config('app.current_agent',$1,true)`, [
    'tandem-identity-pilot-binding',
  ]);
  const common = {
    client,
    request: {
      kind: 'tandem_identity_binding_lookup',
      schemaVersion: 1,
      projectId: manifest.projectId,
      uid: manifest.uid,
      verifiedEmailSha256: manifest.verifiedEmailSha256,
    },
    policy: {
      projectId: 'tandem-identity-dev-2026',
      environment: 'development',
      pilotPartyId: 10069,
      pilotEmailSha256:
        '929e062a5f6c3a1708d539ddebfaf7b05d4fbceb009de8b8362b748bb3a5cf81',
      decisionRef:
        '.program/decisions/decision-tandem-identity-pilot-canonical-party-and-gateway-2026-09-15.json',
      decisionUuid: '3f2bcf48-9b92-4bea-8a45-6b0a65cb677a',
      callerSubject: '114536406241819905948',
    },
    observedAt: new Date().toISOString(),
  };
  const result =
    manifest.kind === 'tandem_identity_pilot_binding'
      ? await bindLoginToolsPilotWithClient(common)
      : await disableLoginToolsPilotBindingWithClient({
          ...common,
          policy: {
            ...common.policy,
            rollbackDecisionRef: manifest.rollbackDecisionRef,
            rollbackDecisionUuid: manifest.rollbackDecisionUuid,
          },
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
