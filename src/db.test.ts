import { describe, it, expect, beforeEach } from 'vitest';

import {
  _initTestDatabase,
  createTask,
  deleteTask,
  getAllChats,
  getAllRegisteredGroups,
  getDueJobs,
  getJob,
  getJobRunLogs,
  getMessagesSince,
  getNewMessages,
  getRunningJobNames,
  getTaskById,
  insertJobRunLog,
  markStaleRunsAsFailed,
  setJobEnabled,
  setRegisteredGroup,
  storeChatMetadata,
  storeMessage,
  updateJobNextRun,
  updateJobRunLog,
  updateJobRunState,
  updateTask,
  upsertJobDefinition,
} from './db.js';

beforeEach(() => {
  _initTestDatabase();
});

// Helper to store a message using the normalized NewMessage interface
function store(overrides: {
  id: string;
  chat_jid: string;
  sender: string;
  sender_name: string;
  content: string;
  timestamp: string;
  is_from_me?: boolean;
}) {
  storeMessage({
    id: overrides.id,
    chat_jid: overrides.chat_jid,
    sender: overrides.sender,
    sender_name: overrides.sender_name,
    content: overrides.content,
    timestamp: overrides.timestamp,
    is_from_me: overrides.is_from_me ?? false,
  });
}

// --- storeMessage (NewMessage format) ---

