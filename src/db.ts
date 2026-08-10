import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

import { ASSISTANT_NAME, DATA_DIR, STORE_DIR } from './config.js';
import { isGraderStudentVerdictUnit } from './grader-output-gate.js';
import { isValidGroupFolder } from './group-folder.js';
import { logger } from './logger.js';
import type { EmailActionState } from './email-action.js';
import {
  Job,
  JobDefinition,
  JobRunLog,
  NewMessage,
  RegisteredGroup,
  ScheduledTask,
  TaskRunLog,
} from './types.js';

let db: Database.Database;

function createSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      jid TEXT PRIMARY KEY,
      name TEXT,
      last_message_time TEXT,
      channel TEXT,
      is_group INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT,
      chat_jid TEXT,
      sender TEXT,
      sender_name TEXT,
      content TEXT,
      timestamp TEXT,
      is_from_me INTEGER,
      is_bot_message INTEGER DEFAULT 0,
      PRIMARY KEY (id, chat_jid),
      FOREIGN KEY (chat_jid) REFERENCES chats(jid)
    );
    CREATE INDEX IF NOT EXISTS idx_timestamp ON messages(timestamp);

    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      group_folder TEXT NOT NULL,
      chat_jid TEXT NOT NULL,
      prompt TEXT NOT NULL,
      schedule_type TEXT NOT NULL,
      schedule_value TEXT NOT NULL,
      next_run TEXT,
      last_run TEXT,
      last_result TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_next_run ON scheduled_tasks(next_run);
    CREATE INDEX IF NOT EXISTS idx_status ON scheduled_tasks(status);

    CREATE TABLE IF NOT EXISTS task_run_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      run_at TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      status TEXT NOT NULL,
      result TEXT,
      error TEXT,
      FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id)
    );
    CREATE INDEX IF NOT EXISTS idx_task_run_logs ON task_run_logs(task_id, run_at);

    CREATE TABLE IF NOT EXISTS router_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      group_folder TEXT PRIMARY KEY,
      session_id TEXT NOT NULL
    );
    -- Entity-anchored Slack threading: maps a minion work-unit key
    -- (e.g. "sales:entry:42") to the ts of the FIRST message posted about it,
    -- so every later post with the same key threads under one root instead of
    -- scattering across the channel. Generalizes the healer's incidents.thread_ts
    -- to all minions. Per-channel: Slack threads cannot span channels.
    CREATE TABLE IF NOT EXISTS slack_thread_anchors (
      channel TEXT NOT NULL,
      thread_key TEXT NOT NULL,
      thread_ts TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_activity_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (channel, thread_key)
    );
    -- Approvals awaiting a Gmail-confirmed send. A handoff is progress only;
    -- anything still here past the grace period is an approved email that never
    -- went out. See send-watchdog.ts.
    CREATE TABLE IF NOT EXISTS pending_sends (
      draft_ts TEXT PRIMARY KEY,
      action_id TEXT,
      group_folder TEXT NOT NULL,
      chat_jid TEXT NOT NULL,
      thread_ts TEXT,
      gmail_thread_id TEXT,
      recipient TEXT,
      lead_ref TEXT,
      approved_subject TEXT,
      approved_content_sha256 TEXT,
      approved_at TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'approved',
      handoff_observed_at TEXT,
      handoff_message_id TEXT,
      mailman_started_at TEXT,
      handoff_alerted_at TEXT,
      execution_started_at TEXT,
      gmail_message_id TEXT,
      gmail_result_thread_id TEXT,
      completed_at TEXT,
      alerted_at TEXT,
      last_error_code TEXT,
      last_event_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_pending_sends_group
      ON pending_sends (group_folder, approved_at);
    CREATE TABLE IF NOT EXISTS email_send_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      action_id TEXT NOT NULL,
      stage TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      code TEXT,
      gmail_message_id TEXT,
      gmail_thread_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_email_send_events_action
      ON email_send_events (action_id, sequence);
    CREATE TABLE IF NOT EXISTS registered_groups (
      jid TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      folder TEXT NOT NULL UNIQUE,
      trigger_pattern TEXT NOT NULL,
      added_at TEXT NOT NULL,
      container_config TEXT,
      requires_trigger INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS jobs (
      name TEXT PRIMARY KEY,
      description TEXT NOT NULL DEFAULT '',
      project TEXT NOT NULL,
      project_root TEXT NOT NULL,
      script TEXT NOT NULL,
      args TEXT DEFAULT '[]',
      cron TEXT NOT NULL,
      timezone TEXT DEFAULT 'America/Chicago',
      retries INTEGER DEFAULT 0,
      retry_delay_ms INTEGER DEFAULT 60000,
      alert_level TEXT DEFAULT 'alert',
      timeout_ms INTEGER DEFAULT 5400000,
      lockfile TEXT,
      run_interval_days INTEGER,
      enabled INTEGER DEFAULT 1,
      next_run TEXT,
      last_run TEXT,
      last_result TEXT,
      last_duration_ms INTEGER,
      last_output TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_next_run ON jobs(next_run);
    CREATE INDEX IF NOT EXISTS idx_jobs_enabled ON jobs(enabled);

    CREATE TABLE IF NOT EXISTS job_run_logs (
      id TEXT PRIMARY KEY,
      job_name TEXT NOT NULL,
      triggered_by TEXT NOT NULL DEFAULT 'cron',
      started_at TEXT NOT NULL,
      finished_at TEXT,
      duration_ms INTEGER,
      exit_code INTEGER,
      pid INTEGER,
      status TEXT DEFAULT 'running',
      output TEXT,
      error TEXT,
      log_file TEXT,
      retry_attempt INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_job_run_logs_name ON job_run_logs(job_name, started_at);
    CREATE INDEX IF NOT EXISTS idx_job_run_logs_status ON job_run_logs(status);

    CREATE TABLE IF NOT EXISTS email_tracking (
      tracking_id TEXT PRIMARY KEY,
      lead_id INTEGER NOT NULL,
      email_type TEXT NOT NULL DEFAULT 'initial',
      sent_at TEXT NOT NULL,
      first_opened_at TEXT,
      last_opened_at TEXT,
      open_count INTEGER DEFAULT 0,
      last_user_agent TEXT,
      last_notified_at TEXT
    );

    CREATE TABLE IF NOT EXISTS autonomy_trust (
      group_folder TEXT NOT NULL,
      category TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      streak INTEGER NOT NULL DEFAULT 0,
      drafts INTEGER NOT NULL DEFAULT 0,
      approved_clean INTEGER NOT NULL DEFAULT 0,
      corrected INTEGER NOT NULL DEFAULT 0,
      vetoed INTEGER NOT NULL DEFAULT 0,
      auto_approved INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT,
      PRIMARY KEY (group_folder, category)
    );

    CREATE TABLE IF NOT EXISTS autonomy_draft_events (
      draft_id TEXT PRIMARY KEY,
      chat_jid TEXT NOT NULL,
      group_folder TEXT NOT NULL,
      category TEXT NOT NULL,
      outcome TEXT NOT NULL DEFAULT 'pending',
      draft_ts TEXT NOT NULL,
      thread_ts TEXT,
      resolved_ts TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_autonomy_events_pending
      ON autonomy_draft_events(outcome, group_folder);

    CREATE TABLE IF NOT EXISTS autonomy_pending (
      draft_id TEXT PRIMARY KEY,
      chat_jid TEXT NOT NULL,
      group_folder TEXT NOT NULL,
      category TEXT NOT NULL,
      thread_ts TEXT,
      draft_ts TEXT NOT NULL,
      notice_ts TEXT,
      expires_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_autonomy_pending_status
      ON autonomy_pending(status, expires_at);
  `);

  // Add context_mode column if it doesn't exist (migration for existing DBs)
  try {
    database.exec(
      `ALTER TABLE scheduled_tasks ADD COLUMN context_mode TEXT DEFAULT 'isolated'`,
    );
  } catch {
    /* column already exists */
  }

  // Add last_activity_at to slack_thread_anchors (staleness rollover). Backfill
  // existing rows to created_at so a dormant anchor rolls over on next touch.
  try {
    database.exec(
      `ALTER TABLE slack_thread_anchors ADD COLUMN last_activity_at TEXT NOT NULL DEFAULT ''`,
    );
    database.exec(
      `UPDATE slack_thread_anchors SET last_activity_at = created_at WHERE last_activity_at = ''`,
    );
  } catch {
    /* column already exists */
  }

  // Add is_bot_message column if it doesn't exist (migration for existing DBs)
  try {
    database.exec(
      `ALTER TABLE messages ADD COLUMN is_bot_message INTEGER DEFAULT 0`,
    );
    // Backfill: mark existing bot messages that used the content prefix pattern
    database
      .prepare(`UPDATE messages SET is_bot_message = 1 WHERE content LIKE ?`)
      .run(`${ASSISTANT_NAME}:%`);
  } catch {
    /* column already exists */
  }

  // Add is_main column if it doesn't exist (migration for existing DBs)
  try {
    database.exec(
      `ALTER TABLE registered_groups ADD COLUMN is_main INTEGER DEFAULT 0`,
    );
    // Backfill: existing rows with folder = 'main' are the main group
    database.exec(
      `UPDATE registered_groups SET is_main = 1 WHERE folder = 'main'`,
    );
  } catch {
    /* column already exists */
  }

  // Add thread_ts column for Slack thread support
  try {
    database.exec(`ALTER TABLE messages ADD COLUMN thread_ts TEXT`);
    database.exec(
      `CREATE INDEX IF NOT EXISTS idx_thread ON messages(chat_jid, thread_ts, timestamp)`,
    );
  } catch {
    /* column already exists */
  }

  // Add from_group column — identifies which agent sent the message (null = human)
  try {
    database.exec(`ALTER TABLE messages ADD COLUMN from_group TEXT`);
    // Backfill: set from_group for existing bot messages based on channel ownership
    database.exec(`
      UPDATE messages SET from_group = (
        SELECT rg.folder FROM registered_groups rg WHERE rg.jid = messages.chat_jid
      ) WHERE is_from_me = 1 AND from_group IS NULL
    `);
  } catch {
    /* column already exists */
  }
  // Add channel and is_group columns if they don't exist (migration for existing DBs)
  try {
    database.exec(`ALTER TABLE chats ADD COLUMN channel TEXT`);
    database.exec(`ALTER TABLE chats ADD COLUMN is_group INTEGER DEFAULT 0`);
    // Backfill from JID patterns
    database.exec(
      `UPDATE chats SET channel = 'whatsapp', is_group = 1 WHERE jid LIKE '%@g.us'`,
    );
    database.exec(
      `UPDATE chats SET channel = 'whatsapp', is_group = 0 WHERE jid LIKE '%@s.whatsapp.net'`,
    );
    database.exec(
      `UPDATE chats SET channel = 'discord', is_group = 1 WHERE jid LIKE 'dc:%'`,
    );
    database.exec(
      `UPDATE chats SET channel = 'telegram', is_group = 1 WHERE jid LIKE 'tg:%'`,
    );
  } catch {
    /* columns already exist */
  }

  // Add run_interval_days column to jobs table (migration for existing DBs)
  try {
    database.exec(`ALTER TABLE jobs ADD COLUMN run_interval_days INTEGER`);
  } catch {
    /* column already exists */
  }

  // Durable approval-to-Gmail binding for restart-safe reply authorization.
  try {
    database.exec(`ALTER TABLE pending_sends ADD COLUMN gmail_thread_id TEXT`);
  } catch {
    /* column already exists */
  }
  database.exec(
    `CREATE INDEX IF NOT EXISTS idx_pending_sends_gmail_thread
       ON pending_sends (gmail_thread_id, approved_at)`,
  );
  // Durable delivery-stage evidence. These columns distinguish "Sales never
  // handed off" from "the handoff routed but Mailman never started", so the
  // operator gets a precise early alert instead of waiting for the generic
  // five-minute send timeout.
  for (const column of [
    'handoff_observed_at TEXT',
    'handoff_message_id TEXT',
    'mailman_started_at TEXT',
    'handoff_alerted_at TEXT',
  ]) {
    try {
      database.exec(`ALTER TABLE pending_sends ADD COLUMN ${column}`);
    } catch {
      /* column already exists */
    }
  }
  database.exec(
    `CREATE INDEX IF NOT EXISTS idx_pending_sends_handoff
       ON pending_sends (handoff_observed_at, mailman_started_at, handoff_alerted_at)`,
  );

  // NC-20260802-009: one immutable identity and append-only stage history for
  // every newly approved customer email. Existing legacy rows remain visible
  // but cannot execute through the action-bound path until re-approved.
  for (const column of [
    'action_id TEXT',
    'approved_subject TEXT',
    'approved_content_sha256 TEXT',
    "state TEXT NOT NULL DEFAULT 'approved'",
    'execution_started_at TEXT',
    'gmail_message_id TEXT',
    'gmail_result_thread_id TEXT',
    'completed_at TEXT',
    'alerted_at TEXT',
    'last_error_code TEXT',
    'last_event_at TEXT',
  ]) {
    try {
      database.exec(`ALTER TABLE pending_sends ADD COLUMN ${column}`);
    } catch {
      /* column already exists */
    }
  }
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_sends_action
      ON pending_sends (action_id) WHERE action_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_pending_sends_state
      ON pending_sends (state, approved_at);
    CREATE TABLE IF NOT EXISTS email_send_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      action_id TEXT NOT NULL,
      stage TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      code TEXT,
      gmail_message_id TEXT,
      gmail_thread_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_email_send_events_action
      ON email_send_events (action_id, sequence);
  `);
}

export function initDatabase(): void {
  const dbPath = path.join(STORE_DIR, 'messages.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  createSchema(db);

  // Migrate from JSON files if they exist
  migrateJsonState();
}

/** @internal - for tests only. Creates a fresh in-memory database. */
export function _initTestDatabase(): void {
  db = new Database(':memory:');
  createSchema(db);
}

/** @internal - reproduces the production pending_sends schema before NC-009. */
export function _initLegacyPendingSendsTestDatabase(): void {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE pending_sends (
      draft_ts TEXT PRIMARY KEY,
      group_folder TEXT NOT NULL,
      chat_jid TEXT NOT NULL,
      thread_ts TEXT,
      recipient TEXT,
      lead_ref TEXT,
      approved_at TEXT NOT NULL
    );
    ALTER TABLE pending_sends ADD COLUMN gmail_thread_id TEXT;
    ALTER TABLE pending_sends ADD COLUMN handoff_observed_at TEXT;
    ALTER TABLE pending_sends ADD COLUMN handoff_message_id TEXT;
    ALTER TABLE pending_sends ADD COLUMN mailman_started_at TEXT;
    ALTER TABLE pending_sends ADD COLUMN handoff_alerted_at TEXT;
    CREATE INDEX idx_pending_sends_group
      ON pending_sends (group_folder, approved_at);
    CREATE INDEX idx_pending_sends_gmail_thread
      ON pending_sends (gmail_thread_id, approved_at);
    CREATE INDEX idx_pending_sends_handoff
      ON pending_sends (handoff_observed_at, mailman_started_at, handoff_alerted_at);
  `);
  createSchema(db);
}

/**
 * Store chat metadata only (no message content).
 * Used for all chats to enable group discovery without storing sensitive content.
 */
export function storeChatMetadata(
  chatJid: string,
  timestamp: string,
  name?: string,
  channel?: string,
  isGroup?: boolean,
): void {
  const ch = channel ?? null;
  const group = isGroup === undefined ? null : isGroup ? 1 : 0;

  if (name) {
    // Update with name, preserving existing timestamp if newer
    db.prepare(
      `
      INSERT INTO chats (jid, name, last_message_time, channel, is_group) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(jid) DO UPDATE SET
        name = excluded.name,
        last_message_time = MAX(last_message_time, excluded.last_message_time),
        channel = COALESCE(excluded.channel, channel),
        is_group = COALESCE(excluded.is_group, is_group)
    `,
    ).run(chatJid, name, timestamp, ch, group);
  } else {
    // Update timestamp only, preserve existing name if any
    db.prepare(
      `
      INSERT INTO chats (jid, name, last_message_time, channel, is_group) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(jid) DO UPDATE SET
        last_message_time = MAX(last_message_time, excluded.last_message_time),
        channel = COALESCE(excluded.channel, channel),
        is_group = COALESCE(excluded.is_group, is_group)
    `,
    ).run(chatJid, chatJid, timestamp, ch, group);
  }
}

/**
 * Update chat name without changing timestamp for existing chats.
 * New chats get the current time as their initial timestamp.
 * Used during group metadata sync.
 */
export function updateChatName(chatJid: string, name: string): void {
  db.prepare(
    `
    INSERT INTO chats (jid, name, last_message_time) VALUES (?, ?, ?)
    ON CONFLICT(jid) DO UPDATE SET name = excluded.name
  `,
  ).run(chatJid, name, new Date().toISOString());
}

export interface ChatInfo {
  jid: string;
  name: string;
  last_message_time: string;
  channel: string;
  is_group: number;
}

/**
 * Get all known chats, ordered by most recent activity.
 */
export function getAllChats(): ChatInfo[] {
  return db
    .prepare(
      `
    SELECT jid, name, last_message_time, channel, is_group
    FROM chats
    ORDER BY last_message_time DESC
  `,
    )
    .all() as ChatInfo[];
}

/**
 * Get timestamp of last group metadata sync.
 */
export function getLastGroupSync(): string | null {
  // Store sync time in a special chat entry
  const row = db
    .prepare(`SELECT last_message_time FROM chats WHERE jid = '__group_sync__'`)
    .get() as { last_message_time: string } | undefined;
  return row?.last_message_time || null;
}

/**
 * Record that group metadata was synced.
 */
export function setLastGroupSync(): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR REPLACE INTO chats (jid, name, last_message_time) VALUES ('__group_sync__', '__group_sync__', ?)`,
  ).run(now);
}

/**
 * Store a message with full content.
 * Only call this for registered groups where message history is needed.
 */
export function storeMessage(msg: NewMessage): void {
  db.prepare(
    `INSERT OR REPLACE INTO messages (id, chat_jid, sender, sender_name, content, timestamp, is_from_me, is_bot_message, from_group, thread_ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    msg.id,
    msg.chat_jid,
    msg.sender,
    msg.sender_name,
    msg.content,
    msg.timestamp,
    msg.is_from_me ? 1 : 0,
    msg.is_bot_message ? 1 : 0,
    msg.from_group ?? null,
    msg.thread_ts ?? null,
  );
}

/**
 * Store a message directly.
 */
export function storeMessageDirect(msg: {
  id: string;
  chat_jid: string;
  sender: string;
  sender_name: string;
  content: string;
  timestamp: string;
  is_from_me: boolean;
  is_bot_message?: boolean;
  from_group?: string;
  thread_ts?: string;
}): void {
  db.prepare(
    `INSERT OR REPLACE INTO messages (id, chat_jid, sender, sender_name, content, timestamp, is_from_me, is_bot_message, from_group, thread_ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    msg.id,
    msg.chat_jid,
    msg.sender,
    msg.sender_name,
    msg.content,
    msg.timestamp,
    msg.is_from_me ? 1 : 0,
    msg.is_bot_message ? 1 : 0,
    msg.from_group ?? null,
    msg.thread_ts ?? null,
  );
}

/**
 * The single gate that decides whether anything wakes a group. Three classes of
 * row exist and each has exactly one correct answer:
 *
 *   1. human/inbound (`is_bot_message = 0`)            → always wakes.
 *   2. a group's own echo (`from_group` = that channel's
 *      owning folder)                                  → never wakes. This is
 *      the noop-container swarm guard of 2026-07-05: every ack and reply echo
 *      would otherwise re-spawn the agent that just wrote it.
 *   3. a CROSS-GROUP delivery (`from_group` set and different from the owner)
 *                                                      → must wake, because
 *      that is a handoff addressed to this group.
 *
 * Class 3 was the bug. It was collapsed into class 2 by a blanket
 * `COALESCE(is_bot_message,0) = 0`, so a `[HANDOFF: x→y]` could never start
 * group y — it only rode along as context when something else happened to wake
 * y anyway. Every delivery path hit this: mailman→sales via Slack
 * (`channels/slack.ts` stores host posts with `is_bot_message: true`),
 * sales→mailman via the Gmail jid (`ipc.ts` storeMessageDirect), chief→mailman,
 * booking→sales. Fixing it per-producer is whack-a-mole — every future channel
 * would reintroduce it — so the rule lives here, at the one consumer.
 *
 * `folderByJid` maps each polled chat to the group that owns it; a chat with no
 * mapping cannot distinguish class 2 from class 3 and so keeps the old
 * conservative behaviour.
 */
export function getNewMessages(
  jids: string[],
  lastTimestamp: string,
  botPrefix: string,
  folderByJid: Record<string, string> = {},
): { messages: NewMessage[]; newTimestamp: string } {
  if (jids.length === 0) return { messages: [], newTimestamp: lastTimestamp };

  const placeholders = jids.map(() => '?').join(',');
  // Content prefix filter is a backstop for pre-migration bot messages.
  const sql = `
    SELECT id, chat_jid, sender, sender_name, content, timestamp, from_group,
           thread_ts, COALESCE(is_bot_message, 0) AS is_bot_message
    FROM messages
    WHERE timestamp > ? AND chat_jid IN (${placeholders})
      AND content NOT LIKE ?
      AND content != '' AND content IS NOT NULL
    ORDER BY timestamp
  `;

  type Row = Omit<NewMessage, 'is_bot_message'> & { is_bot_message: number };
  const rows = db
    .prepare(sql)
    .all(lastTimestamp, ...jids, `${botPrefix}:%`) as Row[];

  // Advance the cursor over everything examined, not just what is returned, so
  // suppressed echoes are not rescanned on every poll.
  let newTimestamp = lastTimestamp;
  for (const row of rows) {
    if (row.timestamp > newTimestamp) newTimestamp = row.timestamp;
  }

  const messages: NewMessage[] = rows
    .filter((row) => {
      if (!row.is_bot_message) return true;
      const owner = folderByJid[row.chat_jid];
      return Boolean(row.from_group) && !!owner && row.from_group !== owner;
    })
    .map(({ is_bot_message, ...rest }) => ({
      ...rest,
      is_bot_message: Boolean(is_bot_message),
    }));

  return { messages, newTimestamp };
}

/**
 * Get messages since a timestamp for a specific chat.
 * @param threadTs - undefined = all messages (no thread filter),
 *                   null = root messages only (thread_ts IS NULL),
 *                   string = specific thread only
 */
export function getMessagesSince(
  chatJid: string,
  sinceTimestamp: string,
  botPrefix: string,
  excludeGroup?: string,
  threadTs?: string | null,
): NewMessage[] {
  // conditions and params MUST stay in lockstep — placeholders bind
  // positionally. (A past version pushed excludeGroup before botPrefix while
  // the conditions listed them in the opposite order, which bound the folder
  // name to `content NOT LIKE` and 'Bot:%' to `from_group !=` — silently
  // disabling the own-group exclusion and turning every ack/reply echo into
  // phantom pending work: the noop-container swarm of 2026-07-05.)
  const conditions = [
    'chat_jid = ?',
    'timestamp > ?',
    'content NOT LIKE ?',
    "content != ''",
    'content IS NOT NULL',
  ];
  const params: unknown[] = [chatJid, sinceTimestamp, `${botPrefix}:%`];

  if (excludeGroup) {
    conditions.push('(from_group IS NULL OR from_group != ?)');
    params.push(excludeGroup);
  } else {
    // In ordinary polling, bot-authored rows are outbound echoes and must not
    // be re-ingested. When excludeGroup is present, however, a bot row tagged
    // with another group is an intentional cross-group handoff and must remain
    // visible; callers separately discard untagged bot noise in that mode.
    conditions.push('COALESCE(is_bot_message, 0) = 0');
  }

  // Thread filter: undefined = no filter, null = root only, string = specific thread
  if (threadTs === null) {
    conditions.push('thread_ts IS NULL');
  } else if (threadTs !== undefined) {
    conditions.push('thread_ts = ?');
    params.push(threadTs);
  }

  const sql = `
    SELECT id, chat_jid, sender, sender_name, content, timestamp, from_group, thread_ts
    FROM messages
    WHERE ${conditions.join(' AND ')}
    ORDER BY timestamp
  `;
  return db.prepare(sql).all(...params) as NewMessage[];
}

/**
 * Look up a message by its ID (e.g. Gmail message ID).
 * Used by classify-ipc-handlers to retrieve body/sender for routing.
 */
export function getMessageById(
  messageId: string,
  chatJid?: string,
): NewMessage | undefined {
  const channelClause = chatJid ? ' AND chat_jid = ?' : '';
  return db
    .prepare(
      `SELECT id, chat_jid, sender, sender_name, content, timestamp, is_from_me, from_group, thread_ts
       FROM messages WHERE id = ?${channelClause}`,
    )
    .get(...(chatJid ? [messageId, chatJid] : [messageId])) as
    | NewMessage
    | undefined;
}

export function getLatestInboundByThread(
  threadTs: string,
): NewMessage | undefined {
  return db
    .prepare(
      `SELECT id, chat_jid, sender, sender_name, content, timestamp, is_from_me, from_group, thread_ts
       FROM messages
       WHERE thread_ts = ? AND is_from_me = 0
       ORDER BY timestamp DESC LIMIT 1`,
    )
    .get(threadTs) as NewMessage | undefined;
}

/** Latest host/bot-authored message inside one Slack work-item thread. */
export function getLatestBotMessageInThread(
  chatJid: string,
  threadTs: string,
): NewMessage | undefined {
  return db
    .prepare(
      `SELECT id, chat_jid, sender, sender_name, content, timestamp,
              is_from_me, is_bot_message, from_group, thread_ts
         FROM messages
        WHERE chat_jid = ?
          AND COALESCE(is_bot_message, 0) = 1
          AND (thread_ts = ? OR id = ?)
        ORDER BY timestamp DESC, rowid DESC
        LIMIT 1`,
    )
    .get(chatJid, threadTs, threadTs) as NewMessage | undefined;
}

/**
 * Get all message IDs stored for a given chat JID.
 * Used to seed in-memory dedup sets after restarts.
 */
export function getMessageIdsForJid(chatJid: string): string[] {
  const rows = db
    .prepare('SELECT id FROM messages WHERE chat_jid = ?')
    .all(chatJid) as Array<{ id: string }>;
  return rows.map((r) => r.id);
}

/**
 * Get the thread parent message (the message whose Slack ts matches the thread_ts).
 * In Slack, thread_ts of replies equals the ts (id) of the parent message.
 */
export function getThreadParent(
  chatJid: string,
  threadTs: string,
): NewMessage | undefined {
  return db
    .prepare(
      `SELECT id, chat_jid, sender, sender_name, content, timestamp, from_group, thread_ts
       FROM messages WHERE chat_jid = ? AND id = ?`,
    )
    .get(chatJid, threadTs) as NewMessage | undefined;
}

/**
 * Full thread history for context injection: the root (id == threadTs) plus every
 * reply (thread_ts == threadTs), oldest→newest, capped to the most recent `limit`.
 *
 * Unlike getMessagesSince, this deliberately does NOT exclude the group's own posts.
 * An operator's threaded reply is a response to the agent's OWN pending draft, so
 * that draft must be visible even after the group's Claude session rotated and lost
 * it from memory — otherwise the agent goes blind and drops the reply as an
 * unrelated "status update" (Travis Rose sales thread, 2026-07-06). Callers strip
 * mechanical noise ("[PROCESSING]" acks, untagged bot echoes) before formatting.
 */
export function getThreadContext(
  chatJid: string,
  threadTs: string,
  limit: number,
): NewMessage[] {
  const rows = db
    .prepare(
      `SELECT id, chat_jid, sender, sender_name, content, timestamp, is_from_me, from_group, thread_ts
       FROM messages
       WHERE chat_jid = ? AND (id = ? OR thread_ts = ?)
         AND content IS NOT NULL AND content != ''
       ORDER BY timestamp DESC
       LIMIT ?`,
    )
    .all(chatJid, threadTs, threadTs, limit) as NewMessage[];
  return rows.reverse();
}

function graderThreadOutput(
  chatJid: string,
  threadTs: string,
  since?: string,
): string[] {
  const sinceClause = since ? ' AND timestamp >= ?' : '';
  const params = since
    ? [chatJid, threadTs, threadTs, since]
    : [chatJid, threadTs, threadTs];
  const rows = db
    .prepare(
      `SELECT content FROM messages
       WHERE chat_jid = ? AND (id = ? OR thread_ts = ?)
         AND from_group = 'grader' AND is_from_me = 1
         AND content IS NOT NULL AND content != ''${sinceClause}`,
    )
    .all(...params) as Array<{ content: string }>;
  return rows.map((row) => row.content);
}

/** Restart-safe, rule-version-independent student-copy delivery proof. */
export function hasDeliveredGraderStudentCopy(
  chatJid: string,
  threadTs: string,
): boolean {
  return graderThreadOutput(chatJid, threadTs).some((content) =>
    isGraderStudentVerdictUnit(content),
  );
}

/** True when this run produced any grader output other than the host ack. */
export function hasGraderOutputInThread(
  chatJid: string,
  threadTs: string,
  since?: string,
): boolean {
  return graderThreadOutput(chatJid, threadTs, since).some(
    (content) => !content.startsWith('[PROCESSING]'),
  );
}

/**
 * Latest timestamp at which `fromGroup` posted a REAL response — its own output,
 * excluding the host-posted "[PROCESSING]" ack — in a chat/thread. Recovery uses
 * this as a completion signal: if the group already answered after the last inbound
 * message, the thread is handled, and re-spawning it on restart would just gum the
 * pipeline with a noop that steals a slot + memory from real work. Reads the minion's
 * own reply, so it covers BOTH the container path and inline handlers (e.g. contador
 * handling a webhook/handoff without spawning a container — the case the per-thread
 * cursor never covers). threadTs semantics mirror getMessagesSince: undefined = any
 * thread, null = root only, string = that specific thread.
 */
export function getLatestGroupResponse(
  chatJid: string,
  fromGroup: string,
  threadTs?: string | null,
): string | undefined {
  const conditions = [
    'chat_jid = ?',
    'from_group = ?',
    "content NOT LIKE '[PROCESSING]%'",
  ];
  const params: unknown[] = [chatJid, fromGroup];
  if (threadTs === null) {
    conditions.push('thread_ts IS NULL');
  } else if (threadTs !== undefined) {
    conditions.push('thread_ts = ?');
    params.push(threadTs);
  }
  const row = db
    .prepare(
      `SELECT timestamp FROM messages WHERE ${conditions.join(' AND ')} ORDER BY timestamp DESC LIMIT 1`,
    )
    .get(...params) as { timestamp: string } | undefined;
  return row?.timestamp;
}

export function createTask(
  task: Omit<ScheduledTask, 'last_run' | 'last_result'>,
): void {
  db.prepare(
    `
    INSERT INTO scheduled_tasks (id, group_folder, chat_jid, prompt, schedule_type, schedule_value, context_mode, next_run, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    task.id,
    task.group_folder,
    task.chat_jid,
    task.prompt,
    task.schedule_type,
    task.schedule_value,
    task.context_mode || 'isolated',
    task.next_run,
    task.status,
    task.created_at,
  );
}

export function getTaskById(id: string): ScheduledTask | undefined {
  return db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(id) as
    | ScheduledTask
    | undefined;
}

export function getTasksForGroup(groupFolder: string): ScheduledTask[] {
  return db
    .prepare(
      'SELECT * FROM scheduled_tasks WHERE group_folder = ? ORDER BY created_at DESC',
    )
    .all(groupFolder) as ScheduledTask[];
}

export function getAllTasks(): ScheduledTask[] {
  return db
    .prepare('SELECT * FROM scheduled_tasks ORDER BY created_at DESC')
    .all() as ScheduledTask[];
}

export function updateTask(
  id: string,
  updates: Partial<
    Pick<
      ScheduledTask,
      'prompt' | 'schedule_type' | 'schedule_value' | 'next_run' | 'status'
    >
  >,
): void {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.prompt !== undefined) {
    fields.push('prompt = ?');
    values.push(updates.prompt);
  }
  if (updates.schedule_type !== undefined) {
    fields.push('schedule_type = ?');
    values.push(updates.schedule_type);
  }
  if (updates.schedule_value !== undefined) {
    fields.push('schedule_value = ?');
    values.push(updates.schedule_value);
  }
  if (updates.next_run !== undefined) {
    fields.push('next_run = ?');
    values.push(updates.next_run);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }

  if (fields.length === 0) return;

  values.push(id);
  db.prepare(
    `UPDATE scheduled_tasks SET ${fields.join(', ')} WHERE id = ?`,
  ).run(...values);
}

export function deleteTask(id: string): void {
  // Delete child records first (FK constraint)
  db.prepare('DELETE FROM task_run_logs WHERE task_id = ?').run(id);
  db.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(id);
}

export function getDueTasks(): ScheduledTask[] {
  const now = new Date().toISOString();
  return db
    .prepare(
      `
    SELECT * FROM scheduled_tasks
    WHERE status = 'active' AND next_run IS NOT NULL AND next_run <= ?
    ORDER BY next_run
  `,
    )
    .all(now) as ScheduledTask[];
}

export function claimTaskRun(
  id: string,
  expectedNextRun: string,
  newNextRun: string | null,
): boolean {
  return (
    db
      .prepare(
        `UPDATE scheduled_tasks
            SET next_run = ?
          WHERE id = ?
            AND status = 'active'
            AND next_run = ?`,
      )
      .run(newNextRun, id, expectedNextRun).changes === 1
  );
}

const ORPHANED_ONCE_TASK_RESULT =
  'Error: claimed but never completed; daemon restarted mid-run';

export function failOrphanedOnceTasks(): ScheduledTask[] {
  const candidates = db
    .prepare(
      `SELECT * FROM scheduled_tasks
        WHERE schedule_type = 'once'
          AND status = 'active'
          AND next_run IS NULL
          AND last_run IS NULL`,
    )
    .all() as ScheduledTask[];
  if (candidates.length === 0) return [];

  const fail = db.transaction(() => {
    const update = db.prepare(
      `UPDATE scheduled_tasks
          SET status = 'error', last_result = ?
        WHERE id = ?
          AND schedule_type = 'once'
          AND status = 'active'
          AND next_run IS NULL
          AND last_run IS NULL`,
    );
    return candidates.filter(
      (task) => update.run(ORPHANED_ONCE_TASK_RESULT, task.id).changes === 1,
    );
  });
  return fail();
}

export function updateTaskAfterRun(
  id: string,
  nextRun: string | null,
  lastResult: string,
): void {
  const now = new Date().toISOString();
  db.prepare(
    `
    UPDATE scheduled_tasks
    SET next_run = ?, last_run = ?, last_result = ?, status = CASE WHEN ? IS NULL THEN 'completed' ELSE status END
    WHERE id = ?
  `,
  ).run(nextRun, now, lastResult, nextRun, id);
}

export function logTaskRun(log: TaskRunLog): void {
  db.prepare(
    `
    INSERT INTO task_run_logs (task_id, run_at, duration_ms, status, result, error)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  ).run(
    log.task_id,
    log.run_at,
    log.duration_ms,
    log.status,
    log.result,
    log.error,
  );
}

// --- Router state accessors ---

export function getRouterState(key: string): string | undefined {
  const row = db
    .prepare('SELECT value FROM router_state WHERE key = ?')
    .get(key) as { value: string } | undefined;
  return row?.value;
}

export function setRouterState(key: string, value: string): void {
  db.prepare(
    'INSERT OR REPLACE INTO router_state (key, value) VALUES (?, ?)',
  ).run(key, value);
}

// --- Slack thread anchors (entity-keyed threading) ---

export interface ThreadAnchor {
  threadTs: string;
  /** ISO timestamp of the most recent post into this thread. */
  lastActivityAt: string;
}

/** The current anchor for a (channel, entity key), or undefined if none yet. */
export function resolveThreadAnchor(
  channel: string,
  threadKey: string,
): ThreadAnchor | undefined {
  const row = db
    .prepare(
      'SELECT thread_ts, last_activity_at FROM slack_thread_anchors WHERE channel = ? AND thread_key = ?',
    )
    .get(channel, threadKey) as
    | { thread_ts: string; last_activity_at: string }
    | undefined;
  return row
    ? { threadTs: row.thread_ts, lastActivityAt: row.last_activity_at }
    : undefined;
}

/**
 * Record the root ts for a (channel, entity key). The FIRST post about a key
 * wins: ON CONFLICT DO NOTHING keeps the original root, so a race (two posts
 * with the same new key) can never split a work-unit across two threads.
 */
export function recordThreadAnchor(
  channel: string,
  threadKey: string,
  threadTs: string,
): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO slack_thread_anchors (channel, thread_key, thread_ts, created_at, last_activity_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(channel, thread_key) DO NOTHING`,
  ).run(channel, threadKey, threadTs, now, now);
}

/**
 * Repoint an existing anchor at a NEW root ts (staleness rollover): the prior
 * thread had gone dormant, so a fresh top-level post becomes the new root.
 * Unlike recordThreadAnchor this overwrites — the caller has already decided the
 * old thread is stale, so there is no work-unit to protect.
 */
export function rollThreadAnchor(
  channel: string,
  threadKey: string,
  threadTs: string,
): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO slack_thread_anchors (channel, thread_key, thread_ts, created_at, last_activity_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(channel, thread_key)
       DO UPDATE SET thread_ts = excluded.thread_ts, last_activity_at = excluded.last_activity_at`,
  ).run(channel, threadKey, threadTs, now, now);
}

/** Bump last_activity_at so an actively-used thread never goes stale. */
export function touchThreadAnchor(channel: string, threadKey: string): void {
  db.prepare(
    `UPDATE slack_thread_anchors SET last_activity_at = ? WHERE channel = ? AND thread_key = ?`,
  ).run(new Date().toISOString(), channel, threadKey);
}

// --- Approved-send watchdog accessors (see send-watchdog.ts) ---

export interface EmailSendActionRow {
  actionId?: string;
  draftTs: string;
  groupFolder: string;
  chatJid: string;
  threadTs?: string;
  gmailThreadId?: string;
  recipient?: string;
  leadRef?: string;
  approvedSubject?: string;
  approvedContentSha256?: string;
  approvedAt: string;
  state: EmailActionState;
  handoffObservedAt?: string;
  handoffMessageId?: string;
  mailmanStartedAt?: string;
  handoffAlertedAt?: string;
  executionStartedAt?: string;
  gmailMessageId?: string;
  gmailResultThreadId?: string;
  completedAt?: string;
  alertedAt?: string;
  lastErrorCode?: string;
  lastEventAt?: string;
}

type EmailSendDbRow = {
  action_id: string | null;
  draft_ts: string;
  group_folder: string;
  chat_jid: string;
  thread_ts: string | null;
  gmail_thread_id: string | null;
  recipient: string | null;
  lead_ref: string | null;
  approved_subject: string | null;
  approved_content_sha256: string | null;
  approved_at: string;
  state: EmailActionState;
  handoff_observed_at: string | null;
  handoff_message_id: string | null;
  mailman_started_at: string | null;
  handoff_alerted_at: string | null;
  execution_started_at: string | null;
  gmail_message_id: string | null;
  gmail_result_thread_id: string | null;
  completed_at: string | null;
  alerted_at: string | null;
  last_error_code: string | null;
  last_event_at: string | null;
};

const EMAIL_ACTION_SELECT = `action_id, draft_ts, group_folder, chat_jid,
  thread_ts, gmail_thread_id, recipient, lead_ref, approved_subject,
  approved_content_sha256, approved_at, state, handoff_observed_at,
  handoff_message_id, mailman_started_at, handoff_alerted_at,
  execution_started_at, gmail_message_id, gmail_result_thread_id,
  completed_at, alerted_at, last_error_code, last_event_at`;

function mapEmailSendAction(row: EmailSendDbRow): EmailSendActionRow {
  return {
    actionId: row.action_id ?? undefined,
    draftTs: row.draft_ts,
    groupFolder: row.group_folder,
    chatJid: row.chat_jid,
    threadTs: row.thread_ts ?? undefined,
    gmailThreadId: row.gmail_thread_id ?? undefined,
    recipient: row.recipient ?? undefined,
    leadRef: row.lead_ref ?? undefined,
    approvedSubject: row.approved_subject ?? undefined,
    approvedContentSha256: row.approved_content_sha256 ?? undefined,
    approvedAt: row.approved_at,
    state: row.state,
    handoffObservedAt: row.handoff_observed_at ?? undefined,
    handoffMessageId: row.handoff_message_id ?? undefined,
    mailmanStartedAt: row.mailman_started_at ?? undefined,
    handoffAlertedAt: row.handoff_alerted_at ?? undefined,
    executionStartedAt: row.execution_started_at ?? undefined,
    gmailMessageId: row.gmail_message_id ?? undefined,
    gmailResultThreadId: row.gmail_result_thread_id ?? undefined,
    completedAt: row.completed_at ?? undefined,
    alertedAt: row.alerted_at ?? undefined,
    lastErrorCode: row.last_error_code ?? undefined,
    lastEventAt: row.last_event_at ?? undefined,
  };
}

function appendEmailSendEvent(
  actionId: string,
  stage: EmailActionState,
  occurredAt: string,
  opts: { code?: string; messageId?: string; threadId?: string } = {},
): void {
  db.prepare(
    `INSERT INTO email_send_events
       (action_id, stage, occurred_at, code, gmail_message_id, gmail_thread_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    actionId,
    stage,
    occurredAt,
    opts.code ?? null,
    opts.messageId ?? null,
    opts.threadId ?? null,
  );
}

export function recordPendingSend(row: {
  actionId?: string;
  draftTs: string;
  groupFolder: string;
  chatJid: string;
  threadTs?: string;
  gmailThreadId?: string;
  recipient?: string;
  leadRef?: string;
  approvedSubject?: string;
  approvedContentSha256?: string;
  approvedAt: string;
}): EmailSendActionRow {
  const insert = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO pending_sends
           (draft_ts, action_id, group_folder, chat_jid, thread_ts,
            gmail_thread_id, recipient, lead_ref, approved_subject,
            approved_content_sha256, approved_at, state, last_event_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?)
         ON CONFLICT(draft_ts) DO UPDATE SET
           action_id = COALESCE(pending_sends.action_id, excluded.action_id),
           gmail_thread_id = COALESCE(pending_sends.gmail_thread_id, excluded.gmail_thread_id),
           recipient = COALESCE(pending_sends.recipient, excluded.recipient),
           approved_subject = COALESCE(pending_sends.approved_subject, excluded.approved_subject),
           approved_content_sha256 = COALESCE(pending_sends.approved_content_sha256, excluded.approved_content_sha256)`,
      )
      .run(
        row.draftTs,
        row.actionId ?? null,
        row.groupFolder,
        row.chatJid,
        row.threadTs ?? null,
        row.gmailThreadId ?? null,
        row.recipient ?? null,
        row.leadRef ?? null,
        row.approvedSubject ?? null,
        row.approvedContentSha256 ?? null,
        row.approvedAt,
        row.approvedAt,
      );
    const stored = db
      .prepare(
        `SELECT ${EMAIL_ACTION_SELECT} FROM pending_sends WHERE draft_ts = ?`,
      )
      .get(row.draftTs) as EmailSendDbRow;
    const storedIdentity = db
      .prepare('SELECT rowid FROM pending_sends WHERE draft_ts = ?')
      .get(row.draftTs) as { rowid: number };
    if (
      result.changes > 0 &&
      stored.action_id === row.actionId &&
      row.actionId
    ) {
      const prior = db
        .prepare(`SELECT 1 FROM email_send_events WHERE action_id = ? LIMIT 1`)
        .get(row.actionId);
      if (!prior)
        appendEmailSendEvent(row.actionId, 'approved', row.approvedAt);
    }

    // A corrected approval in the same Slack work thread supersedes older
    // pre-Gmail actions. Without this transition, an omitted or stale
    // Action-ID can bind execution to an older approved card on the same Gmail
    // thread. Never supersede an action that may already have reached Gmail.
    if (row.actionId && row.threadTs) {
      const older = db
        .prepare(
          `SELECT action_id FROM pending_sends
            WHERE group_folder = ?
              AND chat_jid = ?
              AND thread_ts = ?
              AND draft_ts <> ?
              AND action_id IS NOT NULL
              AND state IN ('approved', 'handoff_routed', 'mailman_started', 'attention_required')
              AND (approved_at < ? OR (approved_at = ? AND rowid < ?))`,
        )
        .all(
          row.groupFolder,
          row.chatJid,
          row.threadTs,
          row.draftTs,
          stored.approved_at,
          stored.approved_at,
          storedIdentity.rowid,
        ) as Array<{ action_id: string }>;
      for (const priorAction of older) {
        const superseded = db
          .prepare(
            `UPDATE pending_sends
                SET state = 'blocked',
                    last_error_code = 'superseded_by_newer_approval',
                    last_event_at = ?
              WHERE action_id = ?
                AND state IN ('approved', 'handoff_routed', 'mailman_started', 'attention_required')`,
          )
          .run(row.approvedAt, priorAction.action_id);
        if (superseded.changes > 0) {
          appendEmailSendEvent(
            priorAction.action_id,
            'blocked',
            row.approvedAt,
            {
              code: 'superseded_by_newer_approval',
            },
          );
        }
      }
    }
    return mapEmailSendAction(stored);
  });
  return insert();
}

export function getPendingSendByActionId(
  actionId: string,
): EmailSendActionRow | undefined {
  const row = db
    .prepare(
      `SELECT ${EMAIL_ACTION_SELECT} FROM pending_sends WHERE action_id = ?`,
    )
    .get(actionId) as EmailSendDbRow | undefined;
  return row ? mapEmailSendAction(row) : undefined;
}

export function findPendingSendAction(opts: {
  actionId?: string;
  groupFolder?: string;
  recipient?: string;
  gmailThreadId?: string;
  approvedContentSha256?: string;
  includeConfirmed?: boolean;
}): { action?: EmailSendActionRow; ambiguous: boolean } {
  const conditions = ["state NOT IN ('blocked', 'uncertain')"];
  const params: unknown[] = [];
  if (!opts.includeConfirmed) conditions.push("state <> 'confirmed'");
  if (opts.approvedContentSha256) {
    conditions.push('approved_content_sha256 = ?');
    params.push(opts.approvedContentSha256);
  }
  if (opts.actionId) {
    conditions.push('action_id = ?');
    params.push(opts.actionId);
  }
  if (opts.groupFolder) {
    conditions.push('group_folder = ?');
    params.push(opts.groupFolder);
  }
  if (opts.recipient) {
    conditions.push("LOWER(COALESCE(recipient, '')) = ?");
    params.push(opts.recipient.toLowerCase());
  }
  if (opts.gmailThreadId) {
    conditions.push('gmail_thread_id = ?');
    params.push(opts.gmailThreadId);
  }
  const rows = db
    .prepare(
      `SELECT ${EMAIL_ACTION_SELECT} FROM pending_sends
       WHERE ${conditions.join(' AND ')} ORDER BY approved_at, rowid LIMIT 2`,
    )
    .all(...params) as EmailSendDbRow[];
  return {
    action: rows.length === 1 ? mapEmailSendAction(rows[0]) : undefined,
    ambiguous: rows.length > 1,
  };
}

/**
 * Clear outstanding expectations for a group. When the handoff names a
 * recipient, only that lead's row clears — otherwise a send for lead B would
 * mark lead A's approval fulfilled and hide a real drop. A handoff with no
 * parseable recipient clears the group's oldest row, which is the one the
 * agent was most likely acting on.
 */
export function clearPendingSends(
  groupFolder: string,
  recipient?: string,
): number {
  if (recipient) {
    return db
      .prepare(
        `DELETE FROM pending_sends
          WHERE group_folder = ? AND LOWER(COALESCE(recipient, '')) = ?`,
      )
      .run(groupFolder, recipient.toLowerCase()).changes;
  }
  return db
    .prepare(
      `DELETE FROM pending_sends WHERE draft_ts = (
         SELECT draft_ts FROM pending_sends
          WHERE group_folder = ? ORDER BY approved_at LIMIT 1)`,
    )
    .run(groupFolder).changes;
}

/**
 * Clear the oldest matching recipient across every group. A send is executed
 * by mailman's IPC while the expectation belongs to the group whose card was
 * approved, so the group folder cannot be the join key. Deleting one row keeps
 * concurrent approvals for the same address independently observable.
 */
export function clearPendingSendsByRecipient(recipient: string): number {
  return db
    .prepare(
      `DELETE FROM pending_sends
        WHERE rowid = (
          SELECT rowid FROM pending_sends
           WHERE LOWER(COALESCE(recipient, '')) = ?
           ORDER BY approved_at, rowid
           LIMIT 1
        )`,
    )
    .run(recipient.toLowerCase()).changes;
}

/** Record the exact point at which a routed Mailman handoff became durable. */
export function markPendingSendHandoff(
  groupFolder: string,
  recipient: string,
  messageId: string | undefined,
  observedAt: string,
): number {
  return db
    .prepare(
      `UPDATE pending_sends
          SET handoff_observed_at = COALESCE(handoff_observed_at, ?),
              handoff_message_id = COALESCE(handoff_message_id, ?)
        WHERE rowid = (
          SELECT rowid FROM pending_sends
           WHERE group_folder = ?
             AND LOWER(COALESCE(recipient, '')) = ?
             AND handoff_observed_at IS NULL
           ORDER BY approved_at, rowid
           LIMIT 1
        )`,
    )
    .run(observedAt, messageId ?? null, groupFolder, recipient.toLowerCase())
    .changes;
}

/** Mark that Mailman's message loop actually claimed the routed handoff. */
export function markPendingSendMailmanStarted(
  groupFolder: string,
  recipient: string,
  startedAt: string,
): number {
  return db
    .prepare(
      `UPDATE pending_sends
          SET mailman_started_at = COALESCE(mailman_started_at, ?)
        WHERE rowid = (
          SELECT rowid FROM pending_sends
           WHERE group_folder = ?
             AND LOWER(COALESCE(recipient, '')) = ?
             AND handoff_observed_at IS NOT NULL
             AND mailman_started_at IS NULL
           ORDER BY handoff_observed_at, rowid
           LIMIT 1
        )`,
    )
    .run(startedAt, groupFolder, recipient.toLowerCase()).changes;
}

/** Append the durable handoff stage for one exact approved action. */
export function markEmailActionHandoff(
  actionId: string,
  messageId: string | undefined,
  observedAt: string,
): number {
  const transition = db.transaction(() => {
    const result = db
      .prepare(
        `UPDATE pending_sends
            SET state = 'handoff_routed',
                handoff_observed_at = COALESCE(handoff_observed_at, ?),
                handoff_message_id = COALESCE(handoff_message_id, ?),
                last_event_at = ?
          WHERE action_id = ?
            AND state = 'approved'
            AND handoff_observed_at IS NULL`,
      )
      .run(observedAt, messageId ?? null, observedAt, actionId);
    if (result.changes > 0) {
      appendEmailSendEvent(actionId, 'handoff_routed', observedAt);
    }
    return result.changes;
  });
  return transition();
}

/** Append Mailman's claim for one exact approved action. */
export function markEmailActionMailmanStarted(
  actionId: string,
  startedAt: string,
): number {
  const transition = db.transaction(() => {
    const result = db
      .prepare(
        `UPDATE pending_sends
            SET state = 'mailman_started',
                mailman_started_at = COALESCE(mailman_started_at, ?),
                last_event_at = ?
          WHERE action_id = ?
            AND state IN ('handoff_routed', 'approved')
            AND mailman_started_at IS NULL`,
      )
      .run(startedAt, startedAt, actionId);
    if (result.changes > 0) {
      appendEmailSendEvent(actionId, 'mailman_started', startedAt);
    }
    return result.changes;
  });
  return transition();
}

export type EmailActionExecutionClaim =
  | { status: 'claimed'; action: EmailSendActionRow }
  | { status: 'confirmed'; action: EmailSendActionRow }
  | { status: 'held'; action?: EmailSendActionRow; reason: string };

/** Claim the final Gmail boundary exactly once. */
export function claimEmailActionExecution(
  actionId: string,
  approvedContentSha256: string,
  recipient: string | undefined,
  startedAt: string,
): EmailActionExecutionClaim {
  const claim = db.transaction((): EmailActionExecutionClaim => {
    const current = getPendingSendByActionId(actionId);
    if (!current) return { status: 'held', reason: 'unknown action identity' };
    if (current.state === 'confirmed') {
      return { status: 'confirmed', action: current };
    }
    if (current.state === 'executing' || current.state === 'uncertain') {
      return {
        status: 'held',
        action: current,
        reason: 'action has an uncertain prior Gmail attempt',
      };
    }
    if (current.state === 'blocked') {
      return { status: 'held', action: current, reason: 'action is blocked' };
    }
    if (current.approvedContentSha256 !== approvedContentSha256) {
      return {
        status: 'held',
        action: current,
        reason: 'subject/body hash does not match the approved action',
      };
    }
    if (
      recipient &&
      current.recipient &&
      current.recipient.toLowerCase() !== recipient.toLowerCase()
    ) {
      return {
        status: 'held',
        action: current,
        reason: 'recipient does not match the approved action',
      };
    }
    const result = db
      .prepare(
        `UPDATE pending_sends
            SET state = 'executing', execution_started_at = ?, last_event_at = ?
          WHERE action_id = ?
            AND state IN ('approved', 'handoff_routed', 'mailman_started', 'attention_required')`,
      )
      .run(startedAt, startedAt, actionId);
    if (result.changes === 0) {
      return {
        status: 'held',
        action: current,
        reason: `action state ${current.state} is not executable`,
      };
    }
    appendEmailSendEvent(actionId, 'executing', startedAt);
    return {
      status: 'claimed',
      action: getPendingSendByActionId(actionId)!,
    };
  });
  return claim();
}

export function confirmEmailAction(
  actionId: string,
  recipient: string,
  messageId: string,
  gmailThreadId: string,
  completedAt: string,
): number {
  const confirm = db.transaction(() => {
    const result = db
      .prepare(
        `UPDATE pending_sends
            SET state = 'confirmed', gmail_message_id = ?,
                gmail_result_thread_id = ?, completed_at = ?, last_event_at = ?,
                last_error_code = NULL
          WHERE action_id = ?
            AND state = 'executing'
            AND LOWER(COALESCE(recipient, '')) = ?`,
      )
      .run(
        messageId,
        gmailThreadId,
        completedAt,
        completedAt,
        actionId,
        recipient.toLowerCase(),
      );
    if (result.changes > 0) {
      appendEmailSendEvent(actionId, 'confirmed', completedAt, {
        messageId,
        threadId: gmailThreadId,
      });
    }
    return result.changes;
  });
  return confirm();
}

export function failEmailAction(
  actionId: string,
  state: 'blocked' | 'uncertain' | 'attention_required',
  code: string,
  occurredAt: string,
): number {
  const fail = db.transaction(() => {
    const result = db
      .prepare(
        `UPDATE pending_sends
            SET state = ?, last_error_code = ?, last_event_at = ?
          WHERE action_id = ? AND state <> 'confirmed'`,
      )
      .run(state, code, occurredAt, actionId);
    if (result.changes > 0) {
      appendEmailSendEvent(actionId, state, occurredAt, { code });
    }
    return result.changes;
  });
  return fail();
}

export function listEmailSendEvents(actionId: string): Array<{
  sequence: number;
  stage: EmailActionState;
  occurredAt: string;
  code?: string;
  gmailMessageId?: string;
  gmailThreadId?: string;
}> {
  const rows = db
    .prepare(
      `SELECT sequence, stage, occurred_at, code, gmail_message_id,
              gmail_thread_id FROM email_send_events
       WHERE action_id = ? ORDER BY sequence`,
    )
    .all(actionId) as Array<{
    sequence: number;
    stage: EmailActionState;
    occurred_at: string;
    code: string | null;
    gmail_message_id: string | null;
    gmail_thread_id: string | null;
  }>;
  return rows.map((row) => ({
    sequence: row.sequence,
    stage: row.stage,
    occurredAt: row.occurred_at,
    code: row.code ?? undefined,
    gmailMessageId: row.gmail_message_id ?? undefined,
    gmailThreadId: row.gmail_thread_id ?? undefined,
  }));
}

/** Host-approved reply binding used to reissue a mailman thread after restart. */
export function getPendingSendByGmailThread(gmailThreadId: string): {
  action?: EmailSendActionRow;
  candidates: EmailSendActionRow[];
  ambiguous: boolean;
} {
  const rows = db
    .prepare(
      `SELECT ${EMAIL_ACTION_SELECT} FROM pending_sends
        WHERE gmail_thread_id = ?
          AND recipient IS NOT NULL
          AND TRIM(recipient) <> ''
          AND state NOT IN ('confirmed', 'blocked', 'uncertain')
        ORDER BY approved_at DESC, rowid DESC
        LIMIT 2`,
    )
    .all(gmailThreadId) as EmailSendDbRow[];
  const candidates = rows.map(mapEmailSendAction);
  return {
    action: candidates.length === 1 ? candidates[0] : undefined,
    candidates,
    ambiguous: rows.length > 1,
  };
}

export function listOverdueSends(cutoffIso: string): EmailSendActionRow[] {
  const rows = db
    .prepare(
      `SELECT ${EMAIL_ACTION_SELECT} FROM pending_sends
       WHERE approved_at <= ?
         AND state NOT IN ('confirmed', 'blocked', 'uncertain')
         AND alerted_at IS NULL
       ORDER BY approved_at`,
    )
    .all(cutoffIso) as EmailSendDbRow[];
  return rows.map(mapEmailSendAction);
}

/** Routed handoffs that have not reached a Mailman container by the cutoff. */
export function listStalledMailmanHandoffs(cutoffIso: string): Array<{
  draftTs: string;
  groupFolder: string;
  chatJid: string;
  threadTs?: string;
  recipient?: string;
  leadRef?: string;
  approvedAt: string;
  handoffObservedAt?: string;
}> {
  const rows = db
    .prepare(
      `SELECT draft_ts, group_folder, chat_jid, thread_ts, recipient, lead_ref,
              approved_at, handoff_observed_at
         FROM pending_sends
        WHERE handoff_observed_at IS NOT NULL
          AND handoff_observed_at <= ?
          AND mailman_started_at IS NULL
          AND handoff_alerted_at IS NULL
          AND state NOT IN ('confirmed', 'blocked', 'uncertain')
        ORDER BY handoff_observed_at`,
    )
    .all(cutoffIso) as Array<{
    draft_ts: string;
    group_folder: string;
    chat_jid: string;
    thread_ts: string | null;
    recipient: string | null;
    lead_ref: string | null;
    approved_at: string;
    handoff_observed_at: string | null;
  }>;
  return rows.map((r) => ({
    draftTs: r.draft_ts,
    groupFolder: r.group_folder,
    chatJid: r.chat_jid,
    threadTs: r.thread_ts ?? undefined,
    recipient: r.recipient ?? undefined,
    leadRef: r.lead_ref ?? undefined,
    approvedAt: r.approved_at,
    handoffObservedAt: r.handoff_observed_at ?? undefined,
  }));
}

/** Preserve the send expectation but suppress duplicate handoff-stage alerts. */
export function markMailmanHandoffAlerted(
  draftTs: string,
  alertedAt: string,
): void {
  db.prepare(
    `UPDATE pending_sends
        SET handoff_alerted_at = COALESCE(handoff_alerted_at, ?)
      WHERE draft_ts = ?`,
  ).run(alertedAt, draftTs);
}

/**
 * Mark one alert per approval while preserving the action for audit/recovery.
 * An in-flight Gmail attempt is permanently uncertain: the host cannot know
 * whether a crash happened just before or just after Gmail accepted it, so an
 * alert must never make that action executable again.
 */
export function markPendingSendAlerted(draftTs: string): void {
  const occurredAt = new Date().toISOString();
  const transition = db.transaction(() => {
    const row = db
      .prepare('SELECT action_id, state FROM pending_sends WHERE draft_ts = ?')
      .get(draftTs) as
      | { action_id: string | null; state: EmailActionState }
      | undefined;
    if (!row) return;
    const nextState: EmailActionState =
      row.state === 'executing' ? 'uncertain' : 'attention_required';
    const code =
      nextState === 'uncertain'
        ? 'gmail_receipt_reconciliation_required'
        : 'send_not_confirmed';
    const result = db
      .prepare(
        `UPDATE pending_sends
            SET state = ?, alerted_at = ?, last_error_code = ?, last_event_at = ?
          WHERE draft_ts = ?
            AND alerted_at IS NULL
            AND state NOT IN ('confirmed', 'blocked', 'uncertain')`,
      )
      .run(nextState, occurredAt, code, occurredAt, draftTs);
    if (result.changes > 0 && row.action_id) {
      appendEmailSendEvent(row.action_id, nextState, occurredAt, { code });
    }
  });
  transition();
}

// --- Session accessors ---

export function getSession(groupFolder: string): string | undefined {
  const row = db
    .prepare('SELECT session_id FROM sessions WHERE group_folder = ?')
    .get(groupFolder) as { session_id: string } | undefined;
  return row?.session_id;
}

export function setSession(groupFolder: string, sessionId: string): void {
  db.prepare(
    'INSERT OR REPLACE INTO sessions (group_folder, session_id) VALUES (?, ?)',
  ).run(groupFolder, sessionId);
}

export function getAllSessions(): Record<string, string> {
  const rows = db
    .prepare('SELECT group_folder, session_id FROM sessions')
    .all() as Array<{ group_folder: string; session_id: string }>;
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.group_folder] = row.session_id;
  }
  return result;
}

