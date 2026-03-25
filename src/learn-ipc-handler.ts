/**
 * Host-side IPC handlers for learning operations.
 *
 * learn_lesson  — single-agent self-lesson (e.g. sales extracts a lesson on approval)
 * route_lesson  — chief routes a lesson to one or more target agents
 */

import fs from 'fs';
import path from 'path';

import { logger } from './logger.js';

// ---------------------------------------------------------------------------
// learn_lesson — existing single-agent handler
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// route_lesson — chief routes lessons to target agents
// ---------------------------------------------------------------------------

export interface RouteLessonPayload {
  type: 'route_lesson';
  groupFolder: string; // set by IPC watcher (sourceGroup)
  target_agents: string[];
  title: string;
  problem: string;
  rule: string;
  context?: string;
}

export function isRouteLessonType(type: string): boolean {
  return type === 'route_lesson';
}

const LEARNED_HEADER = `# {agent} — Learned Lessons

_Lessons that override all other knowledge. Updated via chief knowledge management._
_Each lesson was provided or approved by a human._

---

<!-- Entries appended by route_lesson IPC handler -->
`;

function getNextLessonNumber(content: string): number {
  const matches = content.matchAll(/^### Lesson (\d+)/gm);
  let max = 0;
  for (const m of matches) {
    const n = parseInt(m[1], 10);
    if (n > max) max = n;
  }
  return max + 1;
}

function formatAgentName(folder: string): string {
  return folder.charAt(0).toUpperCase() + folder.slice(1);
}

export async function handleRouteLesson(
  data: RouteLessonPayload,
): Promise<{ updated: string[]; created: string[]; failed: string[] }> {
  const result = { updated: [] as string[], created: [] as string[], failed: [] as string[] };

  if (!data.target_agents?.length || !data.title || !data.rule) {
    logger.warn({ data }, 'route_lesson: missing required fields (target_agents, title, rule)');
    return result;
  }

  for (const agent of data.target_agents) {
    const agentDir = path.resolve('knowledge', 'agents', agent);
    const learnedPath = path.join(agentDir, 'LEARNED.md');

    // Create LEARNED.md if it doesn't exist (agent dir must exist)
    if (!fs.existsSync(agentDir)) {
      logger.warn({ agent }, 'route_lesson: agent knowledge dir not found — skipping');
      result.failed.push(agent);
      continue;
    }

    let fileCreated = false;
    if (!fs.existsSync(learnedPath)) {
      const header = LEARNED_HEADER.replace('{agent}', formatAgentName(agent));
      fs.writeFileSync(learnedPath, header, 'utf-8');
      fileCreated = true;
    }

    const content = fs.readFileSync(learnedPath, 'utf-8');
    const nextNum = getNextLessonNumber(content);

    const lines = [
      '',
      `### Lesson ${nextNum}: ${data.title}`,
      `**Problem:** ${data.problem}`,
      `**Rule:** ${data.rule}`,
    ];
    if (data.context) {
      lines.push(`**Context:** ${data.context}`);
    }
    lines.push('');

    fs.appendFileSync(learnedPath, lines.join('\n'), 'utf-8');

    // Sync to shared copy
    const sharedPath = path.resolve('knowledge', 'shared', `LEARNED-${agent}.md`);
    try {
      fs.copyFileSync(learnedPath, sharedPath);
    } catch {
      // shared copy is best-effort
    }

    if (fileCreated) {
      result.created.push(agent);
    } else {
      result.updated.push(agent);
    }

    logger.info(
      { agent, lessonNumber: nextNum, title: data.title },
      'Lesson routed to agent LEARNED.md',
    );
  }

  return result;
}
