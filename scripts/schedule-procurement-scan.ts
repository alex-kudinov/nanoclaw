/**
 * Create a daily scheduled task for the Procurement Scout scan.
 * Run on Mac Mini after registering the procurement group.
 *
 * Usage: npx tsx scripts/schedule-procurement-scan.ts <slack_channel_id>
 * Example: npx tsx scripts/schedule-procurement-scan.ts C0XXXXXXXXX
 */
import crypto from 'crypto';
import { CronExpressionParser } from 'cron-parser';

import { createTask, initDatabase } from '../src/db.js';

const channelId = process.argv[2];
if (!channelId) {
  console.error(
    'Usage: npx tsx scripts/schedule-procurement-scan.ts <slack_channel_id>',
  );
  console.error('Example: npx tsx scripts/schedule-procurement-scan.ts C0XXXXXXXXX');
  process.exit(1);
}

const jid = `slack:${channelId}`;
const taskId = crypto.randomUUID();

// Daily at 8:00 AM CT (server runs in CT timezone)
const cronExpression = '0 8 * * *';

const interval = CronExpressionParser.parse(cronExpression, {
  tz: 'America/Chicago',
});
const nextRun = interval.next().toISOString();

initDatabase();

createTask({
  id: taskId,
  group_folder: 'procurement',
  chat_jid: jid,
  prompt: 'Run daily procurement scan',
  schedule_type: 'cron',
  schedule_value: cronExpression,
  context_mode: 'group',
  next_run: nextRun,
  status: 'active',
  created_at: new Date().toISOString(),
});

console.log(`Scheduled daily procurement scan:`);
console.log(`  Task ID: ${taskId}`);
console.log(`  Cron: ${cronExpression} (8:00 AM CT daily)`);
console.log(`  Next run: ${nextRun}`);
console.log(`  Channel: ${jid}`);