// --- Registered group accessors ---

export function getRegisteredGroup(
  jid: string,
): (RegisteredGroup & { jid: string }) | undefined {
  const row = db
    .prepare('SELECT * FROM registered_groups WHERE jid = ?')
    .get(jid) as
    | {
        jid: string;
        name: string;
        folder: string;
        trigger_pattern: string;
        added_at: string;
        container_config: string | null;
        requires_trigger: number | null;
        is_main: number | null;
      }
    | undefined;
  if (!row) return undefined;
  if (!isValidGroupFolder(row.folder)) {
    logger.warn(
      { jid: row.jid, folder: row.folder },
      'Skipping registered group with invalid folder',
    );
    return undefined;
  }
  return {
    jid: row.jid,
    name: row.name,
    folder: row.folder,
    trigger: row.trigger_pattern,
    added_at: row.added_at,
    containerConfig: row.container_config
      ? JSON.parse(row.container_config)
      : undefined,
    requiresTrigger:
      row.requires_trigger === null ? undefined : row.requires_trigger === 1,
    isMain: row.is_main === 1 ? true : undefined,
  };
}

export function setRegisteredGroup(jid: string, group: RegisteredGroup): void {
  if (!isValidGroupFolder(group.folder)) {
    throw new Error(`Invalid group folder "${group.folder}" for JID ${jid}`);
  }
  db.prepare(
    `INSERT OR REPLACE INTO registered_groups (jid, name, folder, trigger_pattern, added_at, container_config, requires_trigger, is_main)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    jid,
    group.name,
    group.folder,
    group.trigger,
    group.added_at,
    group.containerConfig ? JSON.stringify(group.containerConfig) : null,
    group.requiresTrigger === undefined ? 1 : group.requiresTrigger ? 1 : 0,
    group.isMain ? 1 : 0,
  );
}

export function getAllRegisteredGroups(): Record<string, RegisteredGroup> {
  const rows = db.prepare('SELECT * FROM registered_groups').all() as Array<{
    jid: string;
    name: string;
    folder: string;
    trigger_pattern: string;
    added_at: string;
    container_config: string | null;
    requires_trigger: number | null;
    is_main: number | null;
  }>;
  const result: Record<string, RegisteredGroup> = {};
  for (const row of rows) {
    if (!isValidGroupFolder(row.folder)) {
      logger.warn(
        { jid: row.jid, folder: row.folder },
        'Skipping registered group with invalid folder',
      );
      continue;
    }
    result[row.jid] = {
      name: row.name,
      folder: row.folder,
      trigger: row.trigger_pattern,
      added_at: row.added_at,
      containerConfig: row.container_config
        ? JSON.parse(row.container_config)
        : undefined,
      requiresTrigger:
        row.requires_trigger === null ? undefined : row.requires_trigger === 1,
      isMain: row.is_main === 1 ? true : undefined,
    };
  }
  return result;
}

// --- Host Job Scheduling ---

export function upsertJobDefinition(def: JobDefinition): void {
  db.prepare(
    `
    INSERT INTO jobs (name, description, project, project_root, script, args, cron, timezone, retries, retry_delay_ms, alert_level, timeout_ms, lockfile, run_interval_days, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      description = excluded.description,
      project = excluded.project,
      project_root = excluded.project_root,
      script = excluded.script,
      args = excluded.args,
      cron = excluded.cron,
      timezone = excluded.timezone,
      retries = excluded.retries,
      retry_delay_ms = excluded.retry_delay_ms,
      alert_level = excluded.alert_level,
      timeout_ms = excluded.timeout_ms,
      lockfile = excluded.lockfile,
      run_interval_days = excluded.run_interval_days,
      enabled = excluded.enabled
  `,
  ).run(
    def.name,
    def.description,
    def.project,
    def.project_root,
    def.script,
    JSON.stringify(def.args),
    def.cron,
    def.timezone,
    def.retries,
    def.retry_delay_ms,
    def.alert_level,
    def.timeout_ms,
    def.lockfile,
    def.run_interval_days,
    def.enabled ? 1 : 0,
  );
}

export function updateJobRunState(
  name: string,
  state: {
    last_run: string;
    last_result: string;
    last_duration_ms: number;
    last_output: string | null;
    next_run: string | null;
  },
): void {
  db.prepare(
    `
    UPDATE jobs SET last_run = ?, last_result = ?, last_duration_ms = ?, last_output = ?, next_run = ?
    WHERE name = ?
  `,
  ).run(
    state.last_run,
    state.last_result,
    state.last_duration_ms,
    state.last_output,
    state.next_run,
    name,
  );
}

export function updateJobNextRun(name: string, nextRun: string): void {
  db.prepare('UPDATE jobs SET next_run = ? WHERE name = ?').run(nextRun, name);
}

export function getJob(name: string): Job | undefined {
  const row = db.prepare('SELECT * FROM jobs WHERE name = ?').get(name) as
    | Record<string, unknown>
    | undefined;
  if (!row) return undefined;
  return parseJobRow(row);
}

export function getAllJobs(): Job[] {
  const rows = db.prepare('SELECT * FROM jobs ORDER BY name').all() as Record<
    string,
    unknown
  >[];
  return rows.map(parseJobRow);
}

export function getDueJobs(nowUtc: string): Job[] {
  const rows = db
    .prepare(
      `
    SELECT * FROM jobs
    WHERE enabled = 1 AND next_run IS NOT NULL AND next_run <= ?
    ORDER BY next_run
  `,
    )
    .all(nowUtc) as Record<string, unknown>[];
  const jobs = rows.map(parseJobRow);

  // Filter out jobs with run_interval_days where last_run is too recent
  const nowMs = new Date(nowUtc).getTime();
  return jobs.filter((job) => {
    if (!job.run_interval_days || !job.last_run) return true;
    const lastRunMs = new Date(job.last_run).getTime();
    const intervalMs = job.run_interval_days * 86400000;
    return nowMs - lastRunMs >= intervalMs;
  });
}

export function setJobEnabled(name: string, enabled: boolean): void {
  db.prepare('UPDATE jobs SET enabled = ? WHERE name = ?').run(
    enabled ? 1 : 0,
    name,
  );
}

export function getJobNames(): string[] {
  const rows = db.prepare('SELECT name FROM jobs').all() as Array<{
    name: string;
  }>;
  return rows.map((r) => r.name);
}

function parseJobRow(row: Record<string, unknown>): Job {
  return {
    name: row.name as string,
    description: (row.description as string) || '',
    project: row.project as string,
    project_root: row.project_root as string,
    script: row.script as string,
    args: JSON.parse((row.args as string) || '[]'),
    cron: row.cron as string,
    timezone: (row.timezone as string) || 'America/Chicago',
    retries: (row.retries as number) || 0,
    retry_delay_ms: (row.retry_delay_ms as number) || 60000,
    alert_level: (row.alert_level as 'alert' | 'warn' | 'silent') || 'alert',
    timeout_ms: (row.timeout_ms as number) || 5400000,
    lockfile: (row.lockfile as string) || null,
    run_interval_days: (row.run_interval_days as number) || null,
    enabled: (row.enabled as number) === 1,
    next_run: (row.next_run as string) || null,
    last_run: (row.last_run as string) || null,
    last_result: (row.last_result as string) || null,
    last_duration_ms: (row.last_duration_ms as number) || null,
    last_output: (row.last_output as string) || null,
  };
}

// --- Job Run Logs ---

export function insertJobRunLog(
  log: Omit<
    JobRunLog,
    | 'finished_at'
    | 'duration_ms'
    | 'exit_code'
    | 'output'
    | 'error'
    | 'log_file'
  > &
    Partial<JobRunLog>,
): void {
  db.prepare(
    `
    INSERT INTO job_run_logs (id, job_name, triggered_by, started_at, finished_at, duration_ms, exit_code, pid, status, output, error, log_file, retry_attempt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    log.id,
    log.job_name,
    log.triggered_by,
    log.started_at,
    log.finished_at ?? null,
    log.duration_ms ?? null,
    log.exit_code ?? null,
    log.pid ?? null,
    log.status,
    log.output ?? null,
    log.error ?? null,
    log.log_file ?? null,
    log.retry_attempt,
  );
}

export function updateJobRunLog(
  id: string,
  updates: Partial<
    Pick<
      JobRunLog,
      | 'finished_at'
      | 'duration_ms'
      | 'exit_code'
      | 'pid'
      | 'status'
      | 'output'
      | 'error'
      | 'log_file'
    >
  >,
): void {
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, val] of Object.entries(updates)) {
    if (val !== undefined) {
      fields.push(`${key} = ?`);
      values.push(val);
    }
  }
  if (fields.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE job_run_logs SET ${fields.join(', ')} WHERE id = ?`).run(
    ...values,
  );
}

export function getJobRunLogs(jobName: string, limit = 10): JobRunLog[] {
  return db
    .prepare(
      `
    SELECT * FROM job_run_logs
    WHERE job_name = ?
    ORDER BY started_at DESC
    LIMIT ?
  `,
    )
    .all(jobName, limit) as JobRunLog[];
}

export function getRunningJobNames(): string[] {
  // A row stuck at 'running' beyond the job's timeout (plus a 5-minute grace)
  // is an orphan — its process was killed or the daemon restarted before the
  // close handler logged completion. runJob guarantees a real run is killed
  // and closed within timeout_ms, so such rows cannot be a live run. Treating
  // them as running would skip the job forever.
  const rows = db
    .prepare(
      `
    SELECT DISTINCT jrl.job_name
    FROM job_run_logs jrl
    JOIN jobs j ON j.name = jrl.job_name
    WHERE jrl.status = 'running'
      AND (julianday('now') - julianday(jrl.started_at)) * 86400000
          < j.timeout_ms + 300000
  `,
    )
    .all() as Array<{ job_name: string }>;
  return rows.map((r) => r.job_name);
}

export function markStaleRunsAsFailed(
  graceSec: number,
): Array<{ job_name: string; pid: number | null; lockfile: string | null }> {
  const cutoff = new Date(Date.now() - graceSec * 1000).toISOString();
  const staleRows = db
    .prepare(
      `
    SELECT jrl.id, jrl.job_name, jrl.pid, j.lockfile
    FROM job_run_logs jrl
    LEFT JOIN jobs j ON j.name = jrl.job_name
    WHERE jrl.status = 'running' AND jrl.started_at < ?
  `,
    )
    .all(cutoff) as Array<{
    id: string;
    job_name: string;
    pid: number | null;
    lockfile: string | null;
  }>;

  for (const row of staleRows) {
    db.prepare(
      `
      UPDATE job_run_logs SET status = 'fail', error = 'Interrupted by restart', finished_at = ?
      WHERE id = ?
    `,
    ).run(new Date().toISOString(), row.id);
  }

  return staleRows.map((r) => ({
    job_name: r.job_name,
    pid: r.pid,
    lockfile: r.lockfile,
  }));
}

// --- JSON migration ---

function migrateJsonState(): void {
  const migrateFile = (filename: string) => {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) return null;
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      fs.renameSync(filePath, `${filePath}.migrated`);
      return data;
    } catch {
      return null;
    }
  };

  // Migrate router_state.json
  const routerState = migrateFile('router_state.json') as {
    last_timestamp?: string;
    last_agent_timestamp?: Record<string, string>;
  } | null;
  if (routerState) {
    if (routerState.last_timestamp) {
      setRouterState('last_timestamp', routerState.last_timestamp);
    }
    if (routerState.last_agent_timestamp) {
      setRouterState(
        'last_agent_timestamp',
        JSON.stringify(routerState.last_agent_timestamp),
      );
    }
  }

  // Migrate sessions.json
  const sessions = migrateFile('sessions.json') as Record<
    string,
    string
  > | null;
  if (sessions) {
    for (const [folder, sessionId] of Object.entries(sessions)) {
      setSession(folder, sessionId);
    }
  }

  // Migrate registered_groups.json
  const groups = migrateFile('registered_groups.json') as Record<
    string,
    RegisteredGroup
  > | null;
  if (groups) {
    for (const [jid, group] of Object.entries(groups)) {
      try {
        setRegisteredGroup(jid, group);
      } catch (err) {
        logger.warn(
          { jid, folder: group.folder, err },
          'Skipping migrated registered group with invalid folder',
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Email open tracking
// ---------------------------------------------------------------------------

export function insertTrackingPixel(
  trackingId: string,
  leadId: number,
  emailType: string,
): void {
  db.prepare(
    `INSERT INTO email_tracking (tracking_id, lead_id, email_type, sent_at)
     VALUES (?, ?, ?, ?)`,
  ).run(trackingId, leadId, emailType, new Date().toISOString());
}

/** Look up a tracking token → lead_id. Used by unsubscribe handler. */
export function lookupTrackingToken(
  trackingId: string,
): { lead_id: number; email_type: string } | null {
  return (
    (db
      .prepare(
        'SELECT lead_id, email_type FROM email_tracking WHERE tracking_id = ?',
      )
      .get(trackingId) as
      | { lead_id: number; email_type: string }
      | undefined) ?? null
  );
}

export interface EmailOpenResult {
  leadId: number;
  emailType: string;
  openCount: number;
  firstOpenedAt: string;
  shouldNotify: boolean;
}

export function recordEmailOpen(
  trackingId: string,
  userAgent: string,
): EmailOpenResult | null {
  try {
    return recordEmailOpenUnsafe(trackingId, userAgent);
  } catch (err) {
    // A DB-write failure must not throw out of the tracking-pixel path —
    // the open is simply not recorded. Tagged for ops filtering.
    logger.error(
      { err, event: 'email_open_record_failed', tracking_id: trackingId },
      '[ERROR] recordEmailOpen failed',
    );
    return null;
  }
}

function recordEmailOpenUnsafe(
  trackingId: string,
  userAgent: string,
): EmailOpenResult | null {
  const row = db
    .prepare(
      `SELECT lead_id, email_type, open_count, first_opened_at, last_notified_at, sent_at
       FROM email_tracking WHERE tracking_id = ?`,
    )
    .get(trackingId) as
    | {
        lead_id: number;
        email_type: string;
        open_count: number;
        first_opened_at: string | null;
        last_notified_at: string | null;
        sent_at: string;
      }
    | undefined;

  if (!row) return null;

  const now = new Date().toISOString();
  const nowMs = Date.parse(now);
  const prevCount = row.open_count;
  const newCount = prevCount + 1;
  const firstOpened = row.first_opened_at || now;
  const ua = (userAgent || 'unknown').substring(0, 500);

  // Suppress self-opens: ignore opens within 10 minutes of send time.
  // These are almost always Gmail image prefetch, sender reviewing Sent
  // folder, or BCC/CC self-opens. Both sender and recipient go through
  // Gmail's image proxy (GoogleImageProxy UA) so we can't distinguish
  // by UA or IP — timing is the only reliable signal.
  const SELF_OPEN_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
  const sentMs = Date.parse(row.sent_at);
  if (nowMs - sentMs < SELF_OPEN_WINDOW_MS) {
    logger.debug(
      {
        trackingId,
        leadId: row.lead_id,
        secSinceSend: Math.round((nowMs - sentMs) / 1000),
      },
      'Email open suppressed: within self-open window',
    );
    // Still record the open in DB (for accurate count) but never notify
    db.prepare(
      `UPDATE email_tracking
       SET first_opened_at = ?, last_opened_at = ?, open_count = ?,
           last_user_agent = ?
       WHERE tracking_id = ?`,
    ).run(firstOpened, now, newCount, ua, trackingId);

    return {
      leadId: row.lead_id,
      emailType: row.email_type,
      openCount: newCount,
      firstOpenedAt: firstOpened,
      shouldNotify: false,
    };
  }

  // Throttle: decide whether to notify agents
  let shouldNotify = false;
  if (!row.last_notified_at) {
    // First real open (after self-open window) — always notify.
    // Suppressed opens increment open_count but never set last_notified_at,
    // so this fires on the first open that passes the window check above.
    shouldNotify = true;
  } else if (row.last_notified_at) {
    const sinceLastNotify =
      (Date.parse(now) - Date.parse(row.last_notified_at)) / 1000;
    if (sinceLastNotify > 86400) {
      // >24h since last notification
      shouldNotify = true;
    }
  }
  if (newCount === 3) {
    // Multi-read signal
    shouldNotify = true;
  }

  db.prepare(
    `UPDATE email_tracking
     SET first_opened_at = ?, last_opened_at = ?, open_count = ?,
         last_user_agent = ?${shouldNotify ? ', last_notified_at = ?' : ''}
     WHERE tracking_id = ?`,
  ).run(
    firstOpened,
    now,
    newCount,
    ua,
    ...(shouldNotify ? [now] : []),
    trackingId,
  );

  return {
    leadId: row.lead_id,
    emailType: row.email_type,
    openCount: newCount,
    firstOpenedAt: firstOpened,
    shouldNotify,
  };
}

// ---------------------------------------------------------------------------
// Autonomy ladder (per-category trust + L2 hold-and-send). Logic lives in
// autonomy-ledger.ts / autonomy-hold.ts; only the SQL lives here.
// ---------------------------------------------------------------------------

export interface AutonomyTrustRow {
  group_folder: string;
  category: string;
  level: number;
  streak: number;
  drafts: number;
  approved_clean: number;
  corrected: number;
  vetoed: number;
  auto_approved: number;
  updated_at: string | null;
}

export interface AutonomyDraftEventRow {
  draft_id: string;
  chat_jid: string;
  group_folder: string;
  category: string;
  outcome: string;
  draft_ts: string;
  thread_ts: string | null;
  resolved_ts: string | null;
}

export interface AutonomyPendingRow {
  draft_id: string;
  chat_jid: string;
  group_folder: string;
  category: string;
  thread_ts: string | null;
  draft_ts: string;
  notice_ts: string | null;
  expires_at: string;
  status: string;
  created_at: string;
}

export function getAutonomyTrust(
  groupFolder: string,
  category: string,
): AutonomyTrustRow | undefined {
  return db
    .prepare(
      'SELECT * FROM autonomy_trust WHERE group_folder = ? AND category = ?',
    )
    .get(groupFolder, category) as AutonomyTrustRow | undefined;
}

export function listAutonomyTrust(): AutonomyTrustRow[] {
  return db
    .prepare('SELECT * FROM autonomy_trust ORDER BY group_folder, category')
    .all() as AutonomyTrustRow[];
}

export function upsertAutonomyTrust(row: AutonomyTrustRow): void {
  db.prepare(
    `INSERT OR REPLACE INTO autonomy_trust
     (group_folder, category, level, streak, drafts, approved_clean,
      corrected, vetoed, auto_approved, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.group_folder,
    row.category,
    row.level,
    row.streak,
    row.drafts,
    row.approved_clean,
    row.corrected,
    row.vetoed,
    row.auto_approved,
    row.updated_at,
  );
}

export function insertAutonomyDraftEvent(ev: AutonomyDraftEventRow): void {
  db.prepare(
    `INSERT OR IGNORE INTO autonomy_draft_events
     (draft_id, chat_jid, group_folder, category, outcome, draft_ts, thread_ts, resolved_ts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    ev.draft_id,
    ev.chat_jid,
    ev.group_folder,
    ev.category,
    ev.outcome,
    ev.draft_ts,
    ev.thread_ts,
    ev.resolved_ts,
  );
}

export function hasAutonomyDraftEvent(draftId: string): boolean {
  return (
    db
      .prepare('SELECT 1 FROM autonomy_draft_events WHERE draft_id = ?')
      .get(draftId) !== undefined
  );
}

export function getPendingAutonomyDraftEvents(
  groupFolder: string,
): AutonomyDraftEventRow[] {
  return db
    .prepare(
      `SELECT * FROM autonomy_draft_events
       WHERE outcome = 'pending' AND group_folder = ?
       ORDER BY draft_ts`,
    )
    .all(groupFolder) as AutonomyDraftEventRow[];
}

export function resolveAutonomyDraftEvent(
  draftId: string,
  outcome: string,
  resolvedTs: string,
): void {
  db.prepare(
    `UPDATE autonomy_draft_events
     SET outcome = ?, resolved_ts = ?
     WHERE draft_id = ? AND outcome = 'pending'`,
  ).run(outcome, resolvedTs, draftId);
}

export function createAutonomyPending(row: AutonomyPendingRow): void {
  db.prepare(
    `INSERT OR IGNORE INTO autonomy_pending
     (draft_id, chat_jid, group_folder, category, thread_ts, draft_ts,
      notice_ts, expires_at, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.draft_id,
    row.chat_jid,
    row.group_folder,
    row.category,
    row.thread_ts,
    row.draft_ts,
    row.notice_ts,
    row.expires_at,
    row.status,
    row.created_at,
  );
}

export function setAutonomyPendingStatus(
  draftId: string,
  status: string,
): void {
  db.prepare(
    `UPDATE autonomy_pending SET status = ? WHERE draft_id = ? AND status = 'pending'`,
  ).run(status, draftId);
}

export function setAutonomyPendingNotice(
  draftId: string,
  noticeTs: string,
): void {
  db.prepare(
    'UPDATE autonomy_pending SET notice_ts = ? WHERE draft_id = ?',
  ).run(noticeTs, draftId);
}

export function getOpenAutonomyPendings(): AutonomyPendingRow[] {
  return db
    .prepare(
      `SELECT * FROM autonomy_pending WHERE status = 'pending' ORDER BY expires_at`,
    )
    .all() as AutonomyPendingRow[];
}

export function findAutonomyPendingByTs(
  ts: string,
): AutonomyPendingRow | undefined {
  return db
    .prepare(
      `SELECT * FROM autonomy_pending
       WHERE status = 'pending' AND (draft_id = ? OR notice_ts = ?)`,
    )
    .get(ts, ts) as AutonomyPendingRow | undefined;
}

/**
 * Thread-scoped scan used by the autonomy ledger to resolve a draft's
 * outcome. threadTs null = root-level messages of the chat (drafts posted
 * outside an entity thread). Includes bot flags — unlike getMessagesSince.
 */
export function getAutonomyThreadMessagesAfter(
  chatJid: string,
  threadTs: string | null,
  afterTs: string,
): NewMessage[] {
  const threadCond =
    threadTs === null ? 'thread_ts IS NULL' : '(thread_ts = ? OR id = ?)';
  const params: unknown[] =
    threadTs === null
      ? [chatJid, afterTs]
      : [chatJid, afterTs, threadTs, threadTs];
  return db
    .prepare(
      `SELECT id, chat_jid, sender, sender_name, content, timestamp,
              is_from_me, is_bot_message, from_group, thread_ts
       FROM messages
       WHERE chat_jid = ? AND timestamp > ? AND ${threadCond}
       ORDER BY timestamp`,
    )
    .all(...params) as NewMessage[];
}

/**
 * Bot draft posts in a channel since a watermark — the ledger's new-draft
 * discovery query. Marker filtering happens in the ledger (policy, not SQL).
 */
export function getBotMessagesSince(
  chatJid: string,
  sinceTimestamp: string,
): NewMessage[] {
  return db
    .prepare(
      `SELECT id, chat_jid, sender, sender_name, content, timestamp,
              is_from_me, is_bot_message, from_group, thread_ts
       FROM messages
       WHERE chat_jid = ? AND timestamp > ? AND is_from_me = 1
       ORDER BY timestamp`,
    )
    .all(chatJid, sinceTimestamp) as NewMessage[];
}
