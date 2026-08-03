/**
 * Stdio MCP Server for NanoClaw
 * Standalone process that agent teams subagents can inherit.
 * Reads context from environment variables, writes IPC files for the host.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { CronExpressionParser } from 'cron-parser';

const IPC_DIR = '/workspace/ipc';
const MESSAGES_DIR = path.join(IPC_DIR, 'messages');
const TASKS_DIR = path.join(IPC_DIR, 'tasks');
const ATTACHMENTS_DIR = path.join(IPC_DIR, 'attachments');
const MAX_GRADER_FILE_BYTES = 25 * 1024 * 1024;

// Context from environment variables (set by the agent runner)
const chatJid = process.env.NANOCLAW_CHAT_JID!;
const groupFolder = process.env.NANOCLAW_GROUP_FOLDER!;
const containerName = process.env.CONTAINER_NAME!;
const isMain = process.env.NANOCLAW_IS_MAIN === '1';

function writeIpcFile(dir: string, data: object): string {
  fs.mkdirSync(dir, { recursive: true });

  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
  const filepath = path.join(dir, filename);

  // Atomic write: temp file then rename
  const tempPath = `${filepath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
  fs.renameSync(tempPath, filepath);

  return filename;
}

const server = new McpServer({
  name: 'nanoclaw',
  version: '1.0.0',
});

server.tool(
  'send_message',
  "Send a message to the user or group immediately while you're still running. Use this for progress updates or to send multiple messages. You can call this multiple times. Note: when running as a scheduled task, your final output is NOT sent to the user — use this tool if you need to communicate with the user or group.",
  {
    text: z.string().describe('The message text to send'),
    sender: z
      .string()
      .optional()
      .describe(
        'Your role/identity name (e.g. "Researcher"). When set, messages appear from a dedicated bot in Telegram.',
      ),
    target_group: z
      .string()
      .optional()
      .describe(
        'Send to a different group by folder name (e.g. "sales", "chief"). Defaults to your own group. The target must be a registered group.',
      ),
    thread_ts: z
      .string()
      .regex(/^\d+\.\d+$/)
      .optional()
      .describe(
        'Slack thread timestamp to reply in a specific thread. Get this from the thread_ts attribute on incoming <message> XML tags.',
      ),
    thread_key: z
      .string()
      .optional()
      .describe(
        'Work-unit anchor (e.g. "sales:entry:42", "booking:appt:12345"). Every message you send with the SAME thread_key collapses into ONE Slack thread, so all updates about one lead/cert/booking stay together instead of scattering across the channel. Use a stable per-entity key (see your CLAUDE.md for the convention); omit for one-off chatter. Ignored if thread_ts is set.',
      ),
  },
  async (args) => {
    const data: Record<string, string | undefined> = {
      type: 'message',
      chatJid,
      text: args.text,
      sender: args.sender || undefined,
      groupFolder,
      source_container: containerName || undefined,
      targetGroupFolder: args.target_group || undefined,
      thread_ts: args.thread_ts || undefined,
      thread_key: args.thread_key || undefined,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(MESSAGES_DIR, data);

    return {
      content: [
        {
          type: 'text' as const,
          text: args.target_group
            ? `Message sent to ${args.target_group}.`
            : 'Message sent.',
        },
      ],
    };
  },
);

server.tool(
  'send_grader_file',
  'Stage one local assignment file and ask the host to post it as a new #gru-grader root with the file attached in its thread. This capability is fixed to the grader and available only to the main/chief control group.',
  {
    text: z
      .string()
      .min(1)
      .max(4000)
      .describe('Clean root text naming the student and exact assignment'),
    file_path: z
      .string()
      .min(1)
      .describe('Absolute path to a regular file under /workspace/group'),
    idempotency_key: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/)
      .describe('Stable unique key for this student submission'),
  },
  async (args) => {
    if (!isMain && groupFolder !== 'chief') {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'Denied: only the main or chief group can send grader files.',
          },
        ],
        isError: true,
      };
    }

    try {
      const groupRoot = fs.realpathSync('/workspace/group');
      const sourceLstat = fs.lstatSync(args.file_path);
      if (sourceLstat.isSymbolicLink() || !sourceLstat.isFile()) {
        throw new Error('file_path must be a regular non-symlink file');
      }
      if (sourceLstat.size <= 0 || sourceLstat.size > MAX_GRADER_FILE_BYTES) {
        throw new Error('file must be between 1 byte and 25 MB');
      }
      const sourcePath = fs.realpathSync(args.file_path);
      if (!sourcePath.startsWith(`${groupRoot}${path.sep}`)) {
        throw new Error('file_path must resolve under /workspace/group');
      }

      const filename = path.basename(sourcePath);
      const content = fs.readFileSync(sourcePath);
      const sha256 = crypto.createHash('sha256').update(content).digest('hex');
      const keyHash = crypto
        .createHash('sha256')
        .update(args.idempotency_key)
        .digest('hex');
      const destinationDir = path.join(ATTACHMENTS_DIR, keyHash);
      const destinationPath = path.join(destinationDir, filename);
      fs.mkdirSync(destinationDir, { recursive: true });

      if (fs.existsSync(destinationPath)) {
        const existing = fs.readFileSync(destinationPath);
        const existingHash = crypto
          .createHash('sha256')
          .update(existing)
          .digest('hex');
        if (existingHash !== sha256) {
          throw new Error(
            'idempotency key already stages a different file; use a new key',
          );
        }
      } else {
        const tempPath = `${destinationPath}.${process.pid}.tmp`;
        fs.writeFileSync(tempPath, content, { mode: 0o600, flag: 'wx' });
        fs.renameSync(tempPath, destinationPath);
      }

      const ipcFilename = writeIpcFile(MESSAGES_DIR, {
        type: 'slack_file_message',
        chatJid,
        groupFolder,
        targetGroupFolder: 'grader',
        text: args.text,
        staged_path: path.relative(IPC_DIR, destinationPath),
        filename,
        size: content.length,
        sha256,
        idempotency_key: args.idempotency_key,
        timestamp: new Date().toISOString(),
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: `Grader file queued (${ipcFilename}); idempotency key ${args.idempotency_key}.`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Grader file was not queued: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  'schedule_task',
  `Schedule a recurring or one-time task. The task will run as a full agent with access to all tools.

CONTEXT MODE - Choose based on task type:
\u2022 "group": Task runs in the group's conversation context, with access to chat history. Use for tasks that need context about ongoing discussions, user preferences, or recent interactions.
\u2022 "isolated": Task runs in a fresh session with no conversation history. Use for independent tasks that don't need prior context. When using isolated mode, include all necessary context in the prompt itself.

If unsure which mode to use, you can ask the user. Examples:
- "Remind me about our discussion" \u2192 group (needs conversation context)
- "Check the weather every morning" \u2192 isolated (self-contained task)
- "Follow up on my request" \u2192 group (needs to know what was requested)
- "Generate a daily report" \u2192 isolated (just needs instructions in prompt)

MESSAGING BEHAVIOR - The task agent's output is sent to the user or group. It can also use send_message for immediate delivery, or wrap output in <internal> tags to suppress it. Include guidance in the prompt about whether the agent should:
\u2022 Always send a message (e.g., reminders, daily briefings)
\u2022 Only send a message when there's something to report (e.g., "notify me if...")
\u2022 Never send a message (background maintenance tasks)

SCHEDULE VALUE FORMAT (all times are LOCAL timezone):
\u2022 cron: Standard cron expression (e.g., "*/5 * * * *" for every 5 minutes, "0 9 * * *" for daily at 9am LOCAL time)
\u2022 interval: Milliseconds between runs (e.g., "300000" for 5 minutes, "3600000" for 1 hour)
\u2022 once: Local time WITHOUT "Z" suffix (e.g., "2026-02-01T15:30:00"). Do NOT use UTC/Z suffix.`,
  {
    prompt: z
      .string()
      .describe(
        'What the agent should do when the task runs. For isolated mode, include all necessary context here.',
      ),
    schedule_type: z
      .enum(['cron', 'interval', 'once'])
      .describe(
        'cron=recurring at specific times, interval=recurring every N ms, once=run once at specific time',
      ),
    schedule_value: z
      .string()
      .describe(
        'cron: "*/5 * * * *" | interval: milliseconds like "300000" | once: local timestamp like "2026-02-01T15:30:00" (no Z suffix!)',
      ),
    context_mode: z
      .enum(['group', 'isolated'])
      .default('group')
      .describe(
        'group=runs with chat history and memory, isolated=fresh session (include context in prompt)',
      ),
    target_group_jid: z
      .string()
      .optional()
      .describe(
        '(Main group only) JID of the group to schedule the task for. Defaults to the current group.',
      ),
  },
  async (args) => {
    // Validate schedule_value before writing IPC
    if (args.schedule_type === 'cron') {
      try {
        CronExpressionParser.parse(args.schedule_value);
      } catch {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Invalid cron: "${args.schedule_value}". Use format like "0 9 * * *" (daily 9am) or "*/5 * * * *" (every 5 min).`,
            },
          ],
          isError: true,
        };
      }
    } else if (args.schedule_type === 'interval') {
      const ms = parseInt(args.schedule_value, 10);
      if (isNaN(ms) || ms <= 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Invalid interval: "${args.schedule_value}". Must be positive milliseconds (e.g., "300000" for 5 min).`,
            },
          ],
          isError: true,
        };
      }
    } else if (args.schedule_type === 'once') {
      if (
        /[Zz]$/.test(args.schedule_value) ||
        /[+-]\d{2}:\d{2}$/.test(args.schedule_value)
      ) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Timestamp must be local time without timezone suffix. Got "${args.schedule_value}" — use format like "2026-02-01T15:30:00".`,
            },
          ],
          isError: true,
        };
      }
      const date = new Date(args.schedule_value);
      if (isNaN(date.getTime())) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Invalid timestamp: "${args.schedule_value}". Use local time format like "2026-02-01T15:30:00".`,
            },
          ],
          isError: true,
        };
      }
    }

    // Non-main groups can only schedule for themselves
    const targetJid =
      isMain && args.target_group_jid ? args.target_group_jid : chatJid;

    const data = {
      type: 'schedule_task',
      prompt: args.prompt,
      schedule_type: args.schedule_type,
      schedule_value: args.schedule_value,
      context_mode: args.context_mode || 'group',
      targetJid,
      createdBy: groupFolder,
      timestamp: new Date().toISOString(),
    };

    const filename = writeIpcFile(TASKS_DIR, data);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Task scheduled (${filename}): ${args.schedule_type} - ${args.schedule_value}`,
        },
      ],
    };
  },
);

