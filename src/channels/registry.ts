import {
  Channel,
  OnBotJoinedChannel,
  OnInboundMessage,
  OnChatMetadata,
  RegisteredGroup,
} from '../types.js';

export type RegisterGroupFn = (jid: string, group: RegisteredGroup) => void;

export interface ChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  onBotJoinedChannel?: OnBotJoinedChannel;
  registerGroup?: RegisterGroupFn;
  registeredGroups: () => Record<string, RegisteredGroup>;
  /**
   * Gmail-only host hook: inspect an inbound email before it routes (e.g. to
   * detect a proposal reply). Best-effort side effect; never swallows the email.
   */
  onInboundReply?: (input: {
    senderEmail: string;
    threadId?: string;
    body: string;
  }) => Promise<void>;
  /**
   * Slack-only host hook: pipeline entry id → lead email, so a per-lead status
   * line that names its lead only by id ("Lead #611 …") threads with the rest of
   * that lead's traffic instead of landing at the channel root.
   */
  resolveLeadEmail?: (entryId: number) => Promise<string | undefined>;
}

export type ChannelFactory = (opts: ChannelOpts) => Channel | null;

const registry = new Map<string, ChannelFactory>();

export function registerChannel(name: string, factory: ChannelFactory): void {
  registry.set(name, factory);
}

export function getChannelFactory(name: string): ChannelFactory | undefined {
  return registry.get(name);
}

export function getRegisteredChannelNames(): string[] {
  return [...registry.keys()];
}
