/**
 * Register the Academy Capacity group in NanoClaw.
 * Run on Mac Mini after creating the private #gru-capacity Slack channel.
 *
 * Usage: npx tsx scripts/register-capacity.ts <slack_channel_id>
 */
import { initDatabase, setRegisteredGroup } from '../src/db.js';

const channelId = process.argv[2];
if (!channelId || !/^C[A-Z0-9]{8,20}$/.test(channelId)) {
  console.error('Usage: npx tsx scripts/register-capacity.ts C0XXXXXXXXX');
  process.exit(1);
}

const jid = `slack:${channelId}`;

initDatabase();

setRegisteredGroup(jid, {
  name: 'gru-capacity',
  folder: 'capacity',
  trigger: '',
  added_at: new Date().toISOString(),
  requiresTrigger: false,
  containerConfig: {
    model: 'sonnet',
    timeout: 600000,
    spawnTimeout: 600000,
    idleTimeout: 600000,
    memory: '1g',
    cpus: 1,
  },
});

console.log(`Registered capacity group: ${jid} -> groups/capacity/`);