server.tool(
  'list_tasks',
  "List all scheduled tasks. From main: shows all tasks. From other groups: shows only that group's tasks.",
  {},
  async () => {
    const tasksFile = path.join(IPC_DIR, 'current_tasks.json');

    try {
      if (!fs.existsSync(tasksFile)) {
        return {
          content: [
            { type: 'text' as const, text: 'No scheduled tasks found.' },
          ],
        };
      }

      const allTasks = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'));

      const tasks = isMain
        ? allTasks
        : allTasks.filter(
            (t: { groupFolder: string }) => t.groupFolder === groupFolder,
          );

      if (tasks.length === 0) {
        return {
          content: [
            { type: 'text' as const, text: 'No scheduled tasks found.' },
          ],
        };
      }

      const formatted = tasks
        .map(
          (t: {
            id: string;
            prompt: string;
            schedule_type: string;
            schedule_value: string;
            status: string;
            next_run: string;
          }) =>
            `- [${t.id}] ${t.prompt.slice(0, 50)}... (${t.schedule_type}: ${t.schedule_value}) - ${t.status}, next: ${t.next_run || 'N/A'}`,
        )
        .join('\n');

      return {
        content: [
          { type: 'text' as const, text: `Scheduled tasks:\n${formatted}` },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error reading tasks: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
      };
    }
  },
);

server.tool(
  'pause_task',
  'Pause a scheduled task. It will not run until resumed.',
  { task_id: z.string().describe('The task ID to pause') },
  async (args) => {
    const data = {
      type: 'pause_task',
      taskId: args.task_id,
      groupFolder,
      isMain,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(TASKS_DIR, data);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Task ${args.task_id} pause requested.`,
        },
      ],
    };
  },
);

server.tool(
  'resume_task',
  'Resume a paused task.',
  { task_id: z.string().describe('The task ID to resume') },
  async (args) => {
    const data = {
      type: 'resume_task',
      taskId: args.task_id,
      groupFolder,
      isMain,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(TASKS_DIR, data);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Task ${args.task_id} resume requested.`,
        },
      ],
    };
  },
);

