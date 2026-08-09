/** Host-owned Procurement convergence backstop. */

import type { QueryResult, QueryResultRow } from 'pg';

import { query as businessQuery } from './business-db.js';
import { logger } from './logger.js';

interface AlertRow extends QueryResultRow {
  alert_id: number | string;
  alert_text: string;
  channel_jid: string | null;
  thread_ts: string | null;
}

interface AckRow extends QueryResultRow {
  acknowledged: boolean;
}

interface CountRow extends QueryResultRow {
  count: number | string;
}

export interface ProcurementReconcilerDeps {
  query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
  alert(text: string, channelJid?: string, threadTs?: string): Promise<void>;
  now?: () => Date;
}

export interface ProcurementReconcileResult {
  alertsPosted: number;
  alertsFailed: number;
  unroutedEmailCount: number;
}

const defaultQuery: ProcurementReconcilerDeps['query'] = (sql, params = []) =>
  businessQuery(sql, params);

export async function runProcurementReconciler(
  deps: Omit<ProcurementReconcilerDeps, 'query'> & {
    query?: ProcurementReconcilerDeps['query'];
  },
): Promise<ProcurementReconcileResult> {
  const query = deps.query ?? defaultQuery;
  const now = (deps.now ?? (() => new Date()))();
  const alerts = await query<AlertRow>(
    'SELECT * FROM public.fn_reconcile_procurement($1::timestamptz)',
    [now.toISOString()],
  );

  let alertsPosted = 0;
  let alertsFailed = 0;
  let unroutedEmailCount = 0;
  try {
    const count = await query<CountRow>(
      `SELECT count(*)::integer AS count
         FROM public.email_classifications
        WHERE label IN ('MrGru/procurement/rfp', 'MrGru/procurement/rfq')
          AND routed_at IS NULL`,
    );
    unroutedEmailCount = Number(count.rows[0]?.count ?? 0);
    if (unroutedEmailCount > 0) {
      const emailAlert = await query<AlertRow>(
        `INSERT INTO public.procurement_reconciler_alerts (
           condition_key, subject_kind, subject_id, subject_version, alert_text
         ) VALUES (
           'unrouted_procurement_email', 'email_backlog', 'procurement',
           ($1::timestamptz AT TIME ZONE 'America/Chicago')::date::text,
           $2
         ) ON CONFLICT DO NOTHING
         RETURNING id AS alert_id, alert_text, channel_jid, thread_ts`,
        [
          now.toISOString(),
          `[PROCUREMENT ALERT] ${unroutedEmailCount} Procurement email classification(s) remain unrouted. New traffic uses the active handoff path; historical replay remains held.`,
        ],
      );
      alerts.rows.push(...emailAlert.rows);
    }
  } catch (error) {
    alertsFailed += 1;
    logger.error(
      { err: error },
      'procurement-reconciler: email backlog count unavailable',
    );
  }

  for (const row of alerts.rows) {
    const alertId = Number(row.alert_id);
    if (!Number.isSafeInteger(alertId) || alertId <= 0) {
      alertsFailed += 1;
      logger.error(
        { alertId: row.alert_id },
        'procurement-reconciler: invalid alert id',
      );
      continue;
    }
    try {
      await deps.alert(
        row.alert_text,
        row.channel_jid ?? undefined,
        row.thread_ts ?? undefined,
      );
      alertsPosted += 1;
    } catch (error) {
      alertsFailed += 1;
      logger.warn(
        { err: error, alertId },
        'procurement-reconciler: alert delivery failed; left pending',
      );
      continue;
    }

    try {
      const acknowledged = await query<AckRow>(
        `SELECT public.fn_ack_procurement_reconciler_alert($1) AS acknowledged`,
        [alertId],
      );
      if (acknowledged.rows[0]?.acknowledged !== true) {
        throw new Error('alert acknowledgment returned no update');
      }
    } catch (error) {
      logger.warn(
        { err: error, alertId },
        'procurement-reconciler: delivered alert was not acknowledged; it may be retried',
      );
    }
  }
  return { alertsPosted, alertsFailed, unroutedEmailCount };
}
