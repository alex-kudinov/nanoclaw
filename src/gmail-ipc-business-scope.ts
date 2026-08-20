/**
 * Durable host-side Gmail resource scope.
 *
 * Process-local grants are the fast path. This fallback exists for scheduled
 * Sales work after a daemon restart: it proves that the exact requested thread
 * or address belongs to a party with active pipeline work. It cannot widen the
 * operation matrix and fails closed on database errors.
 */

import { query } from './business-db.js';
import { listEmailActionIdsBySourceMessage } from './db.js';
import {
  extractScopedGmailSearchAddresses,
  type GmailIpcRequest,
} from './gmail-ipc-policy.js';
import { logger } from './logger.js';

type QueryFn = typeof query;
type SourceActionLookup = typeof listEmailActionIdsBySourceMessage;

export async function resolveDurableGmailResource(
  groupFolder: string,
  request: GmailIpcRequest,
  queryFn: QueryFn = query,
  sourceActionLookup: SourceActionLookup = listEmailActionIdsBySourceMessage,
): Promise<boolean> {
  try {
    if (
      groupFolder === 'chief' &&
      request.type === 'gmail_read' &&
      request.messageId?.trim()
    ) {
      const actionIds = sourceActionLookup(request.messageId.trim());
      if (actionIds.length === 0) return false;
      const result = await queryFn<{ allowed: boolean }>(
        `SELECT EXISTS (
           SELECT 1
             FROM business_v2.company_work_items w
            WHERE w.workflow_type = 'sales_email'
              AND w.source_system = 'sqlite_email_action'
              AND w.source_key = ANY($1::text[])
              AND EXISTS (
                SELECT 1
                  FROM business_v2.company_work_exception_cases c
                 WHERE c.work_item_id = w.id
                   AND c.state <> 'resolved'
              )
         ) AS allowed`,
        [actionIds],
      );
      return result.rows[0]?.allowed === true;
    }

    if (groupFolder !== 'sales') return false;

    if (request.type === 'gmail_get_thread' && request.threadId?.trim()) {
      const result = await queryFn<{ allowed: boolean }>(
        `SELECT EXISTS (
           SELECT 1
             FROM business_v2.interactions i
             JOIN business_v2.pipeline_entries pe ON pe.party_id = i.party_id
            WHERE i.channel = 'email'
              AND i.metadata->>'thread_id' = $1
              AND pe.stage NOT IN ('won', 'lost')
         ) AS allowed`,
        [request.threadId.trim()],
      );
      return result.rows[0]?.allowed === true;
    }

    if (request.type === 'gmail_search' && request.query) {
      const addresses = extractScopedGmailSearchAddresses(request.query);
      if (!addresses?.length) return false;
      for (const address of addresses) {
        const result = await queryFn<{ allowed: boolean }>(
          `SELECT EXISTS (
             SELECT 1
               FROM business_v2.pipeline_entries pe
              WHERE pe.party_id =
                    business_v2.best_party_by_email($1::citext)
                AND pe.stage NOT IN ('won', 'lost')
           ) AS allowed`,
          [address],
        );
        if (result.rows[0]?.allowed !== true) return false;
      }
      return true;
    }
  } catch (err) {
    logger.error(
      { err, groupFolder, type: request.type },
      'Gmail durable resource lookup failed closed',
    );
  }
  return false;
}