server.tool(
  'cancel_task',
  'Cancel and delete a scheduled task.',
  { task_id: z.string().describe('The task ID to cancel') },
  async (args) => {
    const data = {
      type: 'cancel_task',
      taskId: args.task_id,
      groupFolder,
      isMain,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(TASKS_DIR, data);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Task ${args.task_id} cancellation requested.`,
        },
      ],
    };
  },
);

server.tool(
  'register_group',
  `Register a new chat/group so the agent can respond to messages there. Main group only.

Use available_groups.json to find the JID for a group. The folder name must be channel-prefixed: "{channel}_{group-name}" (e.g., "whatsapp_family-chat", "telegram_dev-team", "discord_general"). Use lowercase with hyphens for the group name part.`,
  {
    jid: z
      .string()
      .describe(
        'The chat JID (e.g., "120363336345536173@g.us", "tg:-1001234567890", "dc:1234567890123456")',
      ),
    name: z.string().describe('Display name for the group'),
    folder: z
      .string()
      .describe(
        'Channel-prefixed folder name (e.g., "whatsapp_family-chat", "telegram_dev-team")',
      ),
    trigger: z.string().describe('Trigger word (e.g., "@Andy")'),
  },
  async (args) => {
    if (!isMain) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'Only the main group can register new groups.',
          },
        ],
        isError: true,
      };
    }

    const data = {
      type: 'register_group',
      jid: args.jid,
      name: args.name,
      folder: args.folder,
      trigger: args.trigger,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(TASKS_DIR, data);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Group "${args.name}" registered. It will start receiving messages immediately.`,
        },
      ],
    };
  },
);

