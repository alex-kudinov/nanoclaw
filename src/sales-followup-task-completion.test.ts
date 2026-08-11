import { describe, expect, it, vi } from 'vitest';

import {
  isDailySalesFollowupTask,
  validateSalesFollowupTaskCompletion,
} from './sales-followup-task-completion.js';
import type { NewMessage, ScheduledTask } from './types.js';

const task: ScheduledTask = {
  id: 'task-followup-daily',
  group_folder: 'sales',
  chat_jid: 'slack:SALES',
  prompt: 'Daily follow-up check.',
  schedule_type: 'cron',
  schedule_value: '0 9 * * 1-5',
  context_mode: 'isolated',
  next_run: '2026-08-12T14:00:00.000Z',
  last_run: null,
  last_result: null,
  status: 'active',
  created_at: '2026-08-01T00:00:00.000Z',
};

function post(content: string, fromGroup = 'sales'): NewMessage {
  return {
    id: '1786470000.000100',
    chat_jid: 'slack:SALES',
    sender: 'B_GRU',
    sender_name: 'Mr Gru',
    content,
    timestamp: '2026-08-11T14:01:00.000Z',
    from_group: fromGroup,
    thread_ts: undefined,
  };
}

describe('daily Sales follow-up completion receipt', () => {
  it('recognizes only the canonical task identity', () => {
    expect(isDailySalesFollowupTask(task)).toBe(true);
    expect(
      isDailySalesFollowupTask({ ...task, id: 'another-sales-task' }),
    ).toBe(false);
  });

  it('accepts the explicit empty-queue receipt', () => {
    const reader = {
      getBotMessagesSince: vi.fn(() => [
        post('No leads pending follow-up today.'),
      ]),
    };
    expect(() =>
      validateSalesFollowupTaskCompletion(
        task,
        Date.parse('2026-08-11T14:00:00.000Z'),
        'No leads pending follow-up today.',
        reader,
      ),
    ).not.toThrow();
    expect(reader.getBotMessagesSince).toHaveBeenCalledWith(
      'slack:SALES',
      '2026-08-11T14:00:00.000Z',
    );
  });

  it('accepts a count-consistent receipt bound to every visible artifact', () => {
    const reader = {
      getBotMessagesSince: vi.fn(() => [
        post('[FOLLOW-UP #1] Lead #1047\nCategory: followup'),
        post('[COLD] Lead #938 — no response after 2 follow-ups.'),
      ]),
    };
    expect(() =>
      validateSalesFollowupTaskCompletion(
        task,
        Date.parse('2026-08-11T14:00:00.000Z'),
        '[FOLLOW-UP RUN COMPLETE] selected=2 follow-up-cards=1 cold=1 remaining=106 ids=1047,938',
        reader,
      ),
    ).not.toThrow();
  });

  it('accepts the final visible card state after an asynchronous rejection correction', () => {
    const reader = {
      getBotMessagesSince: vi.fn(() => [
        post('[FOLLOW-UP #1] Lead #349\nCategory: followup'),
        post(
          '[FOLLOW-UP RUN COMPLETE] selected=2 follow-up-cards=2 cold=0 remaining=106 ids=349,472',
        ),
        post('[FOLLOW-UP #1] Lead #472\nCategory: followup'),
      ]),
    };
    expect(() =>
      validateSalesFollowupTaskCompletion(
        task,
        Date.parse('2026-08-11T14:00:00.000Z'),
        'Corrected Lead #472 card reposted.',
        reader,
      ),
    ).not.toThrow();
  });

  it('rejects waiting prose, held-result warnings, and another group output', () => {
    const reader = {
      getBotMessagesSince: vi.fn(() => [
        post('Waiting for Gmail results.'),
        post('[GMAIL RESULT HELD] container exited.'),
        post('[FOLLOW-UP #1] Lead #1047', 'chief'),
      ]),
    };
    expect(() =>
      validateSalesFollowupTaskCompletion(
        task,
        Date.now(),
        'Waiting for Gmail results.',
        reader,
      ),
    ).toThrow(
      'Daily Sales follow-up produced neither an empty-queue receipt nor a valid completion receipt',
    );
  });

  it('rejects inconsistent counts and a receipt that names a missing card', () => {
    const reader = {
      getBotMessagesSince: vi.fn(() => [
        post('[FOLLOW-UP #1] Lead #1047\nCategory: followup'),
      ]),
    };
    expect(() =>
      validateSalesFollowupTaskCompletion(
        task,
        Date.now(),
        '[FOLLOW-UP RUN COMPLETE] selected=2 follow-up-cards=1 cold=0 remaining=106 ids=1047,938',
        reader,
      ),
    ).toThrow('completion receipt has inconsistent counts');
    expect(() =>
      validateSalesFollowupTaskCompletion(
        task,
        Date.now(),
        '[FOLLOW-UP RUN COMPLETE] selected=2 follow-up-cards=2 cold=0 remaining=106 ids=1047,938',
        reader,
      ),
    ).toThrow('missing visible artifacts for Lead #938');
  });

  it('rejects a receipt whose follow-up/cold counts do not match card types', () => {
    const reader = {
      getBotMessagesSince: vi.fn(() => [
        post('[FOLLOW-UP #1] Lead #1047\nCategory: followup'),
        post('[COLD] Lead #938 — no response after 2 follow-ups.'),
      ]),
    };
    expect(() =>
      validateSalesFollowupTaskCompletion(
        task,
        Date.now(),
        '[FOLLOW-UP RUN COMPLETE] selected=2 follow-up-cards=2 cold=0 remaining=106 ids=1047,938',
        reader,
      ),
    ).toThrow('does not match visible artifact types');
  });

  it('does not impose the Sales receipt on unrelated scheduled tasks', () => {
    const reader = { getBotMessagesSince: vi.fn(() => []) };
    expect(() =>
      validateSalesFollowupTaskCompletion(
        { ...task, id: 'task-other' },
        Date.now(),
        null,
        reader,
      ),
    ).not.toThrow();
    expect(reader.getBotMessagesSince).not.toHaveBeenCalled();
  });
});
