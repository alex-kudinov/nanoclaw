/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./business-db.js', () => ({
  query: vi.fn(),
  withAgentContext: vi.fn(),
}));
vi.mock('./identity-join.js', () => ({
  resolveOrCreateParty: vi.fn(),
}));
vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { query, withAgentContext } from './business-db.js';
import { resolveOrCreateParty } from './identity-join.js';
import {
  handleChaosActivity,
  formatChaosActivityNotice,
  parseChaosPayload,
  ChaosPayloadError,
} from './chaos-activity.js';

/** Mock pg client: returns row ids for the SELECT-fn calls inside the tx. */
function makeClient() {
  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('fn_create_pipeline_entry')) {
        return { rows: [{ id: '129' }] };
      }
      if (sql.includes('fn_log_interaction_dedup')) {
        return { rows: [{ id: '888' }] };
      }
      return { rows: [] }; // fn_add_party_role
    }),
  };
}

let client: ReturnType<typeof makeClient>;

/** Point partyExists at a result: null = net-new, a number = returning. */
function setExistingParty(partyId: string | null) {
  vi.mocked(query).mockResolvedValue({ rows: [{ party_id: partyId }] } as any);
}

const basePayload = {
  visitor_id: 222838,
  email: 'Camille@gmail.com',
  display_name: 'Camille',
  identity_status: 'verified',
  email_validated_at: '2026-05-18T22:00:00Z',
  form_element_id: 'ts-download-form',
  form_page: '/coaching-tools/relationship-skills-action-plan/',
  intent_summary: 'downloaded the relationship skills action plan',
};

beforeEach(() => {
  vi.clearAllMocks();
  client = makeClient();
  vi.mocked(withAgentContext).mockImplementation(
    async (_agent: string, fn: any) => fn(client),
  );
  vi.mocked(resolveOrCreateParty).mockResolvedValue(700);
});

describe('parseChaosPayload', () => {
  it('lowercases email and falls back to local-part for display name', () => {
    const input = parseChaosPayload({
      visitor_id: 9,
      email: 'Jane.DOE@Example.com',
    });
    expect(input.email).toBe('jane.doe@example.com');
    expect(input.displayName).toBe('jane.doe');
  });

  it('throws on missing email', () => {
    expect(() => parseChaosPayload({ visitor_id: 1 })).toThrow(
      ChaosPayloadError,
    );
  });

  it('throws on missing visitor_id', () => {
    expect(() => parseChaosPayload({ email: 'x@y.com' })).toThrow(
      ChaosPayloadError,
    );
  });
});

describe('formatChaosActivityNotice', () => {
  it('leads with the exact recorded action, not Chaos metadata', () => {
    expect(
      formatChaosActivityNotice(
        { ...basePayload, form_event_type: 'form_lead_magnet' },
        {
          disposition: 'new-lead',
          partyId: 11409,
          pipelineEntryId: 129,
          interactionId: 888,
        },
      ),
    ).toBe(
      'New website lead: Camille downloaded the relationship skills action plan\n' +
        'CRM: new lead created • Party 11409',
    );
  });

  it('translates a form type and page slug when no intent summary exists', () => {
    expect(
      formatChaosActivityNotice(
        {
          ...basePayload,
          display_name: 'Lin',
          form_event_type: 'form_contact',
          form_page: '/mcs/mentor-coaching-foundations/',
          intent_summary: null,
        },
        {
          disposition: 'new-lead',
          partyId: 11409,
          pipelineEntryId: 129,
          interactionId: 888,
        },
      ).split('\n')[0],
    ).toBe(
      'New website lead: Lin submitted the contact form on the mentor coaching foundations page',
    );
  });

  it('describes returning newsletter activity without calling it a new lead', () => {
    expect(
      formatChaosActivityNotice(
        {
          ...basePayload,
          form_event_type: 'form_newsletter',
          intent_summary: null,
          form_page: null,
        },
        {
          disposition: 'returning',
          partyId: 700,
          pipelineEntryId: null,
          interactionId: 889,
        },
      ),
    ).toBe(
      'Website activity: Camille signed up for the newsletter\n' +
        'CRM: returning contact recorded • Party 700',
    );
  });
});