// --- Gmail tools ---

server.tool(
  'gmail_reply',
  'Reply to an email thread. The reply goes to the original sender with proper In-Reply-To/References headers and Gmail thread grouping.',
  {
    thread_id: z.string().describe('Gmail thread ID to reply to'),
    body: z.string().describe('Reply body (plain text or HTML)'),
    html: z
      .boolean()
      .optional()
      .describe('Set to true when body contains HTML'),
    cc: z.string().optional().describe('CC recipients (comma-separated)'),
    lead_id: z.number().optional().describe('Lead ID for open tracking'),
    action_id: z
      .string()
      .uuid()
      .optional()
      .describe('Host-issued approved email action ID from the handoff'),
    email_type: z
      .string()
      .optional()
      .describe('Email type: initial, follow-up, or reply'),
  },
  async (args) => {
    writeIpcFile(MESSAGES_DIR, {
      type: 'gmail_reply',
      threadId: args.thread_id,
      body: args.body,
      html: args.html || undefined,
      cc: args.cc || undefined,
      leadId: args.lead_id,
      actionId: args.action_id,
      emailType: args.email_type,
      groupFolder,
      source_container: containerName || undefined,
      timestamp: new Date().toISOString(),
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: `Reply queued for thread ${args.thread_id}. This is not a delivery receipt; wait for the host's Gmail-confirmed result.`,
        },
      ],
    };
  },
);

