import { describe, it, expect } from 'vitest';

import {
  isStatusCommand,
  formatPipelineStatus,
  PipelineStatusInput,
} from './pipeline-status.js';

describe('isStatusCommand', () => {
  it('matches bare command variants', () => {
    for (const t of [
      'status',
      'STATUS',
      ' /status ',
      '!status',
      '.status',
      'pipeline status',
      'pipeline-status',
      'status?',
      'Status.',
    ]) {
      expect(isStatusCommand(t)).toBe(true);
    }
  });

  it('strips a leading @mention', () => {
    expect(isStatusCommand('@Gru status', 'Gru')).toBe(true);
    expect(isStatusCommand('@gru pipeline status', 'Gru')).toBe(true);
  });

  it('rejects non-commands', () => {
    for (const t of [
      '',
      'what is the status of the lead?',
      'status update for the client',
      'pipeline is broken',
      'statusly',
    ]) {
      expect(isStatusCommand(t)).toBe(false);
    }
  });
});

function baseInput(
  overrides: Partial<PipelineStatusInput> = {},
): PipelineStatusInput {
  return {
    queue: {
      activeCount: 1,
      maxConcurrent: 5,
      waitingGroups: [],
      groupStates: {
        'slack:SALES||root': {
          active: true,
          containerName: 'nanoclaw-sales',
          containerAgeSec: 14,
          idleWaiting: false,
          pendingMessages: false,
          pendingTaskCount: 0,
          pipedMessageCount: 1,
          isTaskContainer: false,
          retryCount: 0,
        },
      },
    },
    circuitBreaker: {},
    channels: [{ name: 'slack', connected: true, lastActivitySec: 4 }],
    lastMessageAt: new Date(1_000_000 - 8000).toISOString(),
    registeredGroups: {
      'slack:SALES': { name: 'sales', folder: 'sales' },
      'slack:CHIEF': { name: 'chief', folder: 'chief' },
    },
    nowMs: 1_000_000,
    ...overrides,
  };
}

describe('formatPipelineStatus', () => {
  it('reports concurrency, named active containers, and free slots', () => {
    const out = formatPipelineStatus(baseInput());
    expect(out).toContain('CONCURRENCY  1/5 containers busy');
    expect(out).toContain('slots free');
    // composite key resolves to the group name, not the raw JID
    expect(out).toContain('sales');
    expect(out).not.toContain('slack:SALES');
    expect(out).toContain('age 14s');
    expect(out).toContain('piped:1');
  });

  it('flags capacity saturation and names waiting groups', () => {
    const out = formatPipelineStatus(
      baseInput({
        queue: {
          ...baseInput().queue,
          activeCount: 5,
          waitingGroups: ['slack:CHIEF||root'],
        },
      }),
    );
    expect(out).toContain('AT CAPACITY');
    expect(out).toContain('WAITING FOR A SLOT (1)');
    expect(out).toContain('chief');
  });

  it('surfaces open circuit breakers with cooldown and group name', () => {
    const out = formatPipelineStatus(
      baseInput({
        circuitBreaker: {
          sales: { failures: 5, open: true, cooldownRemainingMs: 42000 },
        },
      }),
    );
    expect(out).toContain('CIRCUIT BREAKERS  ⚠ OPEN');
    expect(out).toContain('sales: in cooldown ~42s');
  });

  it('warns on a disconnected channel', () => {
    const out = formatPipelineStatus(
      baseInput({
        channels: [{ name: 'slack', connected: false, lastActivitySec: null }],
      }),
    );
    expect(out).toContain('⚠ DISCONNECTED');
  });

  it('always includes the structural latency model', () => {
    const out = formatPipelineStatus(baseInput());
    expect(out).toContain('STRUCTURAL LATENCY');
    expect(out).toContain('host message poll');
    expect(out).toContain('mailman handoff hold');
  });
});
