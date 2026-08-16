import http from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WebhookServer, type WebhookServerDeps } from './webhook-server.js';
import type { WebhookDefinition } from './types.js';

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(() => false),
      readFileSync: vi.fn(() => '[]'),
      writeFileSync: vi.fn(),
      mkdirSync: vi.fn(),
      watchFile: vi.fn(),
      unwatchFile: vi.fn(),
    },
  };
});

function request(
  port: number,
  body: unknown,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/hook/cnpc-coaching-intake',
        method: 'POST',
        headers: { 'x-webhook-secret': 'test-private-secret' },
      },
      (res) => {
        let response = '';
        res.on('data', (chunk: Buffer) => (response += chunk.toString()));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, body: response }),
        );
      },
    );
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}

const webhook: WebhookDefinition = {
  id: 'cnpc-coaching-intake',
  name: 'CNPC Intake',
  group: 'cnpc',
  chat_jid: 'slack:C0BPG0408BW',
  prompt_template: '[CNPC_INTAKE]\n{{payload}}',
  secret: 'test-private-secret',
  context_mode: 'isolated',
  created_at: '2026-08-11T00:00:00Z',
};

const group = {
  name: 'gru-cnpc',
  folder: 'cnpc',
  trigger: '',
  added_at: '2026-08-11T00:00:00Z',
};

function validInput() {
  return {
    submission_id: 'gf:1:583',
    submitted_at: '2026-08-11T02:10:47.000Z',
    applicant: {
      first_name: 'Test',
      last_name: 'Applicant',
      email: 'dummy@example.invalid',
      lead_source: 'Test referral',
    },
    organization: {
      legal_name: 'Example Organization',
      website: 'https://example.invalid',
      city: 'Chicago',
      state: 'Illinois',
      organization_type: 'nonprofit_501c3',
      operating_expense_band: 'under_250k',
    },
    request: {
      program_track: 'cnpc',
      coaching_type: 'individual',
      why_coaching: 'Synthetic workflow verification.',
      first_choice_coach: '',
      second_choice_coach: '',
      anything_else: '',
    },
    consent: true,
    source: { form_id: '1', entry_id: '583' },
  };
}

