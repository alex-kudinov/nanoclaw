import { describe, it, expect, vi } from 'vitest';

import { formatJobResult, formatJobList, reportJobResult } from './job-reporter.js';
import type { Job, JobRunResult } from './types.js';

function makeResult(overrides: Partial<JobRunResult> = {}): JobRunResult {
  return {
    name: 'test-job',
    status: 'ok',
    duration_ms: 1500,
    output: null,
    error: null,
    exit_code: null,
    retry_attempts: 0,
    run_id: 'run-123',
    log_file: null,
    ...overrides,
  };
}

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    name: 'my-job',
    description: 'Does something useful',
    project: 'tandemweb',
    project_root: '/projects/tandemweb',
    script: 'tools/do-thing.sh',
    args: [],
    cron: '0 9 * * 1',
    timezone: 'America/Chicago',
    retries: 0,
    retry_delay_ms: 60000,
    alert_level: 'alert',
    timeout_ms: 5400000,
    lockfile: null,
    enabled: true,
    next_run: null,
    last_run: null,
    last_result: null,
    last_duration_ms: null,
    last_output: null,
    ...overrides,
  };
}

// --- formatJobResult ---

describe('formatJobResult - ok', () => {
  it('contains checkmark emoji', () => {
    const result = formatJobResult(makeResult({ status: 'ok' }));
    expect(result).toContain(':white_check_mark:');
  });

  it('contains job name', () => {
    const result = formatJobResult(makeResult({ status: 'ok', name: 'my-job' }));
    expect(result).toContain('my-job');
  });

  it('contains formatted duration', () => {
    const result = formatJobResult(makeResult({ status: 'ok', duration_ms: 1500 }));
    expect(result).toContain('1s');
  });

  it('includes output in code block when present', () => {
    const result = formatJobResult(makeResult({ status: 'ok', output: 'hello output' }));
    expect(result).toContain('```');
    expect(result).toContain('hello output');
  });

  it('omits code block when output is null', () => {
    const result = formatJobResult(makeResult({ status: 'ok', output: null }));
    expect(result).not.toContain('```');
  });
});

describe('formatJobResult - fail', () => {
  it('contains x emoji', () => {
    const result = formatJobResult(makeResult({ status: 'fail', exit_code: 1, error: 'oops' }));
    expect(result).toContain(':x:');
  });

  it('contains exit code', () => {
    const result = formatJobResult(makeResult({ status: 'fail', exit_code: 42, error: 'error' }));
    expect(result).toContain('42');
  });

  it('contains error text in code block', () => {
    const result = formatJobResult(makeResult({ status: 'fail', exit_code: 1, error: 'something broke' }));
    expect(result).toContain('something broke');
    expect(result).toContain('```');
  });

  it('falls back to output when error is null', () => {
    const result = formatJobResult(makeResult({
      status: 'fail',
      exit_code: 1,
      error: null,
      output: 'from stdout',
    }));
    expect(result).toContain('from stdout');
  });

  it('shows fallback text when both error and output are null', () => {
    const result = formatJobResult(makeResult({ status: 'fail', exit_code: 1, error: null, output: null }));
    expect(result).toContain('No error output');
  });
});

describe('formatJobResult - timeout', () => {
  it('contains warning emoji', () => {
    const result = formatJobResult(makeResult({ status: 'timeout', duration_ms: 90000 }));
    expect(result).toContain(':warning:');
  });

  it('contains duration in output', () => {
    const result = formatJobResult(makeResult({ status: 'timeout', duration_ms: 90000 }));
    // 90000ms = 1m 30s — match either representation
    expect(result).toMatch(/1m\s*30s|90s/);
  });

  it('contains job name', () => {
    const result = formatJobResult(makeResult({ status: 'timeout', name: 'slow-job' }));
    expect(result).toContain('slow-job');
  });
});

describe('formatJobResult - already_running', () => {
  it('contains hourglass emoji', () => {
    const result = formatJobResult(makeResult({ status: 'already_running' }));
    expect(result).toContain(':hourglass_flowing_sand:');
  });

  it('mentions skipped', () => {
    const result = formatJobResult(makeResult({ status: 'already_running' }));
    expect(result).toContain('skipped');
  });
});

