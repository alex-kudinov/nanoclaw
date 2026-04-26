import fs from 'fs';
import path from 'path';

import { DATA_DIR } from './config.js';

/**
 * Write a message JSON into a group's `messages/` dir for host-routed delivery.
 * Uses atomic write (tmp + rename) so the IPC watcher never reads partial files.
 */
export function writeHostMessage(
  groupFolder: string,
  payload: Record<string, unknown>,
): void {
  if (!groupFolder || typeof groupFolder !== 'string') {
    throw new Error('writeHostMessage: groupFolder must be a non-empty string');
  }

  const dir = path.join(DATA_DIR, 'ipc', groupFolder, 'messages');
  const filename = `classify-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`;
  const finalPath = path.join(dir, filename);
  const tmpPath = `${finalPath}.tmp`;
  const data = JSON.stringify(payload, null, 2);

  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tmpPath, data, 'utf-8');
    fs.renameSync(tmpPath, finalPath);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'EPERM') {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(tmpPath, data, 'utf-8');
      fs.renameSync(tmpPath, finalPath);
      return;
    }
    throw err;
  }
}
