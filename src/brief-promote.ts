// Promote a decision-brief item into Things 3 (on the Studio) when it gets a
// 📌 reaction in Slack. The brief is posted as one message per item by the
// Studio's brief.py; this parses that message text and forwards the item to the
// Things bridge. Host-side only — no container, no agent.
import { THINGS_BRIDGE_KEY, THINGS_BRIDGE_URL } from './config.js';
import { logger } from './logger.js';

export interface BriefItem {
  title: string;
  domain?: string;
  due?: string;
}

const DOMAIN_RE = /\b(dev|solera|personal|coaching)\b/i;
const ISO_RE = /\b(\d{4}-\d{2}-\d{2})\b/;

/**
 * Parse a posted brief-item message into a promotable item. Returns null unless
 * the text has BOTH a *bold title* and a known domain word — so a 📌 on an
 * ordinary Mr Gru message (not a brief item) is safely ignored.
 */
export function parseBriefItem(text: string): BriefItem | null {
  if (!text) return null;
  const titleM = text.match(/\*([^*]+)\*/);
  const domainM = text.match(DOMAIN_RE);
  if (!titleM || !domainM) return null;
  const dueM = text.match(ISO_RE);
  const title = titleM[1].trim().slice(0, 280);
  if (!title) return null;
  return {
    title,
    domain: domainM[1].toLowerCase(),
    due: dueM ? dueM[1] : undefined,
  };
}

/** Parse + POST to the Things bridge. Returns true only on a confirmed add. */
export async function promoteBriefItem(text: string): Promise<boolean> {
  const item = parseBriefItem(text);
  if (!item) return false;
  if (!THINGS_BRIDGE_KEY) {
    logger.warn('promoteBriefItem: THINGS_BRIDGE_KEY unset — cannot promote');
    return false;
  }
  try {
    const res = await fetch(`${THINGS_BRIDGE_URL}/add-todo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bridge-Key': THINGS_BRIDGE_KEY,
      },
      body: JSON.stringify({
        title: item.title,
        due: item.due,
        domain: item.domain,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, 'things-bridge returned non-ok');
      return false;
    }
    logger.info(
      { title: item.title, domain: item.domain },
      'Promoted brief item to Things',
    );
    return true;
  } catch (err) {
    logger.warn({ err }, 'things-bridge call failed');
    return false;
  }
}
