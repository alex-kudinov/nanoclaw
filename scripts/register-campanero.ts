#!/usr/bin/env npx tsx
/**
 * One-time registration script for El Campanero agent.
 * Run from the NanoClaw project root:
 *   npx tsx scripts/register-campanero.ts
 */
import { initDatabase, setRegisteredGroup } from '../src/db.js';

const JID = 'slack:C0APF8WMV18';

initDatabase();

setRegisteredGroup(JID, {
  name: 'gru-campanero',
  folder: 'campanero',
  trigger: '^@Gru\\b',
  added_at: new Date().toISOString(),
  containerConfig: {
    additionalMounts: [
      {
        hostPath: 'knowledge/agents/campanero',
        containerPath: 'knowledge',
        readonly: true,
      },
    ],
  },
  requiresTrigger: false,
  isMain: false,
});

console.log('El Campanero registered: slack:C0APF8WMV18 -> campanero');
