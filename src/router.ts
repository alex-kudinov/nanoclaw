import { Channel, NewMessage } from './types.js';

export function escapeXml(s: string): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatMessages(messages: NewMessage[]): string {
  const lines = messages.map((m) => {
    const threadAttr = m.thread_ts
      ? ` thread_ts="${escapeXml(m.thread_ts)}"`
      : '';
    return `<message sender="${escapeXml(m.sender_name)}" time="${m.timestamp}"${threadAttr}>${escapeXml(m.content)}</message>`;
  });
  return `<messages>\n${lines.join('\n')}\n</messages>`;
}

// Drop messages tagged with this group's own folder — host-posted echoes
// (handoff confirmations, [PROCESSING] lines) carry from_group=<own folder>
// and must never re-enter the group as inbound context or a live-container pipe.
export function excludeOwnGroupMessages(
  messages: NewMessage[],
  folder: string,
): NewMessage[] {
  return messages.filter((m) => !m.from_group || m.from_group !== folder);
}

// A message is "untagged bot noise" only if the assistant sent it AND it
// carries no from_group. Such rows are self-echoes whose from_group was lost
// on restart — spawning a container for them is a no-op.
// A bot message that DOES carry a from_group is a deliberate cross-group
// handoff ([HANDOFF: inbox→sales] etc.) and must spawn the target agent.
// Callers pass batches already stripped of this group's own from_group, so
// any surviving from_group belongs to another group.
export function isUntaggedBotNoise(
  message: NewMessage,
  assistantName: string,
): boolean {
  return message.sender_name === assistantName && !message.from_group;
}

export function stripInternalTags(text: string): string {
  return text.replace(/<internal>[\s\S]*?<\/internal>/g, '').trim();
}

export function formatOutbound(rawText: string): string {
  const text = stripInternalTags(rawText);
  if (!text) return '';
  return text;
}

export function routeOutbound(
  channels: Channel[],
  jid: string,
  text: string,
): Promise<void> {
  const channel = channels.find((c) => c.ownsJid(jid) && c.isConnected());
  if (!channel) throw new Error(`No channel for JID: ${jid}`);
  return channel.sendMessage(jid, text);
}

export function findChannel(
  channels: Channel[],
  jid: string,
): Channel | undefined {
  return channels.find((c) => c.ownsJid(jid));
}