describe('handleChaosActivity', () => {
  it('net-new + lead form → new-lead with a pipeline entry', async () => {
    setExistingParty(null);
    const r = await handleChaosActivity({
      ...basePayload,
      form_event_type: 'form_contact',
    });
    expect(r).toEqual({
      disposition: 'new-lead',
      partyId: 700,
      pipelineEntryId: 129,
      interactionId: 888,
    });
    const sqls = client.query.mock.calls.map((c) => c[0] as string);
    expect(sqls.some((s) => s.includes('fn_add_party_role'))).toBe(true);
    expect(sqls.some((s) => s.includes('fn_create_pipeline_entry'))).toBe(true);
    expect(sqls.some((s) => s.includes('fn_log_interaction_dedup'))).toBe(true);
  });

  it('net-new + lead-magnet form → new-lead', async () => {
    setExistingParty(null);
    const r = await handleChaosActivity({
      ...basePayload,
      form_event_type: 'form_lead_magnet',
    });
    expect(r.disposition).toBe('new-lead');
    expect(r.pipelineEntryId).toBe(129);
  });

  it('net-new + no form → new-party, no pipeline entry', async () => {
    setExistingParty(null);
    const r = await handleChaosActivity({
      ...basePayload,
      form_event_type: null,
    });
    expect(r.disposition).toBe('new-party');
    expect(r.pipelineEntryId).toBeNull();
    const sqls = client.query.mock.calls.map((c) => c[0] as string);
    expect(sqls.some((s) => s.includes('fn_create_pipeline_entry'))).toBe(
      false,
    );
    expect(sqls.some((s) => s.includes('fn_add_party_role'))).toBe(true);
  });

  it('net-new + form_newsletter → new-party, no pipeline entry', async () => {
    setExistingParty(null);
    const r = await handleChaosActivity({
      ...basePayload,
      form_event_type: 'form_newsletter',
    });
    expect(r.disposition).toBe('new-party');
    expect(r.pipelineEntryId).toBeNull();
  });

  it('returning visitor → returning, no role, no pipeline (even with a lead form)', async () => {
    setExistingParty('500');
    const r = await handleChaosActivity({
      ...basePayload,
      form_event_type: 'form_contact',
    });
    expect(r.disposition).toBe('returning');
    expect(r.pipelineEntryId).toBeNull();
    const sqls = client.query.mock.calls.map((c) => c[0] as string);
    expect(sqls.some((s) => s.includes('fn_add_party_role'))).toBe(false);
    expect(sqls.some((s) => s.includes('fn_create_pipeline_entry'))).toBe(
      false,
    );
    expect(sqls.some((s) => s.includes('fn_log_interaction_dedup'))).toBe(true);
  });

  it('rejects a payload with no email', async () => {
    await expect(handleChaosActivity({ visitor_id: 1 })).rejects.toThrow(
      ChaosPayloadError,
    );
  });

  it('idempotent re-delivery: second call sees the party and is returning', async () => {
    setExistingParty(null);
    const first = await handleChaosActivity({
      ...basePayload,
      form_event_type: 'form_contact',
    });
    expect(first.disposition).toBe('new-lead');

    // Re-delivery — the party now exists.
    client = makeClient();
    vi.mocked(withAgentContext).mockImplementation(
      async (_agent: string, fn: any) => fn(client),
    );
    setExistingParty('700');
    const second = await handleChaosActivity({
      ...basePayload,
      form_event_type: 'form_contact',
    });
    expect(second.disposition).toBe('returning');
    expect(second.pipelineEntryId).toBeNull();
  });
});
