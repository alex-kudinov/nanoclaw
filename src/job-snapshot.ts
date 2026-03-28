import fs from 'fs';
import path from 'path';

import { getAllJobs, getJobRunLogs } from './db.js';
import { formatJobList, formatJobStatus } from './job-reporter.js';
import { logger } from './logger.js';

/**
 * Write a snapshot of all jobs to a container's IPC directory.
 * The container-side MCP `jobs` tool reads this file for list/status queries.
 */
export function writeJobsSnapshot(ipcDir: string): void {
  try {
    const jobs = getAllJobs();
    const jobsWithLogs = jobs.map((job) => {
      const logs = getJobRunLogs(job.name, 3);
      return { ...job, recent_logs: logs };
    });

    const snapshot = {
      generated_at: new Date().toISOString(),
      jobs: jobsWithLogs,
      job_list_text: formatJobList(jobs),
      job_status: Object.fromEntries(
        jobsWithLogs.map((j) => [
          j.name,
          formatJobStatus(j, j.recent_logs),
        ]),
      ),
    };

    const snapshotPath = path.join(ipcDir, 'current_jobs.json');
    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
  } catch (err) {
    logger.warn({ err, ipcDir }, 'Failed to write jobs snapshot');
  }
}
