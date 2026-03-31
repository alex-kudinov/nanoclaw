#!/usr/bin/env node
/**
 * PreCompact hook: archives the transcript to /workspace/group/conversations/
 * before context compaction discards it.
 * Reads hook input from stdin (JSON with transcript_path, session_id).
 */
const fs = require('fs');
const path = require('path');

const ASSISTANT_NAME = process.env.NANOCLAW_ASSISTANT_NAME || 'Assistant';

function sanitizeFilename(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
}

function generateFallbackName() {
  const t = new Date();
  return `conversation-${String(t.getHours()).padStart(2, '0')}${String(t.getMinutes()).padStart(2, '0')}`;
}

function getSessionSummary(sessionId, transcriptPath) {
  const indexPath = path.join(path.dirname(transcriptPath), 'sessions-index.json');
  if (!fs.existsSync(indexPath)) return null;
  try {
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    const entry = (index.entries || []).find(e => e.sessionId === sessionId);
    return entry?.summary || null;
  } catch { return null; }
}

function parseTranscript(content) {
  const messages = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.type === 'user' && entry.message?.content) {
        const text = typeof entry.message.content === 'string'
          ? entry.message.content
          : entry.message.content.map(c => c.text || '').join('');
        if (text) messages.push({ role: 'user', content: text });
      } else if (entry.type === 'assistant' && entry.message?.content) {
        const text = entry.message.content
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join('');
        if (text) messages.push({ role: 'assistant', content: text });
      }
    } catch {}
  }
  return messages;
}

function formatMarkdown(messages, title) {
  const now = new Date();
  const fmt = d => d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  const lines = [`# ${title || 'Conversation'}`, '', `Archived: ${fmt(now)}`, '', '---', ''];
  for (const msg of messages) {
    const sender = msg.role === 'user' ? 'User' : ASSISTANT_NAME;
    const content = msg.content.length > 2000 ? msg.content.slice(0, 2000) + '...' : msg.content;
    lines.push(`**${sender}**: ${content}`, '');
  }
  return lines.join('\n');
}

let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { data += chunk; });
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(data);
    const transcriptPath = input.transcript_path;
    const sessionId = input.session_id;

    if (!transcriptPath || !fs.existsSync(transcriptPath)) {
      console.log(JSON.stringify({}));
      return;
    }

    const content = fs.readFileSync(transcriptPath, 'utf-8');
    const messages = parseTranscript(content);
    if (messages.length === 0) {
      console.log(JSON.stringify({}));
      return;
    }

    const summary = getSessionSummary(sessionId, transcriptPath);
    const name = summary ? sanitizeFilename(summary) : generateFallbackName();
    const dir = '/workspace/group/conversations';
    fs.mkdirSync(dir, { recursive: true });
    const date = new Date().toISOString().split('T')[0];
    const filePath = path.join(dir, `${date}-${name}.md`);
    fs.writeFileSync(filePath, formatMarkdown(messages, summary));
    process.stderr.write(`[hook] Archived conversation to ${filePath}\n`);
  } catch (err) {
    process.stderr.write(`[hook] Archive failed: ${err.message}\n`);
  }
  console.log(JSON.stringify({}));
});