describe('formatJobResult - dispatch_error', () => {
  it('contains no_entry emoji', () => {
    const result = formatJobResult(makeResult({ status: 'dispatch_error', error: 'connection refused' }));
    expect(result).toContain(':no_entry:');
  });

  it('contains error message', () => {
    const result = formatJobResult(makeResult({ status: 'dispatch_error', error: 'connection refused' }));
    expect(result).toContain('connection refused');
  });

  it('shows fallback when error is null', () => {
    const result = formatJobResult(makeResult({ status: 'dispatch_error', error: null }));
    expect(result).toContain('Unknown dispatch error');
  });
});

describe('formatJobResult - path_error', () => {
  it('contains no_entry emoji', () => {
    const result = formatJobResult(makeResult({ status: 'path_error' }));
    expect(result).toContain(':no_entry:');
  });

  it('mentions "not found"', () => {
    const result = formatJobResult(makeResult({ status: 'path_error' }));
    expect(result).toContain('not found');
  });
});

describe('formatJobResult - retry_attempts', () => {
  it('includes retry info when attempts > 0', () => {
    const result = formatJobResult(makeResult({ status: 'ok', retry_attempts: 2 }));
    expect(result).toContain('attempt 3');
  });

  it('omits retry info when attempts = 0', () => {
    const result = formatJobResult(makeResult({ status: 'ok', retry_attempts: 0 }));
    expect(result).not.toContain('attempt');
  });
});

// --- formatJobList ---

describe('formatJobList', () => {
  it('returns "No jobs registered." for empty list', () => {
    expect(formatJobList([])).toBe('No jobs registered.');
  });

  it('includes job name', () => {
    const result = formatJobList([makeJob({ name: 'my-job' })]);
    expect(result).toContain('my-job');
  });

  it('includes job description', () => {
    const result = formatJobList([makeJob({ description: 'Does something useful' })]);
    expect(result).toContain('Does something useful');
  });

  it('includes human-readable cron schedule via cronstrue', () => {
    // "0 9 * * 1" = "At 09:00 AM, only on Monday"
    const result = formatJobList([makeJob({ cron: '0 9 * * 1' })]);
    // cronstrue renders this as something containing Monday/9:00
    expect(result).toMatch(/monday|9:00/i);
  });

  it('lists multiple jobs', () => {
    const jobs = [
      makeJob({ name: 'job-alpha' }),
      makeJob({ name: 'job-beta' }),
    ];
    const result = formatJobList(jobs);
    expect(result).toContain('job-alpha');
    expect(result).toContain('job-beta');
  });

  it('shows "paused" for next run when job is disabled', () => {
    const result = formatJobList([makeJob({ enabled: false })]);
    expect(result).toContain('paused');
  });
});

// --- output truncation ---

describe('output truncation in formatJobResult', () => {
  it('truncates very long output and appends truncation marker', () => {
    const longOutput = 'x'.repeat(600);
    const result = formatJobResult(makeResult({ status: 'ok', output: longOutput }));
    expect(result).toContain('truncated');
    // Truncation limit for ok status output is 500
    expect(result.length).toBeLessThan(longOutput.length + 100);
  });

  it('does not truncate short output', () => {
    const shortOutput = 'short output text';
    const result = formatJobResult(makeResult({ status: 'ok', output: shortOutput }));
    expect(result).toContain(shortOutput);
    expect(result).not.toContain('truncated');
  });
});

// --- reportJobResult ---

describe('reportJobResult', () => {
  it('calls sendMessage with formatted result', async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const result = makeResult({ status: 'ok', name: 'snapshot-job' });

    await reportJobResult(result, 'channel@g.us', sendMessage);

    expect(sendMessage).toHaveBeenCalledOnce();
    const [jid, text] = sendMessage.mock.calls[0];
    expect(jid).toBe('channel@g.us');
    expect(text).toContain('snapshot-job');
    expect(text).toContain(':white_check_mark:');
  });

  it('appends log file path when present', async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const result = makeResult({ status: 'fail', exit_code: 1, error: 'err', log_file: '/var/log/job.log' });

    await reportJobResult(result, 'channel@g.us', sendMessage);

    const [, text] = sendMessage.mock.calls[0];
    expect(text).toContain('/var/log/job.log');
  });

  it('truncates message exceeding 3800 chars', async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    // Construct a result with very long error output
    const result = makeResult({
      status: 'fail',
      exit_code: 1,
      error: 'e'.repeat(5000),
    });

    await reportJobResult(result, 'channel@g.us', sendMessage);

    const [, text] = sendMessage.mock.calls[0];
    expect(text.length).toBeLessThanOrEqual(3900);
    expect(text).toContain('truncated');
  });
});