describe('storeMessage', () => {
  it('stores a message and retrieves it', () => {
    storeChatMetadata('group@g.us', '2024-01-01T00:00:00.000Z');

    store({
      id: 'msg-1',
      chat_jid: 'group@g.us',
      sender: '123@s.whatsapp.net',
      sender_name: 'Alice',
      content: 'hello world',
      timestamp: '2024-01-01T00:00:01.000Z',
    });

    const messages = getMessagesSince(
      'group@g.us',
      '2024-01-01T00:00:00.000Z',
      'Gru',
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe('msg-1');
    expect(messages[0].sender).toBe('123@s.whatsapp.net');
    expect(messages[0].sender_name).toBe('Alice');
    expect(messages[0].content).toBe('hello world');
  });

  it('filters out empty content', () => {
    storeChatMetadata('group@g.us', '2024-01-01T00:00:00.000Z');

    store({
      id: 'msg-2',
      chat_jid: 'group@g.us',
      sender: '111@s.whatsapp.net',
      sender_name: 'Dave',
      content: '',
      timestamp: '2024-01-01T00:00:04.000Z',
    });

    const messages = getMessagesSince(
      'group@g.us',
      '2024-01-01T00:00:00.000Z',
      'Gru',
    );
    expect(messages).toHaveLength(0);
  });

  it('stores is_from_me flag', () => {
    storeChatMetadata('group@g.us', '2024-01-01T00:00:00.000Z');

    store({
      id: 'msg-3',
      chat_jid: 'group@g.us',
      sender: 'me@s.whatsapp.net',
      sender_name: 'Me',
      content: 'my message',
      timestamp: '2024-01-01T00:00:05.000Z',
      is_from_me: true,
    });

    // Message is stored (we can retrieve it — is_from_me doesn't affect retrieval)
    const messages = getMessagesSince(
      'group@g.us',
      '2024-01-01T00:00:00.000Z',
      'Gru',
    );
    expect(messages).toHaveLength(1);
  });

  it('upserts on duplicate id+chat_jid', () => {
    storeChatMetadata('group@g.us', '2024-01-01T00:00:00.000Z');

    store({
      id: 'msg-dup',
      chat_jid: 'group@g.us',
      sender: '123@s.whatsapp.net',
      sender_name: 'Alice',
      content: 'original',
      timestamp: '2024-01-01T00:00:01.000Z',
    });

    store({
      id: 'msg-dup',
      chat_jid: 'group@g.us',
      sender: '123@s.whatsapp.net',
      sender_name: 'Alice',
      content: 'updated',
      timestamp: '2024-01-01T00:00:01.000Z',
    });

    const messages = getMessagesSince(
      'group@g.us',
      '2024-01-01T00:00:00.000Z',
      'Gru',
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('updated');
  });
});

// --- getMessagesSince ---

describe('getMessagesSince', () => {
  beforeEach(() => {
    storeChatMetadata('group@g.us', '2024-01-01T00:00:00.000Z');

    store({
      id: 'm1',
      chat_jid: 'group@g.us',
      sender: 'Alice@s.whatsapp.net',
      sender_name: 'Alice',
      content: 'first',
      timestamp: '2024-01-01T00:00:01.000Z',
    });
    store({
      id: 'm2',
      chat_jid: 'group@g.us',
      sender: 'Bob@s.whatsapp.net',
      sender_name: 'Bob',
      content: 'second',
      timestamp: '2024-01-01T00:00:02.000Z',
    });
    storeMessage({
      id: 'm3',
      chat_jid: 'group@g.us',
      sender: 'Bot@s.whatsapp.net',
      sender_name: 'Bot',
      content: 'bot reply',
      timestamp: '2024-01-01T00:00:03.000Z',
      is_bot_message: true,
    });
    store({
      id: 'm4',
      chat_jid: 'group@g.us',
      sender: 'Carol@s.whatsapp.net',
      sender_name: 'Carol',
      content: 'third',
      timestamp: '2024-01-01T00:00:04.000Z',
    });
  });

  it('returns messages after the given timestamp', () => {
    const msgs = getMessagesSince(
      'group@g.us',
      '2024-01-01T00:00:02.000Z',
      'Gru',
    );
    // Should exclude m1, m2 (before/at timestamp), m3 (bot message)
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toBe('third');
  });

  it('excludes bot messages via is_bot_message flag', () => {
    const msgs = getMessagesSince(
      'group@g.us',
      '2024-01-01T00:00:00.000Z',
      'Gru',
    );
    const botMsgs = msgs.filter((m) => m.content === 'bot reply');
    expect(botMsgs).toHaveLength(0);
  });

  it('returns all non-bot messages when sinceTimestamp is empty', () => {
    const msgs = getMessagesSince('group@g.us', '', 'Gru');
    // 3 user messages (bot message excluded)
    expect(msgs).toHaveLength(3);
  });

  it('filters pre-migration bot messages via content prefix backstop', () => {
    // Simulate a message written before migration: has prefix but is_bot_message = 0
    store({
      id: 'm5',
      chat_jid: 'group@g.us',
      sender: 'Bot@s.whatsapp.net',
      sender_name: 'Bot',
      content: 'Gru: old bot reply',
      timestamp: '2024-01-01T00:00:05.000Z',
    });
    const msgs = getMessagesSince(
      'group@g.us',
      '2024-01-01T00:00:04.000Z',
      'Gru',
    );
    expect(msgs).toHaveLength(0);
  });
});

// --- getNewMessages ---

describe('getNewMessages', () => {
  beforeEach(() => {
    storeChatMetadata('group1@g.us', '2024-01-01T00:00:00.000Z');
    storeChatMetadata('group2@g.us', '2024-01-01T00:00:00.000Z');

    store({
      id: 'a1',
      chat_jid: 'group1@g.us',
      sender: 'user@s.whatsapp.net',
      sender_name: 'User',
      content: 'g1 msg1',
      timestamp: '2024-01-01T00:00:01.000Z',
    });
    store({
      id: 'a2',
      chat_jid: 'group2@g.us',
      sender: 'user@s.whatsapp.net',
      sender_name: 'User',
      content: 'g2 msg1',
      timestamp: '2024-01-01T00:00:02.000Z',
    });
    storeMessage({
      id: 'a3',
      chat_jid: 'group1@g.us',
      sender: 'user@s.whatsapp.net',
      sender_name: 'User',
      content: 'bot reply',
      timestamp: '2024-01-01T00:00:03.000Z',
      is_bot_message: true,
    });
    store({
      id: 'a4',
      chat_jid: 'group1@g.us',
      sender: 'user@s.whatsapp.net',
      sender_name: 'User',
      content: 'g1 msg2',
      timestamp: '2024-01-01T00:00:04.000Z',
    });
  });

  it('returns new messages across multiple groups', () => {
    const { messages, newTimestamp } = getNewMessages(
      ['group1@g.us', 'group2@g.us'],
      '2024-01-01T00:00:00.000Z',
      'Gru',
    );
    // Excludes bot message, returns 3 user messages
    expect(messages).toHaveLength(3);
    expect(newTimestamp).toBe('2024-01-01T00:00:04.000Z');
  });

  it('filters by timestamp', () => {
    const { messages } = getNewMessages(
      ['group1@g.us', 'group2@g.us'],
      '2024-01-01T00:00:02.000Z',
      'Gru',
    );
    // Only g1 msg2 (after ts, not bot)
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('g1 msg2');
  });

  it('returns empty for no registered groups', () => {
    const { messages, newTimestamp } = getNewMessages([], '', 'Gru');
    expect(messages).toHaveLength(0);
    expect(newTimestamp).toBe('');
  });
});

// --- storeChatMetadata ---

describe('storeChatMetadata', () => {
  it('stores chat with JID as default name', () => {
    storeChatMetadata('group@g.us', '2024-01-01T00:00:00.000Z');
    const chats = getAllChats();
    expect(chats).toHaveLength(1);
    expect(chats[0].jid).toBe('group@g.us');
    expect(chats[0].name).toBe('group@g.us');
  });

  it('stores chat with explicit name', () => {
    storeChatMetadata('group@g.us', '2024-01-01T00:00:00.000Z', 'My Group');
    const chats = getAllChats();
    expect(chats[0].name).toBe('My Group');
  });

  it('updates name on subsequent call with name', () => {
    storeChatMetadata('group@g.us', '2024-01-01T00:00:00.000Z');
    storeChatMetadata('group@g.us', '2024-01-01T00:00:01.000Z', 'Updated Name');
    const chats = getAllChats();
    expect(chats).toHaveLength(1);
    expect(chats[0].name).toBe('Updated Name');
  });

  it('preserves newer timestamp on conflict', () => {
    storeChatMetadata('group@g.us', '2024-01-01T00:00:05.000Z');
    storeChatMetadata('group@g.us', '2024-01-01T00:00:01.000Z');
    const chats = getAllChats();
    expect(chats[0].last_message_time).toBe('2024-01-01T00:00:05.000Z');
  });
});

// --- Task CRUD ---

describe('task CRUD', () => {
  it('creates and retrieves a task', () => {
    createTask({
      id: 'task-1',
      group_folder: 'main',
      chat_jid: 'group@g.us',
      prompt: 'do something',
      schedule_type: 'once',
      schedule_value: '2024-06-01T00:00:00.000Z',
      context_mode: 'isolated',
      next_run: '2024-06-01T00:00:00.000Z',
      status: 'active',
      created_at: '2024-01-01T00:00:00.000Z',
    });

    const task = getTaskById('task-1');
    expect(task).toBeDefined();
    expect(task!.prompt).toBe('do something');
    expect(task!.status).toBe('active');
  });

  it('updates task status', () => {
    createTask({
      id: 'task-2',
      group_folder: 'main',
      chat_jid: 'group@g.us',
      prompt: 'test',
      schedule_type: 'once',
      schedule_value: '2024-06-01T00:00:00.000Z',
      context_mode: 'isolated',
      next_run: null,
      status: 'active',
      created_at: '2024-01-01T00:00:00.000Z',
    });

    updateTask('task-2', { status: 'paused' });
    expect(getTaskById('task-2')!.status).toBe('paused');
  });

  it('deletes a task and its run logs', () => {
    createTask({
      id: 'task-3',
      group_folder: 'main',
      chat_jid: 'group@g.us',
      prompt: 'delete me',
      schedule_type: 'once',
      schedule_value: '2024-06-01T00:00:00.000Z',
      context_mode: 'isolated',
      next_run: null,
      status: 'active',
      created_at: '2024-01-01T00:00:00.000Z',
    });

    deleteTask('task-3');
    expect(getTaskById('task-3')).toBeUndefined();
  });
});

// --- Host Job Scheduling CRUD ---

describe('upsertJobDefinition / getJob', () => {
  it('creates a job and retrieves it', () => {
    upsertJobDefinition({
      name: 'daily-sync',
      description: 'Syncs data every day',
      project: 'tandemweb',
      project_root: '/projects/tandemweb',
      script: 'tools/sync.sh',
      args: ['--full'],
      cron: '0 9 * * *',
      timezone: 'America/Chicago',
      retries: 1,
      retry_delay_ms: 30000,
      alert_level: 'alert',
      timeout_ms: 300000,
      lockfile: null,
      enabled: true,
    });

    const job = getJob('daily-sync');
    expect(job).toBeDefined();
    expect(job!.name).toBe('daily-sync');
    expect(job!.description).toBe('Syncs data every day');
    expect(job!.script).toBe('tools/sync.sh');
    expect(job!.args).toEqual(['--full']);
    expect(job!.enabled).toBe(true);
  });

  it('updates definition fields on re-upsert but NOT runtime fields', () => {
    upsertJobDefinition({
      name: 'batch-job',
      description: 'Original description',
      project: 'tandemweb',
      project_root: '/projects/tandemweb',
      script: 'tools/batch.sh',
      args: [],
      cron: '0 8 * * *',
      timezone: 'America/Chicago',
      retries: 0,
      retry_delay_ms: 60000,
      alert_level: 'warn',
      timeout_ms: 5400000,
      lockfile: null,
      enabled: true,
    });

    // Set some runtime state
    updateJobRunState('batch-job', {
      last_run: '2024-06-01T08:00:00.000Z',
      last_result: 'ok',
      last_duration_ms: 4200,
      last_output: 'done',
      next_run: '2024-06-02T08:00:00.000Z',
    });

    // Re-upsert with updated description
    upsertJobDefinition({
      name: 'batch-job',
      description: 'Updated description',
      project: 'tandemweb',
      project_root: '/projects/tandemweb',
      script: 'tools/batch.sh',
      args: [],
      cron: '0 8 * * *',
      timezone: 'America/Chicago',
      retries: 0,
      retry_delay_ms: 60000,
      alert_level: 'warn',
      timeout_ms: 5400000,
      lockfile: null,
      enabled: true,
    });

    const job = getJob('batch-job');
    expect(job!.description).toBe('Updated description');
    // Runtime fields must be preserved
    expect(job!.last_run).toBe('2024-06-01T08:00:00.000Z');
    expect(job!.last_result).toBe('ok');
    expect(job!.last_duration_ms).toBe(4200);
  });
});

describe('updateJobRunState', () => {
  it('updates all runtime fields', () => {
    upsertJobDefinition({
      name: 'state-job',
      description: '',
      project: 'proj',
      project_root: '/proj',
      script: 'run.sh',
      args: [],
      cron: '0 * * * *',
      timezone: 'UTC',
      retries: 0,
      retry_delay_ms: 60000,
      alert_level: 'alert',
      timeout_ms: 60000,
      lockfile: null,
      enabled: true,
    });

    updateJobRunState('state-job', {
      last_run: '2024-07-01T10:00:00.000Z',
      last_result: 'fail',
      last_duration_ms: 1200,
      last_output: 'error output',
      next_run: '2024-07-01T11:00:00.000Z',
    });

    const job = getJob('state-job');
    expect(job!.last_run).toBe('2024-07-01T10:00:00.000Z');
    expect(job!.last_result).toBe('fail');
    expect(job!.last_duration_ms).toBe(1200);
    expect(job!.last_output).toBe('error output');
    expect(job!.next_run).toBe('2024-07-01T11:00:00.000Z');
  });
});

describe('getDueJobs', () => {
  function insertJob(name: string, nextRun: string, enabled = true) {
    upsertJobDefinition({
      name,
      description: '',
      project: 'proj',
      project_root: '/proj',
      script: 'run.sh',
      args: [],
      cron: '0 * * * *',
      timezone: 'UTC',
      retries: 0,
      retry_delay_ms: 60000,
      alert_level: 'alert',
      timeout_ms: 60000,
      lockfile: null,
      enabled,
    });
    updateJobNextRun(name, nextRun);
  }

  it('returns only enabled jobs with next_run <= now', () => {
    const now = new Date();
    const past = new Date(now.getTime() - 60000).toISOString();
    const future = new Date(now.getTime() + 60000).toISOString();

    insertJob('due-job', past, true);
    insertJob('future-job', future, true);

    const due = getDueJobs(now.toISOString());
    expect(due.map((j: { name: string }) => j.name)).toContain('due-job');
    expect(due.map((j: { name: string }) => j.name)).not.toContain(
      'future-job',
    );
  });

  it('does not return disabled jobs even when next_run is overdue', () => {
    const now = new Date();
    const past = new Date(now.getTime() - 60000).toISOString();

    insertJob('disabled-overdue', past, false);

    const due = getDueJobs(now.toISOString());
    expect(due.map((j: { name: string }) => j.name)).not.toContain(
      'disabled-overdue',
    );
  });
});

describe('setJobEnabled', () => {
  it('disables an enabled job', () => {
    upsertJobDefinition({
      name: 'toggle-job',
      description: '',
      project: 'proj',
      project_root: '/proj',
      script: 'run.sh',
      args: [],
      cron: '0 * * * *',
      timezone: 'UTC',
      retries: 0,
      retry_delay_ms: 60000,
      alert_level: 'alert',
      timeout_ms: 60000,
      lockfile: null,
      enabled: true,
    });

    setJobEnabled('toggle-job', false);
    expect(getJob('toggle-job')!.enabled).toBe(false);
  });

  it('re-enables a disabled job', () => {
    upsertJobDefinition({
      name: 'reenable-job',
      description: '',
      project: 'proj',
      project_root: '/proj',
      script: 'run.sh',
      args: [],
      cron: '0 * * * *',
      timezone: 'UTC',
      retries: 0,
      retry_delay_ms: 60000,
      alert_level: 'alert',
      timeout_ms: 60000,
      lockfile: null,
      enabled: false,
    });

    setJobEnabled('reenable-job', true);
    expect(getJob('reenable-job')!.enabled).toBe(true);
  });
});

describe('insertJobRunLog / getJobRunLogs', () => {
  it('stores a log and retrieves it ordered by started_at desc', () => {
    upsertJobDefinition({
      name: 'log-job',
      description: '',
      project: 'proj',
      project_root: '/proj',
      script: 'run.sh',
      args: [],
      cron: '0 * * * *',
      timezone: 'UTC',
      retries: 0,
      retry_delay_ms: 60000,
      alert_level: 'alert',
      timeout_ms: 60000,
      lockfile: null,
      enabled: true,
    });

    insertJobRunLog({
      id: 'run-aaa',
      job_name: 'log-job',
      triggered_by: 'cron',
      started_at: '2024-08-01T10:00:00.000Z',
      status: 'ok',
      pid: null,
      retry_attempt: 0,
    });

    insertJobRunLog({
      id: 'run-bbb',
      job_name: 'log-job',
      triggered_by: 'cron',
      started_at: '2024-08-02T10:00:00.000Z',
      status: 'fail',
      pid: null,
      retry_attempt: 0,
    });

    const logs = getJobRunLogs('log-job');
    expect(logs).toHaveLength(2);
    // Most recent first
    expect(logs[0].id).toBe('run-bbb');
    expect(logs[1].id).toBe('run-aaa');
  });

  it('respects the limit parameter', () => {
    upsertJobDefinition({
      name: 'limit-job',
      description: '',
      project: 'proj',
      project_root: '/proj',
      script: 'run.sh',
      args: [],
      cron: '0 * * * *',
      timezone: 'UTC',
      retries: 0,
      retry_delay_ms: 60000,
      alert_level: 'alert',
      timeout_ms: 60000,
      lockfile: null,
      enabled: true,
    });

    for (let i = 0; i < 5; i++) {
      insertJobRunLog({
        id: `run-limit-${i}`,
        job_name: 'limit-job',
        triggered_by: 'cron',
        started_at: `2024-08-0${i + 1}T10:00:00.000Z`,
        status: 'ok',
        pid: null,
        retry_attempt: 0,
      });
    }

    const logs = getJobRunLogs('limit-job', 3);
    expect(logs).toHaveLength(3);
  });
});

describe('getRunningJobNames', () => {
  it('returns names of jobs with status=running', () => {
    upsertJobDefinition({
      name: 'running-job',
      description: '',
      project: 'proj',
      project_root: '/proj',
      script: 'run.sh',
      args: [],
      cron: '0 * * * *',
      timezone: 'UTC',
      retries: 0,
      retry_delay_ms: 60000,
      alert_level: 'alert',
      timeout_ms: 60000,
      lockfile: null,
      enabled: true,
    });

    insertJobRunLog({
      id: 'run-active',
      job_name: 'running-job',
      triggered_by: 'cron',
      started_at: new Date().toISOString(),
      status: 'running',
      pid: null,
      retry_attempt: 0,
    });

    const names = getRunningJobNames();
    expect(names).toContain('running-job');
  });

  it('does not return completed jobs', () => {
    upsertJobDefinition({
      name: 'done-job',
      description: '',
      project: 'proj',
      project_root: '/proj',
      script: 'run.sh',
      args: [],
      cron: '0 * * * *',
      timezone: 'UTC',
      retries: 0,
      retry_delay_ms: 60000,
      alert_level: 'alert',
      timeout_ms: 60000,
      lockfile: null,
      enabled: true,
    });

    insertJobRunLog({
      id: 'run-done',
      job_name: 'done-job',
      triggered_by: 'cron',
      started_at: new Date().toISOString(),
      status: 'running',
      pid: null,
      retry_attempt: 0,
    });

    updateJobRunLog('run-done', {
      status: 'ok',
      finished_at: new Date().toISOString(),
      duration_ms: 500,
      exit_code: 0,
    });

    const names = getRunningJobNames();
    expect(names).not.toContain('done-job');
  });
});

describe('markStaleRunsAsFailed', () => {
  it('marks old running rows as failed', () => {
    upsertJobDefinition({
      name: 'stale-job',
      description: '',
      project: 'proj',
      project_root: '/proj',
      script: 'run.sh',
      args: [],
      cron: '0 * * * *',
      timezone: 'UTC',
      retries: 0,
      retry_delay_ms: 60000,
      alert_level: 'alert',
      timeout_ms: 60000,
      lockfile: null,
      enabled: true,
    });

    // Insert a run that started 2 hours ago (stale)
    const staleTime = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    insertJobRunLog({
      id: 'run-stale',
      job_name: 'stale-job',
      triggered_by: 'cron',
      started_at: staleTime,
      status: 'running',
      pid: null,
      retry_attempt: 0,
    });

    // Grace period of 1 hour means 2-hour-old runs are stale
    const affected = markStaleRunsAsFailed(3600);
    expect(affected.map((r: { job_name: string }) => r.job_name)).toContain(
      'stale-job',
    );

    const logs = getJobRunLogs('stale-job');
    expect(logs[0].status).toBe('fail');
    expect(logs[0].error).toBe('Interrupted by restart');
  });

  it('does not touch recently-started runs within grace period', () => {
    upsertJobDefinition({
      name: 'fresh-job',
      description: '',
      project: 'proj',
      project_root: '/proj',
      script: 'run.sh',
      args: [],
      cron: '0 * * * *',
      timezone: 'UTC',
      retries: 0,
      retry_delay_ms: 60000,
      alert_level: 'alert',
      timeout_ms: 60000,
      lockfile: null,
      enabled: true,
    });

    // Insert a run started 10 seconds ago (fresh)
    const recentTime = new Date(Date.now() - 10000).toISOString();
    insertJobRunLog({
      id: 'run-fresh',
      job_name: 'fresh-job',
      triggered_by: 'cron',
      started_at: recentTime,
      status: 'running',
      pid: null,
      retry_attempt: 0,
    });

    // Grace period of 1 hour - fresh run should NOT be marked stale
    markStaleRunsAsFailed(3600);

    const logs = getJobRunLogs('fresh-job');
    expect(logs[0].status).toBe('running');
  });
});

// --- RegisteredGroup isMain round-trip ---

describe('registered group isMain', () => {
  it('persists isMain=true through set/get round-trip', () => {
    setRegisteredGroup('main@s.whatsapp.net', {
      name: 'Main Chat',
      folder: 'whatsapp_main',
      trigger: '@Andy',
      added_at: '2024-01-01T00:00:00.000Z',
      isMain: true,
    });

    const groups = getAllRegisteredGroups();
    const group = groups['main@s.whatsapp.net'];
    expect(group).toBeDefined();
    expect(group.isMain).toBe(true);
    expect(group.folder).toBe('whatsapp_main');
  });

  it('omits isMain for non-main groups', () => {
    setRegisteredGroup('group@g.us', {
      name: 'Family Chat',
      folder: 'whatsapp_family-chat',
      trigger: '@Andy',
      added_at: '2024-01-01T00:00:00.000Z',
    });

    const groups = getAllRegisteredGroups();
    const group = groups['group@g.us'];
    expect(group).toBeDefined();
    expect(group.isMain).toBeUndefined();
  });
});