describe('CNPC webhook host boundary', () => {
  let servers: WebhookServer[] = [];

  beforeEach(() => vi.clearAllMocks());
  afterEach(async () => {
    await Promise.all(servers.map((server) => server.stop().catch(() => {})));
    servers = [];
  });

  async function start(overrides: Partial<WebhookServerDeps> = {}) {
    const deps: WebhookServerDeps = {
      port: 0,
      webhooksFile: '/tmp/cnpc-webhooks.json',
      globalSecret: '',
      heartbeatPath: '/tmp/cnpc-heartbeat.json',
      getRegisteredGroups: () => ({ 'slack:C0BPG0408BW': group }),
      runAgent: vi.fn(async () => ({
        status: 'success' as const,
        result: null,
      })),
      enqueueBookingPlutioActivity: vi.fn(async () => ({
        outboxId: 1,
        eventId: 'unused',
        kind: `booking_activity:${'a'.repeat(64)}`,
        partyId: 1,
        interactionId: 1,
        duplicate: false,
      })),
      enqueueAgentTask: vi.fn((_jid, _id, fn) => void fn()),
      sendMessage: vi.fn(async () => {}),
      getHealth: () => ({
        release: {
          mode: 'release',
          verified: true,
          commit: 'a'.repeat(40),
          sourceTree: 'b'.repeat(40),
          artifactHash: 'c'.repeat(64),
          builtAt: '2026-08-11T00:00:00.000Z',
          nodePin: '22.23.2',
          nodeVersion: '22.23.2',
          codeRoot: '/opt/nanoclaw/releases/test',
          codeRootMatchesRelease: true,
        },
        channels: {},
        activeContainers: 0,
        lastMessageAt: null,
      }),
      ...overrides,
    };
    const server = new WebhookServer(deps);
    servers.push(server);
    await server.start();
    (server as unknown as { webhooks: WebhookDefinition[] }).webhooks = [
      webhook,
    ];
    return { deps, server };
  }

  it('rejects malformed n8n mappings before archive or dispatch', async () => {
    const archiveWebhook = vi.fn(async () => ({ id: 70, isDuplicate: false }));
    const runAgent = vi.fn(async () => ({
      status: 'success' as const,
      result: null,
    }));
    const { deps, server } = await start({ archiveWebhook, runAgent });

    const response = await request(server.getPort(), {
      submission_id: 'gf:1:583',
    });

    expect(response.status).toBe(422);
    expect(JSON.parse(response.body).error).toContain('applicant');
    expect(archiveWebhook).not.toHaveBeenCalled();
    expect(runAgent).not.toHaveBeenCalled();
    expect(deps.sendMessage).not.toHaveBeenCalled();
  });

  it('host-writes intake and validates the bounded match result', async () => {
    const archiveWebhook = vi.fn(async () => ({ id: 71, isDuplicate: false }));
    const markWebhookHandled = vi.fn(async () => {});
    const handleCnpcIntake = vi.fn(async () => ({
      event_type: 'cnpc.intake.created' as const,
      intake: {
        id: 501,
        submission_id: 'gf:1:583',
        submitted_at: '2026-08-11T02:10:47.000Z',
        applicant_name: 'Test Applicant',
        applicant_email: 'dummy@example.invalid',
        lead_source: 'Test referral',
        organization: {
          legal_name: 'Example Organization',
          organization_type: 'nonprofit_501c3' as const,
          operating_expense_band: 'under_250k' as const,
        },
        request: {
          program_track: 'cnpc' as const,
          coaching_type: 'individual' as const,
          why_coaching: 'Synthetic workflow verification.',
        },
        consent: true,
      },
      eligibility: { status: 'eligible' as const, reason: 'passed' },
      pricing: {
        currency: 'USD' as const,
        individual_price_cents: 30000,
        team_price_cents: 50000,
      },
      match_pool: {
        roster_version: 'a'.repeat(64),
        candidate_count: 1,
        candidates: [
          {
            coach_id: 11,
            display_name: 'Coach Example',
            icf_credential: 'PCC',
            matching_summary: 'Nonprofit leadership transitions',
            languages: ['English'],
            time_zones: ['America/Chicago'],
            work_types: ['regular_cnpc'],
            public_profile_url: null,
            capacity_snapshot_id: 81,
            current_client_count: 1,
            available_slots_after_holds: 2,
            profile_source_updated_at: null,
            capacity_observed_at: '2026-08-10T00:00:00Z',
          },
        ],
      },
    }));
    const result = `<cnpc_match_result>${JSON.stringify({
      intake_id: 501,
      roster_version: 'a'.repeat(64),
      recommendations: [
        {
          coach_id: 11,
          rank: 1,
          fit_score: 92,
          recommendation_role: 'primary',
          reasons: ['Relevant nonprofit leadership experience'],
        },
      ],
    })}</cnpc_match_result>\nVisible CNPC review`;
    const recordCnpcMatchResult = vi.fn(async () => 701);
    const runAgent = vi.fn(async (_group, _input, _onProcess, onOutput) => {
      await onOutput?.({ status: 'success', result });
      return { status: 'success' as const, result };
    });
    const { deps, server } = await start({
      archiveWebhook,
      markWebhookHandled,
      handleCnpcIntake,
      recordCnpcMatchResult,
      runAgent,
    });

    const response = await request(server.getPort(), validInput());

    expect(response.status).toBe(202);
    await vi.waitFor(() => expect(recordCnpcMatchResult).toHaveBeenCalled());
    expect(handleCnpcIntake).toHaveBeenCalledWith(
      expect.objectContaining({ submission_id: 'gf:1:583' }),
      71,
    );
    expect(recordCnpcMatchResult).toHaveBeenCalledWith(
      expect.objectContaining({ intake_id: 501 }),
      expect.objectContaining({
        match_pool: expect.objectContaining({ roster_version: 'a'.repeat(64) }),
      }),
    );
    expect(deps.sendMessage).toHaveBeenCalledWith(
      'slack:C0BPG0408BW',
      'Visible CNPC review',
      { fromGroup: 'cnpc' },
    );
    await vi.waitFor(() => expect(markWebhookHandled).toHaveBeenCalled());
    expect(markWebhookHandled).toHaveBeenCalledWith(71, {
      handled_by: 'cnpc',
      related_entity: { kind: 'cnpc_intake', id: 501 },
    });
  });
});
