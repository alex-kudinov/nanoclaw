/**
 * Host-side IPC handler for learn_lesson operations.
 * Agent containers write IPC files with type 'learn_lesson';
 * the host IPC watcher dispatches here to append lessons to LEARNED.md.
 */

import fs from 'fs';
import path from 'path';

import { logger } from './logger.js';

export interface LearnLessonPayload {
  type: 'learn_lesson';
  groupFolder: string;
  lesson: string;
  lead_context?: string;
  timestamp?: string;
}

export function isLearnIpcType(type: string): boolean {
  return type === 'learn_lesson';
}

export async function handleLearnLesson(
  data: LearnLessonPayload,
): Promise<void> {
  if (!data.lesson) {
    logger.warn({ data }, 'learn_lesson: missing lesson text');
    return;
  }

  const knowledgeDir = path.resolve('knowledge', 'agents', data.groupFolder);
  const learnedPath = path.join(knowledgeDir, 'LEARNED.md');

  if (!fs.existsSync(learnedPath)) {
    logger.warn(
      { learnedPath, groupFolder: data.groupFolder },
      'learn_lesson: LEARNED.md not found — skipping',
    );
    return;
  }

  const date = data.timestamp || new Date().toISOString().split('T')[0];
  const lines = [`\n## ${date}`];
  if (data.lead_context) {
    lines.push(`**Context:** ${data.lead_context}`);
  }
  lines.push(`**Lesson:** ${data.lesson}`, '');

  fs.appendFileSync(learnedPath, lines.join('\n'), 'utf-8');

  logger.info(
    { groupFolder: data.groupFolder },
    'Lesson appended to LEARNED.md',
  );
}
