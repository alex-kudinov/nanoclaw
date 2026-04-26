/**
 * Register the Procurement Scout group in NanoClaw.
 * Run on Mac Mini after creating the #gru-procurement Slack channel.
 *
 * Usage: npx tsx scripts/register-procurement.ts <slack_channel_id>
 * Example: npx tsx scripts/register-procurement.ts C0XXXXXXXXX
 */
import { initDatabase, setRegisteredGroup } from '../src/db.js';

const channelId = process.argv[2];
if (!channelId) {
  console.error(
    'Usage: npx tsx scripts/register-procurement.ts <slack_channel_id>',
  );
  console.error('Example: npx tsx scripts/register-procurement.ts C0XXXXXXXXX');
  process.exit(1);
}

const jid = `slack:${channelId}`;

initDatabase();

setRegisteredGroup(jid, {
  name: 'gru-procurement',
  folder: 'procurement',
  trigger: '',
  added_at: new Date().toISOString(),
  requiresTrigger: false,
  containerConfig: {
    additionalMounts: [
      {
        hostPath: 'knowledge/agents/procurement',
        containerPath: 'knowledge',
        readonly: true,
      },
      {
        hostPath: '~/Vaults/My Notes/Tandem/Procurement',
        containerPath: 'vault-procurement',
        readonly: false,
      },
      {
        hostPath: 'agent_docs',
        containerPath: 'agent_docs',
        readonly: true,
      },
    ],
    spawnTimeout: 300000, // 5 min — browser startup + login + page load is slow
    timeout: 900000, // 15 min — scan + scrape + analysis pipeline
  },
});

console.log(`Registered procurement group: ${jid} → groups/procurement/`);