server.tool(
  'gmail_send',
  'Send a new email. Optionally thread into an existing Gmail conversation while using a custom subject line.',
  {
    to: z.string().describe('Recipient email address'),
    subject: z.string().describe('Email subject line'),
    body: z.string().describe('Email body (plain text or HTML)'),
    cc: z.string().optional().describe('CC recipients (comma-separated)'),
    html: z
      .boolean()
      .optional()
      .describe('Set to true when body contains HTML'),
    thread_id: z
      .string()
      .optional()
      .describe(
        'Gmail thread ID to send within an existing thread (keeps your custom subject while threading the email in the same conversation)',
      ),
    lead_id: z.number().optional().describe('Lead ID for open tracking'),
    action_id: z
      .string()
      .uuid()
      .optional()
      .describe('Host-issued approved email action ID from the handoff'),
    email_type: z
      .string()
      .optional()
      .describe('Email type: initial, follow-up, or reply'),
  },
  async (args) => {
    writeIpcFile(MESSAGES_DIR, {
      type: 'gmail_send',
      to: args.to,
      subject: args.subject,
      body: args.body,
      cc: args.cc || undefined,
      html: args.html || undefined,
      threadId: args.thread_id || undefined,
      leadId: args.lead_id,
      actionId: args.action_id,
      emailType: args.email_type,
      groupFolder,
      source_container: containerName || undefined,
      timestamp: new Date().toISOString(),
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: `Email queued to ${args.to}. This is not a delivery receipt; wait for the host's Gmail-confirmed result.`,
        },
      ],
    };
  },
);

server.tool(
  'gmail_search',
  'Search emails using Gmail search syntax. Results are delivered as a follow-up message.',
  {
    query: z
      .string()
      .describe(
        'Gmail search query (e.g., "from:john subject:invoice", "newer_than:7d")',
      ),
    max_results: z
      .number()
      .min(1)
      .max(50)
      .default(10)
      .describe('Maximum results to return'),
  },
  async (args) => {
    writeIpcFile(MESSAGES_DIR, {
      type: 'gmail_search',
      query: args.query,
      maxResults: args.max_results,
      groupFolder,
      source_container: containerName || undefined,
      timestamp: new Date().toISOString(),
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: `Search queued: "${args.query}". Results will arrive as a follow-up message.`,
        },
      ],
    };
  },
);

server.tool(
  'gmail_read',
  'Read a specific email by message ID. Content is delivered as a follow-up message.',
  {
    message_id: z.string().describe('Gmail message ID to read'),
  },
  async (args) => {
    writeIpcFile(MESSAGES_DIR, {
      type: 'gmail_read',
      messageId: args.message_id,
      groupFolder,
      source_container: containerName || undefined,
      timestamp: new Date().toISOString(),
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: `Read queued for message ${args.message_id}. Content will arrive as a follow-up message.`,
        },
      ],
    };
  },
);

server.tool(
  'gmail_get_thread',
  'Fetch an entire Gmail thread (all messages, full bodies) by thread ID. Use this to load a conversation — do NOT pass thread:<id> to gmail_search, which is not a real Gmail operator. Result is delivered as a follow-up message.',
  {
    thread_id: z.string().describe('Gmail thread ID (e.g., 19e0daefe7cea171)'),
  },
  async (args) => {
    writeIpcFile(MESSAGES_DIR, {
      type: 'gmail_get_thread',
      threadId: args.thread_id,
      groupFolder,
      source_container: containerName || undefined,
      timestamp: new Date().toISOString(),
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: `Thread fetch queued for ${args.thread_id}. Messages will arrive as a follow-up message.`,
        },
      ],
    };
  },
);

server.tool(
  'procurement_queue',
  'List host-normalized CaleProcure and emailed opportunities awaiting Procurement review. This is read-only and never returns raw portal snapshots or email bodies.',
  {
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(20)
      .describe('Maximum opportunities to return'),
  },
  async (args) => {
    if (groupFolder !== 'procurement') {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'procurement_queue is restricted to the procurement group.',
          },
        ],
        isError: true,
      };
    }
    writeIpcFile(MESSAGES_DIR, {
      type: 'procurement_queue',
      limit: args.limit,
      groupFolder,
      timestamp: new Date().toISOString(),
    });
    return {
      content: [
        {
          type: 'text' as const,
          text: 'Procurement review queue requested. Results will arrive as a follow-up message.',
        },
      ],
    };
  },
);

const caleProcureResultRow = z
  .object({
    event_id: z.string().trim().min(1).max(128),
    business_unit: z.string().trim().min(1).max(64).optional(),
    title: z.string().trim().min(1).max(500),
    agency: z.string().trim().min(1).max(300),
    close_date: z.string().trim().min(1).max(80).optional(),
    category: z.string().trim().max(120).optional(),
    url: z.string().trim().url().max(2000).optional(),
    search_keyword: z.string().trim().min(1).max(120),
  })
  .strict();

