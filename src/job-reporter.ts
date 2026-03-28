import cronstrue from 'cronstrue';

import type { Job, JobRunResult } from './types.js';

const MAX_SLACK_LENGTH = 3800; // Leave margin below 4000

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  if (mins < 60) return remSecs > 0 ? `${mins}m ${remSecs}s` : `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
}

function timeAgo(isoDate: string | null): string {
  if (!isoDate) return 'never';
  const diff = Date.now() - new Date(isoDate).getTime();
  if (diff < 0) return 'just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function timeUntil(isoDate: string | null): string {
  if (!isoDate) return '-';
  const diff = new Date(isoDate).getTime() - Date.now();
  if (diff < 0) return 'overdue';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '<1m';
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.floor(hours / 24);
  return `in ${days}d`;
}

function truncateOutput(text: string | null, maxLen: number): string {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '\n... (truncated)';
}

function statusEmoji(job: Job): string {
  if (!job.enabled) return ':no_entry_sign:';
  if (!job.last_result) return ':white_circle:';
  if (job.last_result === 'ok') return ':white_check_mark:';
  return ':x:';
}

function cronToHuman(cron: string): string {
  try {
    return cronstrue.toString(cron, { use24HourTimeFormat: false });
  } catch {
    return cron;
  }
}

export function formatJobResult(result: JobRunResult): string {
  const dur = formatDuration(result.duration_ms);
  const retryInfo =
    result.retry_attempts > 0 ? ` (attempt ${result.retry_attempts + 1})` : '';

  switch (result.status) {
    case 'ok': {
      const output = result.output
        ? `\n\`\`\`\n${truncateOutput(result.output, 500)}\n\`\`\``
        : '';
      return `:white_check_mark: *${result.name}* completed in ${dur}${retryInfo}${output}`;
    }
    case 'fail': {
      const errText = result.error || result.output || 'No error output';
      return `:x: *${result.name}* failed (exit ${result.exit_code})${retryInfo}\n\`\`\`\n${truncateOutput(errText, 800)}\n\`\`\``;
    }
    case 'timeout':
      return `:warning: *${result.name}* timed out after ${dur}${retryInfo}`;
    case 'already_running':
      return `:hourglass_flowing_sand: *${result.name}* skipped - already running`;
    case 'dispatch_error': {
      const err = result.error || 'Unknown dispatch error';
      return `:no_entry: *${result.name}* dispatch error: ${err}`;
    }
    case 'path_error':
      return `:no_entry: *${result.name}* - script not found`;
    default:
      return `:question: *${result.name}* - unknown status: ${result.status}`;
  }
}

export function formatJobList(jobs: Job[]): string {
  if (jobs.length === 0) return 'No jobs registered.';

  const lines: string[] = ['*Scheduled Jobs*\n'];

  for (const job of jobs) {
    const emoji = statusEmoji(job);
    const schedule = cronToHuman(job.cron);
    const lastRun = timeAgo(job.last_run);
    const nextRun = job.enabled ? timeUntil(job.next_run) : 'paused';

    lines.push(`${emoji} *${job.name}*`);
    lines.push(`  ${job.description}`);
    lines.push(`  Schedule: ${schedule} | Last: ${lastRun} | Next: ${nextRun}`);
    lines.push('');
  }

  return lines.join('\n');
}

export function formatJobStatus(
  job: Job,
  recentLogs: Array<{
    started_at: string;
    status: string;
    duration_ms: number | null;
    error: string | null;
  }>,
): string {
  const emoji = statusEmoji(job);
  const schedule = cronToHuman(job.cron);
  const lines: string[] = [
    `${emoji} *${job.name}*`,
    `${job.description}`,
    '',
    `*Schedule:* ${schedule} (${job.timezone})`,
    `*Enabled:* ${job.enabled ? 'yes' : 'no'}`,
    `*Last run:* ${timeAgo(job.last_run)} - ${job.last_result || 'never run'}`,
    `*Next run:* ${job.enabled ? timeUntil(job.next_run) : 'paused'}`,
    `*Retries:* ${job.retries} (delay: ${formatDuration(job.retry_delay_ms)})`,
    `*Timeout:* ${formatDuration(job.timeout_ms)}`,
    `*Script:* \`${job.project}:${job.script}\``,
  ];

  if (recentLogs.length > 0) {
    lines.push('', '*Recent runs:*');
    for (const log of recentLogs.slice(0, 5)) {
      const dur = log.duration_ms ? formatDuration(log.duration_ms) : '-';
      const errNote = log.error ? ` - ${log.error.slice(0, 80)}` : '';
      lines.push(
        `  ${log.status === 'ok' ? ':white_check_mark:' : ':x:'} ${timeAgo(log.started_at)} (${dur})${errNote}`,
      );
    }
  }

  return lines.join('\n');
}

export async function reportJobResult(
  result: JobRunResult,
  channelJid: string,
  sendMessage: (jid: string, text: string) => Promise<void>,
): Promise<void> {
  let message = formatJobResult(result);

  if (result.log_file) {
    message += `\nFull log: \`${result.log_file}\``;
  }

  // Truncate if exceeds Slack limit
  if (message.length > MAX_SLACK_LENGTH) {
    message = message.slice(0, MAX_SLACK_LENGTH) + '\n... (message truncated)';
  }

  await sendMessage(channelJid, message);
}
