import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./ipc-writer.js', () => ({ writeHostMessage: vi.fn() }));
vi.mock('./lead-matcher.js', () => ({ matchLead: vi.fn() }));
vi.mock('./logger.js', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { routeClassifiedEmail, type RouteParams } from './host-router.js';
import { writeHostMessage } from './ipc-writer.js';
import { matchLead } from './lead-matcher.js';
import type { PipelineMatch } from './lead-matcher.js';

const mockWrite = writeHostMessage as ReturnType<typeof vi.fn>;
const mockMatch = matchLead as ReturnType<typeof vi.fn>;

function makeParams(overrides: Partial<RouteParams> = {}): RouteParams {
  return {
    label: 'other',
    senderEmail: 'bob@example.com',
    senderName: 'Bob',
    subject: 'Test',
    body: 'Hello world',
    threadId: 'thr-1',
    messageId: 'msg-1',
    ...overrides,
  };
}

// ── Production-like pipeline match fixtures ───────────────────────

const proposalMatch: PipelineMatch = {
  pipeline_entry_id: 17,
  party_id: 10042,
  display_name: 'Alice Corp',
  stage: 'proposal',
  program_slug: 'coaching-inquiry',
  last_interaction_at: '2026-04-11T14:30:00+00:00',
  thread_id: '18f1a2b3c4d5e6f7',
};

const noThreadMatch: PipelineMatch = {
  pipeline_entry_id: 23,
  party_id: 10058,
  display_name: 'Bob Smith',
  stage: 'qualifying',
  program_slug: 'certification-inquiry',
  last_interaction_at: '2026-04-10T09:00:00+00:00',
  thread_id: null,
};

const negotiatingMatch: PipelineMatch = {
  pipeline_entry_id: 5,
  party_id: 10012,
  display_name: 'Charlie Davis',
  stage: 'negotiating',
  program_slug: 'coaching-inquiry',
  last_interaction_at: '2026-04-09T16:45:00+00:00',
  thread_id: '19a2b3c4d5e6f789',
};

describe('host-router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMatch.mockResolvedValue(null);
  });

  // ══════════════════════════════════════════════════════════════════
  // 1. Lead routing: no match → inbox handoff
  // ══════════════════════════════════════════════════════════════════

  it('routes lead with no match to inbox via mailman', async () => {
    const r = await routeClassifiedEmail(makeParams({ label: 'lead/inquiry' }));
    expect(r).toEqual({ routed: true, action: 'ipc_written', target: 'mailman' });
    expect(mockWrite).toHaveBeenCalledOnce();
    const [group, payload] = mockWrite.mock.calls[0];
    expect(group).toBe('mailman');
    expect(payload.text).toContain('[HANDOFF: mailman\u2192inbox]');
    expect(payload.text).toContain('[SOURCE: email]');
  });

  // ══════════════════════════════════════════════════════════════════
  // 2. Lead routing: match → sales handoff with business_v2 fields
  // ══════════════════════════════════════════════════════════════════

  it('routes lead with match to sales via mailman using v2 fields', async () => {
    mockMatch.mockResolvedValue(proposalMatch);
    const r = await routeClassifiedEmail(makeParams({ label: 'lead/inquiry' }));
    expect(r).toEqual({ routed: true, action: 'ipc_written', target: 'mailman' });
    const text: string = mockWrite.mock.calls[0][1].text;
    expect(text).toContain('[HANDOFF: mailman\u2192sales]');
    expect(text).toContain('Entry ID: 17');
    expect(text).toContain('Party ID: 10042');
    expect(text).toContain('Lead: Alice Corp (proposal)');
    expect(text).toContain('Program: coaching-inquiry');
    expect(text).toContain('Thread-ID: 18f1a2b3c4d5e6f7');
  });

  it('uses inbound threadId as fallback when match has no thread_id', async () => {
    mockMatch.mockResolvedValue(noThreadMatch);
    const r = await routeClassifiedEmail(makeParams({ label: 'lead/reply', threadId: 'thr-1' }));
    expect(r).toEqual({ routed: true, action: 'ipc_written', target: 'mailman' });
    const text: string = mockWrite.mock.calls[0][1].text;
    expect(text).toContain('Thread-ID: thr-1');
    expect(text).not.toContain('Thread-ID: none');
    expect(text).toContain('Party ID: 10058');
  });

  it('omits Thread-ID when match.thread_id is null and params.threadId is absent', async () => {
    mockMatch.mockResolvedValue(noThreadMatch);
    const r = await routeClassifiedEmail(makeParams({ label: 'lead/reply', threadId: '' }));
    expect(r).toEqual({ routed: true, action: 'ipc_written', target: 'mailman' });
    const text: string = mockWrite.mock.calls[0][1].text;
    expect(text).not.toContain('Thread-ID:');
    expect(text).toContain('Party ID: 10058');
  });

  it('uses inbound threadId as fallback in fmtLeadSales (null DB thread_id)', async () => {
    mockMatch.mockResolvedValue(noThreadMatch);
    const r = await routeClassifiedEmail(makeParams({ label: 'lead/reply', threadId: '19dc2b05f1df06cf' }));
    expect(r).toEqual({ routed: true, action: 'ipc_written', target: 'mailman' });
    const text: string = mockWrite.mock.calls[0][1].text;
    expect(text).toContain('Thread-ID: 19dc2b05f1df06cf');
  });

  it('includes Thread-ID in inbox handoff when threadId is present', async () => {
    const r = await routeClassifiedEmail(makeParams({ label: 'lead/inquiry', threadId: 'inbox-thr-42' }));
    expect(r).toEqual({ routed: true, action: 'ipc_written', target: 'mailman' });
    const text: string = mockWrite.mock.calls[0][1].text;
    expect(text).toContain('[HANDOFF: mailman\u2192inbox]');
    expect(text).toContain('Thread-ID: inbox-thr-42');
  });

  it('omits Thread-ID from inbox handoff when threadId is empty', async () => {
    const r = await routeClassifiedEmail(makeParams({ label: 'lead/inquiry', threadId: '' }));
    expect(r).toEqual({ routed: true, action: 'ipc_written', target: 'mailman' });
    const text: string = mockWrite.mock.calls[0][1].text;
    expect(text).toContain('[HANDOFF: mailman\u2192inbox]');
    expect(text).not.toContain('Thread-ID:');
  });

  it('includes sender email and body in sales handoff', async () => {
    mockMatch.mockResolvedValue(proposalMatch);
    const p = makeParams({
      label: 'lead/inquiry',
      senderEmail: 'alice@corp.com',
      body: 'I am interested in coaching certification',
    });
    await routeClassifiedEmail(p);
    const text: string = mockWrite.mock.calls[0][1].text;
    expect(text).toContain('From: alice@corp.com');
    expect(text).toContain('Body:\nI am interested in coaching certification');
  });

  // ══════════════════════════════════════════════════════════════════
  // 3. No legacy fields in sales handoff
  // ══════════════════════════════════════════════════════════════════

  it('does NOT emit "Lead ID:" in sales handoff', async () => {
    mockMatch.mockResolvedValue(proposalMatch);
    await routeClassifiedEmail(makeParams({ label: 'lead/inquiry' }));
    const text: string = mockWrite.mock.calls[0][1].text;
    expect(text).not.toContain('Lead ID:');
  });

  it('does NOT emit "Follow-ups:" in sales handoff', async () => {
    mockMatch.mockResolvedValue(proposalMatch);
    await routeClassifiedEmail(makeParams({ label: 'lead/inquiry' }));
    const text: string = mockWrite.mock.calls[0][1].text;
    expect(text).not.toContain('Follow-ups:');
  });

  it('does NOT emit bare "Thread:" (uses "Thread-ID:" instead)', async () => {
    mockMatch.mockResolvedValue(proposalMatch);
    await routeClassifiedEmail(makeParams({ label: 'lead/inquiry' }));
    const text: string = mockWrite.mock.calls[0][1].text;
    // Should use "Thread-ID:" not bare "Thread:"
    expect(text).toContain('Thread-ID:');
    // Ensure there's no bare "Thread: " that isn't "Thread-ID: "
    const threadLines = text.split('\n').filter((l: string) => l.startsWith('Thread'));
    for (const line of threadLines) {
      expect(line).toMatch(/^Thread-ID:/);
    }
  });

  // ══════════════════════════════════════════════════════════════════
  // 4. Stage-specific handoff content
  // ══════════════════════════════════════════════════════════════════

  it('handoff shows "proposal" stage for proposal leads', async () => {
    mockMatch.mockResolvedValue(proposalMatch);
    await routeClassifiedEmail(makeParams({ label: 'lead/reply' }));
    const text: string = mockWrite.mock.calls[0][1].text;
    expect(text).toContain('Lead: Alice Corp (proposal)');
  });

  it('handoff shows "qualifying" stage for qualifying leads', async () => {
    mockMatch.mockResolvedValue(noThreadMatch);
    await routeClassifiedEmail(makeParams({ label: 'lead/reply' }));
    const text: string = mockWrite.mock.calls[0][1].text;
    expect(text).toContain('Lead: Bob Smith (qualifying)');
  });

  it('handoff shows "negotiating" stage for negotiating leads', async () => {
    mockMatch.mockResolvedValue(negotiatingMatch);
    await routeClassifiedEmail(makeParams({ label: 'lead/reply' }));
    const text: string = mockWrite.mock.calls[0][1].text;
    expect(text).toContain('Lead: Charlie Davis (negotiating)');
  });

  // ══════════════════════════════════════════════════════════════════
  // 5. Non-lead routes (unchanged behavior)
  // ══════════════════════════════════════════════════════════════════

  it('routes client/* to chief with escalation', async () => {
    const r = await routeClassifiedEmail(makeParams({ label: 'client/active' }));
    expect(r).toEqual({ routed: true, action: 'ipc_written', target: 'chief' });
    const [group, payload] = mockWrite.mock.calls[0];
    expect(group).toBe('chief');
    expect(payload.targetGroupFolder).toBe('chief');
    expect(payload.text).toContain('Reason: host-router escalation');
  });

  it('returns classify_only for procurement/* without writing', async () => {
    const r = await routeClassifiedEmail(makeParams({ label: 'procurement/rfp' }));
    expect(r).toEqual({ routed: true, action: 'classify_only', target: 'none' });
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('routes financial/bill to contador via mailman', async () => {
    const r = await routeClassifiedEmail(makeParams({ label: 'financial/bill' }));
    expect(r).toEqual({ routed: true, action: 'ipc_written', target: 'mailman' });
    const text: string = mockWrite.mock.calls[0][1].text;
    expect(text).toContain('[HANDOFF: mailman\u2192contador]');
    expect(text).toContain('[TYPE: invoice]');
  });

  it('routes financial/refund to chief for review', async () => {
    const r = await routeClassifiedEmail(makeParams({ label: 'financial/refund' }));
    expect(r).toEqual({ routed: true, action: 'ipc_written', target: 'chief' });
    const text: string = mockWrite.mock.calls[0][1].text;
    expect(text).toContain('Reason: refund review');
  });

  it('routes meeting-assets/* to archivarista via mailman', async () => {
    const r = await routeClassifiedEmail(makeParams({ label: 'meeting-assets/recording' }));
    expect(r).toEqual({ routed: true, action: 'ipc_written', target: 'mailman' });
    const text: string = mockWrite.mock.calls[0][1].text;
    expect(text).toContain('[HANDOFF: mailman\u2192archivarista]');
    expect(text).toContain('[TYPE: meeting-assets]');
  });

  it('routes legal/* to chief', async () => {
    const r = await routeClassifiedEmail(makeParams({ label: 'legal/contract' }));
    expect(r).toEqual({ routed: true, action: 'ipc_written', target: 'chief' });
    expect(mockWrite.mock.calls[0][1].text).toContain('Reason: legal/contract review');
  });

  it('routes personal to chief', async () => {
    const r = await routeClassifiedEmail(makeParams({ label: 'personal' }));
    expect(r).toEqual({ routed: true, action: 'ipc_written', target: 'chief' });
    expect(mockWrite.mock.calls[0][1].text).toContain('Reason: personal review');
  });

  it('routes other to chief', async () => {
    const r = await routeClassifiedEmail(makeParams({ label: 'other' }));
    expect(r).toEqual({ routed: true, action: 'ipc_written', target: 'chief' });
    expect(mockWrite.mock.calls[0][1].text).toContain('Reason: other review');
  });

  it('falls back to chief for unrecognized labels', async () => {
    const r = await routeClassifiedEmail(makeParams({ label: 'xyzzy/unknown' }));
    expect(r.routed).toBe(true);
    expect(r.action).toBe('ipc_written');
    expect(r.target).toBe('chief');
    expect(r.reason).toBe('unrecognized label prefix');
    expect(mockWrite).toHaveBeenCalledWith('chief', expect.objectContaining({ type: 'message' }));
  });

  // ══════════════════════════════════════════════════════════════════
  // 6. Error handling
  // ══════════════════════════════════════════════════════════════════

  it('returns error when writeHostMessage throws', async () => {
    mockWrite.mockImplementation(() => { throw new Error('disk full'); });
    const r = await routeClassifiedEmail(makeParams({ label: 'client/active' }));
    expect(r).toEqual({ routed: false, action: 'error', reason: 'disk full' });
  });

  // ══════════════════════════════════════════════════════════════════
  // 7. Payload structure
  // ══════════════════════════════════════════════════════════════════

  it('always passes chatJid host-router in payload', async () => {
    mockWrite.mockClear();
    await routeClassifiedEmail(makeParams({ label: 'lead/inquiry' }));
    await routeClassifiedEmail(makeParams({ label: 'client/active' }));
    await routeClassifiedEmail(makeParams({ label: 'financial/bill' }));
    await routeClassifiedEmail(makeParams({ label: 'meeting-assets/zoom' }));
    await routeClassifiedEmail(makeParams({ label: 'legal/nda' }));
    await routeClassifiedEmail(makeParams({ label: 'unknown-thing' }));

    expect(mockWrite.mock.calls.length).toBeGreaterThanOrEqual(6);
    for (const [, payload] of mockWrite.mock.calls) {
      expect(payload.chatJid).toBe('host-router');
    }
  });

  // ══════════════════════════════════════════════════════════════════
  // 8. Production MrGru/ namespaced labels
  // ══════════════════════════════════════════════════════════════════

  describe('MrGru/ namespaced labels (production format)', () => {
    beforeEach(() => { mockWrite.mockReset(); mockMatch.mockReset(); mockMatch.mockResolvedValue(null); });

    it('routes MrGru/client/active to chief', async () => {
      const r = await routeClassifiedEmail(makeParams({ label: 'MrGru/client/active' }));
      expect(r).toEqual({ routed: true, action: 'ipc_written', target: 'chief' });
      expect(mockWrite.mock.calls[0][1].text).toContain('Reason: host-router escalation');
    });

    it('routes MrGru/lead/inquiry with no match to inbox', async () => {
      const r = await routeClassifiedEmail(makeParams({ label: 'MrGru/lead/inquiry' }));
      expect(r).toEqual({ routed: true, action: 'ipc_written', target: 'mailman' });
      expect(mockWrite.mock.calls[0][1].text).toContain('[HANDOFF: mailman\u2192inbox]');
    });

    it('routes MrGru/lead/reply with match using v2 fields', async () => {
      mockMatch.mockResolvedValue(negotiatingMatch);
      const r = await routeClassifiedEmail(makeParams({ label: 'MrGru/lead/reply' }));
      expect(r).toEqual({ routed: true, action: 'ipc_written', target: 'mailman' });
      const text: string = mockWrite.mock.calls[0][1].text;
      expect(text).toContain('Entry ID: 5');
      expect(text).toContain('Party ID: 10012');
      expect(text).toContain('Program: coaching-inquiry');
    });

    it('routes MrGru/procurement/rfp as classify_only', async () => {
      const r = await routeClassifiedEmail(makeParams({ label: 'MrGru/procurement/rfp' }));
      expect(r).toEqual({ routed: true, action: 'classify_only', target: 'none' });
      expect(mockWrite).not.toHaveBeenCalled();
    });

    it('routes MrGru/financial/bill to contador', async () => {
      const r = await routeClassifiedEmail(makeParams({ label: 'MrGru/financial/bill' }));
      expect(r).toEqual({ routed: true, action: 'ipc_written', target: 'mailman' });
      expect(mockWrite.mock.calls[0][1].text).toContain('[HANDOFF: mailman\u2192contador]');
    });

    it('routes MrGru/meeting-assets/recording to archivarista', async () => {
      const r = await routeClassifiedEmail(makeParams({ label: 'MrGru/meeting-assets/recording' }));
      expect(r).toEqual({ routed: true, action: 'ipc_written', target: 'mailman' });
      expect(mockWrite.mock.calls[0][1].text).toContain('[HANDOFF: mailman\u2192archivarista]');
    });

    it('routes MrGru/legal/contract to chief', async () => {
      const r = await routeClassifiedEmail(makeParams({ label: 'MrGru/legal/contract' }));
      expect(r).toEqual({ routed: true, action: 'ipc_written', target: 'chief' });
      expect(mockWrite.mock.calls[0][1].text).toContain('Reason: legal/contract review');
    });

    it('routes MrGru/notification/system as unrecognized → chief', async () => {
      const r = await routeClassifiedEmail(makeParams({ label: 'MrGru/notification/system' }));
      expect(r.routed).toBe(true);
      expect(r.target).toBe('chief');
      expect(r.reason).toBe('unrecognized label prefix');
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // 9. Unicode arrow compliance
  // ══════════════════════════════════════════════════════════════════

  it('uses Unicode arrow U+2192 in all HANDOFF markers', async () => {
    mockWrite.mockClear();
    await routeClassifiedEmail(makeParams({ label: 'lead/inquiry' }));
    mockMatch.mockResolvedValue(proposalMatch);
    await routeClassifiedEmail(makeParams({ label: 'lead/reply' }));
    await routeClassifiedEmail(makeParams({ label: 'financial/bill' }));
    await routeClassifiedEmail(makeParams({ label: 'meeting-assets/notes' }));

    const handoffPattern = /\[HANDOFF: \w+→\w+\]/;
    const asciiArrow = /\[HANDOFF: \w+->\w+\]/;

    for (const [, payload] of mockWrite.mock.calls) {
      const text: string = payload.text;
      if (text.includes('[HANDOFF:')) {
        expect(text).toMatch(handoffPattern);
        expect(text).not.toMatch(asciiArrow);
      }
    }
  });

  // ══════════════════════════════════════════════════════════════════
  // 10. Production-like end-to-end scenarios
  // ══════════════════════════════════════════════════════════════════

  describe('production scenarios', () => {
    it('Scenario: new contact form lead (no match) → inbox handoff with email context', async () => {
      const p = makeParams({
        label: 'MrGru/lead/inquiry',
        senderEmail: 'slfairch@outlook.com',
        senderName: 'Seana Fairchild',
        subject: 'ACC vs Professional Coach Program',
        body: 'Hi, I am interested in getting certified. Can you tell me the difference between ACC and PCC programs?',
        threadId: 'thr-abc123',
        messageId: 'msg-def456',
      });
      const r = await routeClassifiedEmail(p);
      expect(r).toEqual({ routed: true, action: 'ipc_written', target: 'mailman' });
      const text: string = mockWrite.mock.calls[0][1].text;
      expect(text).toContain('[HANDOFF: mailman\u2192inbox]');
      expect(text).toContain('From: Seana Fairchild <slfairch@outlook.com>');
      expect(text).toContain('Subject: ACC vs Professional Coach Program');
      expect(text).toContain('difference between ACC and PCC');
    });

    it('Scenario: known lead replies to proposal email → sales handoff with v2 fields', async () => {
      mockMatch.mockResolvedValue({
        pipeline_entry_id: 50,
        party_id: 10099,
        display_name: 'Seana Fairchild',
        stage: 'proposal',
        program_slug: 'certification-inquiry',
        last_interaction_at: '2026-04-11T10:00:00+00:00',
        thread_id: '1a2b3c4d5e6f7890',
      });
      const p = makeParams({
        label: 'MrGru/lead/reply',
        senderEmail: 'slfairch@outlook.com',
        senderName: 'Seana Fairchild',
        subject: 'Re: ACC vs Professional Coach Program - Tandem Coaching',
        body: 'Thanks for the information! What are the upcoming start dates?',
      });
      const r = await routeClassifiedEmail(p);
      expect(r).toEqual({ routed: true, action: 'ipc_written', target: 'mailman' });
      const text: string = mockWrite.mock.calls[0][1].text;
      expect(text).toContain('[HANDOFF: mailman\u2192sales]');
      expect(text).toContain('[SOURCE: email-reply]');
      expect(text).toContain('Entry ID: 50');
      expect(text).toContain('Party ID: 10099');
      expect(text).toContain('Lead: Seana Fairchild (proposal)');
      expect(text).toContain('Program: certification-inquiry');
      expect(text).toContain('Thread-ID: 1a2b3c4d5e6f7890');
      expect(text).toContain('From: slfairch@outlook.com');
      // No legacy fields
      expect(text).not.toContain('Lead ID:');
      expect(text).not.toContain('Follow-ups:');
    });

    it('Scenario: lead match fails silently → falls back to inbox', async () => {
      mockMatch.mockRejectedValue(new Error('pg pool exhausted'));
      // matchLead swallows errors and returns null → routes to inbox
      // But since matchLead catches internally, we mock it returning null
      mockMatch.mockResolvedValue(null);
      const r = await routeClassifiedEmail(makeParams({ label: 'lead/inquiry' }));
      expect(r).toEqual({ routed: true, action: 'ipc_written', target: 'mailman' });
      expect(mockWrite.mock.calls[0][1].text).toContain('[HANDOFF: mailman\u2192inbox]');
    });

    it('Scenario: multi-slash label (MrGru/lead/inquiry) strips namespace correctly', async () => {
      mockMatch.mockResolvedValue(proposalMatch);
      await routeClassifiedEmail(makeParams({ label: 'MrGru/lead/inquiry' }));
      // Should hit lead route, not unrecognized
      const text: string = mockWrite.mock.calls[0][1].text;
      expect(text).toContain('[HANDOFF: mailman\u2192sales]');
    });
  });
});
