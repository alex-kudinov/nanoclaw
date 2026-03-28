import * as fs from 'fs';

import { CronExpressionParser } from 'cron-parser';

import {
  upsertJobDefinition,
  getJob,
  getJobNames,
  setJobEnabled,
  updateJobNextRun,
} from './db.js';
import { logger } from './logger.js';
import type { JobDefinition } from './types.js';

interface JobRegistryFile {
  projects: Record<string, string>;
  jobs: Array<{
    name: string;
    description: string;
    project: string;
    script: string;
    args?: string[];
    cron: string;
    timezone?: string;
    retries?: number;
    retry_delay_ms?: number;
    alert_level?: 'alert' | 'warn' | 'silent';
    enabled?: boolean;
    timeout_ms?: number;
    lockfile?: string | null;
  }>;
}

type OnJobDisabled = (jobName: string) => void;

export function loadJobRegistry(
  registryPath: string,
  onJobDisabled?: OnJobDisabled,
): void {
  let raw: string;
  try {
    raw = fs.readFileSync(registryPath, 'utf-8');
  } catch (err) {
    logger.warn({ err, path: registryPath }, 'Failed to read job registry file');
    return;
  }

  let data: JobRegistryFile;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    logger.warn({ err, path: registryPath }, 'Failed to parse job registry JSON - skipping sync');
    return;
  }

  if (!data.projects || !data.jobs) {
    logger.warn({ path: registryPath }, 'Job registry missing projects or jobs key');
    return;
  }

  const registryNames = new Set<string>();

  for (const jobEntry of data.jobs) {
    const projectRoot = data.projects[jobEntry.project];
    if (!projectRoot) {
      logger.warn({ job: jobEntry.name, project: jobEntry.project }, 'Unknown project in job registry - skipping');
      continue;
    }

    // Validate cron expression
    try {
      CronExpressionParser.parse(jobEntry.cron, {
        tz: jobEntry.timezone || 'America/Chicago',
      });
    } catch (err) {
      logger.warn({ job: jobEntry.name, cron: jobEntry.cron, err }, 'Invalid cron expression - skipping');
      continue;
    }

    const def: JobDefinition = {
      name: jobEntry.name,
      description: jobEntry.description || '',
      project: jobEntry.project,
      project_root: projectRoot,
      script: jobEntry.script,
      args: jobEntry.args || [],
      cron: jobEntry.cron,
      timezone: jobEntry.timezone || 'America/Chicago',
      retries: jobEntry.retries ?? 0,
      retry_delay_ms: jobEntry.retry_delay_ms ?? 60000,
      alert_level: jobEntry.alert_level || 'alert',
      timeout_ms: jobEntry.timeout_ms ?? 5400000,
      lockfile: jobEntry.lockfile ?? null,
      enabled: jobEntry.enabled !== false,
    };

    // Check if cron or timezone changed - only recompute next_run if so
    const existing = getJob(def.name);
    upsertJobDefinition(def);

    if (!existing || !existing.next_run || existing.cron !== def.cron || existing.timezone !== def.timezone) {
      // Compute next_run from now
      const nextRun = computeNextRun(def.cron, def.timezone);
      if (nextRun) {
        updateJobNextRun(def.name, nextRun);
      }
    }

    registryNames.add(jobEntry.name);
  }

  // Disable jobs that were removed from the registry
  const dbNames = getJobNames();
  for (const dbName of dbNames) {
    if (!registryNames.has(dbName)) {
      const existing = getJob(dbName);
      if (existing && existing.enabled) {
        setJobEnabled(dbName, false);
        logger.info({ job: dbName }, 'Job disabled - removed from registry');
        onJobDisabled?.(dbName);
      }
    }
  }

  logger.info({ count: registryNames.size }, 'Job registry loaded');
}

export function watchJobRegistry(
  registryPath: string,
  onJobDisabled?: OnJobDisabled,
): void {
  fs.watchFile(registryPath, { interval: 2000 }, (curr, prev) => {
    if (curr.mtimeMs === prev.mtimeMs) return;
    logger.info({ path: registryPath }, 'Job registry file changed - reloading');
    loadJobRegistry(registryPath, onJobDisabled);
  });
}

export function unwatchJobRegistry(registryPath: string): void {
  fs.unwatchFile(registryPath);
}

function computeNextRun(cron: string, timezone: string): string | null {
  try {
    const interval = CronExpressionParser.parse(cron, {
      currentDate: new Date(),
      tz: timezone,
    });
    const next = interval.next();
    return next.toISOString();
  } catch {
    return null;
  }
}

/** Compute next run from a given base time. Used after a job completes. */
export function computeNextRunFrom(cron: string, timezone: string, fromDate?: Date): string | null {
  try {
    const interval = CronExpressionParser.parse(cron, {
      currentDate: fromDate || new Date(),
      tz: timezone,
    });
    const next = interval.next();
    return next.toISOString();
  } catch {
    return null;
  }
}