server.tool(
  'procurement_caleprocure_ingest',
  'Submit a bounded public CaleProcure result batch to the host validator. The host owns timestamps, deduplication, source-run completion, and all parameterized database writes. This is separately enabled and never submits a bid.',
  {
    run_key: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/)
      .describe('Stable idempotency key for this exact result batch'),
    rows: z
      .array(caleProcureResultRow)
      .max(200)
      .describe('Public result-table rows; empty is a valid complete scan'),
  },
  async (args) => {
    if (groupFolder !== 'procurement') {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'procurement_caleprocure_ingest is restricted to the procurement group.',
          },
        ],
        isError: true,
      };
    }
    writeIpcFile(MESSAGES_DIR, {
      type: 'procurement_caleprocure_ingest',
      runKey: args.run_key,
      rows: args.rows,
      groupFolder,
      timestamp: new Date().toISOString(),
    });
    return {
      content: [
        {
          type: 'text' as const,
          text: 'CaleProcure batch queued for host validation. A completion or denial message will follow.',
        },
      ],
    };
  },
);

server.tool(
  'procurement_review_card',
  'Ask the host to create or reuse a version-bound Slack review card from current database truth. The recommendation is advisory; only a named human decision command in the card thread can change state.',
  {
    opportunity_id: z.number().int().positive(),
    expected_version: z.number().int().nonnegative(),
    recommendation: z.enum(['needs_info', 'process', 'drop']),
    reason: z.string().trim().min(1).max(1000),
  },
  async (args) => {
    if (groupFolder !== 'procurement') {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'procurement_review_card is restricted to the procurement group.',
          },
        ],
        isError: true,
      };
    }
    writeIpcFile(MESSAGES_DIR, {
      type: 'procurement_review_card',
      opportunityId: args.opportunity_id,
      expectedVersion: args.expected_version,
      recommendation: args.recommendation,
      reason: args.reason,
      groupFolder,
      timestamp: new Date().toISOString(),
    });
    return {
      content: [
        {
          type: 'text' as const,
          text: 'Host Procurement review card requested. The host will verify current state before posting.',
        },
      ],
    };
  },
);

const JOBS_DIR = path.join(IPC_DIR, 'jobs');

server.tool(
  'jobs',
  'Manage host-level scheduled jobs. Use list to see all jobs, status to inspect a specific job, run to trigger it immediately, pause to disable it, or resume to re-enable it.',
  {
    action: z
      .enum(['list', 'run', 'status', 'pause', 'resume'])
      .describe('Action to perform'),
    name: z
      .string()
      .optional()
      .describe('Job name (required for run, status, pause, resume)'),
  },
  async (args) => {
    const jobsFile = path.join(IPC_DIR, 'current_jobs.json');

    if (args.action === 'list') {
      try {
        if (!fs.existsSync(jobsFile)) {
          return {
            content: [{ type: 'text' as const, text: 'No jobs found.' }],
          };
        }
        const snapshot = JSON.parse(fs.readFileSync(jobsFile, 'utf-8'));
        return {
          content: [
            {
              type: 'text' as const,
              text: snapshot.job_list_text || 'No jobs registered.',
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error reading jobs: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    }

    if (!args.name) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Action "${args.action}" requires a job name.`,
          },
        ],
        isError: true,
      };
    }

    if (args.action === 'status') {
      try {
        if (!fs.existsSync(jobsFile)) {
          return {
            content: [{ type: 'text' as const, text: 'No jobs found.' }],
          };
        }
        const snapshot = JSON.parse(fs.readFileSync(jobsFile, 'utf-8'));
        const text = snapshot.job_status?.[args.name] ?? 'Job not found.';
        return { content: [{ type: 'text' as const, text: text }] };
      } catch (err) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error reading jobs: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    }

    // run, pause, resume — write IPC files
    const filename = writeIpcFile(JOBS_DIR, {
      action: args.action,
      name: args.name,
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: `Job "${args.name}" ${args.action} requested (${filename}).`,
        },
      ],
    };
  },
);

// Start the stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
