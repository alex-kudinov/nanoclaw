import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const readSalesFile = (name: string): string =>
  readFileSync(resolve(process.cwd(), 'groups', 'sales', name), 'utf8');

const role = readSalesFile('CLAUDE.md');
const mainContext = readSalesFile('CLAUDE-MAIN.md');
const workflows = readSalesFile('WORKFLOWS.md');
const guidelines = readSalesFile('EMAIL-RESPONSE-GUIDELINES.md');
const contract = `${role}\n${mainContext}\n${workflows}\n${guidelines}`;
const normalizeWhitespace = (text: string): string =>
  text.replace(/\s+/g, ' ').trim();
const normalizedContract = normalizeWhitespace(contract);
const normalizedContractLower = normalizedContract.toLowerCase();
const normalizedGuidelines = normalizeWhitespace(guidelines);
type EvalCase = {
  id: string;
  relationshipEvidence: string;
  currentMessage: string;
  expectedRoute: string;
  expectedConfidence: string;
  answerability: string;
  routeBasis?: string;
  draftExpected: boolean;
  mustInclude: string[];
  mustNotInclude: string[];
};
const evalCases = JSON.parse(
  readFileSync(
    resolve(process.cwd(), 'evals', 'sales', 'request-first-cases.json'),
    'utf8',
  ),
) as EvalCase[];

describe('Sales request-first prompt contract', () => {
  it('uses the audited decision precedence and all seven routes', () => {
    expect(contract).toContain(
      'RELATIONSHIP → CURRENT MESSAGE → ANSWERABILITY → ROUTE/BUDGET → PATH NON-BINDING',
    );
    for (const route of [
      'SERVICE',
      'TRANSACT',
      'ANSWER',
      'ORIENT',
      'CLARIFY',
      'HUMAN',
      'DECLINE',
    ]) {
      expect(workflows, route).toMatch(new RegExp(`\`${route}\``));
    }
  });

  it('keeps client support pipeline-free and uses least-privilege entry creation only for genuine sales work', () => {
    expect(role).toContain('[SOURCE: email-active-client]');
    expect(role).toContain('no Entry ID or pipeline mutation is required');
    expect(workflows).toContain('## Client Support Review (no pipeline entry)');
    expect(workflows).toContain('[CLIENT SUPPORT REVIEW]');
    expect(workflows).toContain(
      'Do not add `Lead #`, `Entry ID`, `PROGRAM MATCH`, `ESTIMATED DEAL`, or a sales',
    );
    expect(workflows).toContain(
      'The host already recognizes `[CLIENT SUPPORT REVIEW]`',
    );
    expect(workflows).toContain(
      'If it is a `[CLIENT SUPPORT REVIEW]`, do not query or mutate pipeline state.',
    );
    expect(role).toContain(
      'For a Client Support Review, skip this step entirely',
    );
    expect(workflows).toContain(
      'Party ID: {party_id when already resolved — otherwise omit the entire line for CLIENT SUPPORT REVIEW}',
    );
    expect(role).toContain('Client Support Review with no Party ID');
    expect(workflows).toContain(
      'SELECT pipeline_entry_id FROM business_v2.v_active_pipeline',
    );
    expect(workflows).toContain('business_v2.fn_create_pipeline_entry');
    expect(workflows).toContain(
      'Direct `SELECT`, `INSERT`, `UPDATE`, or `DELETE` against',
    );
    expect(workflows).not.toContain('INSERT INTO business_v2.pipeline_entries');
    expect(workflows).not.toContain(
      'SELECT id FROM business_v2.pipeline_entries WHERE party_id',
    );
  });

  it('fails closed on relationship evidence and unsupported answers', () => {
    expect(normalizedContract).toContain(
      'only when its own evidence predates the current inbound',
    );
    expect(contract).toContain(
      '`LOW` confidence and route `HUMAN` both prohibit a customer-facing draft.',
    );
    expect(workflows).toContain('ABSTAINED:');
    expect(workflows).toContain('NO CUSTOMER DRAFT — HUMAN INPUT REQUIRED:');
    expect(workflows).toContain('[SALES ESCALATION] Lead #{id}');
    expect(contract).not.toContain('v_party_contact_card');
    expect(contract).not.toContain('Returning lead — previously inquired on');
    // Intentional broad guard: price tables in any Sales prompt can leak into
    // ORIENT. A future legitimate table must make its route gate explicit.
    expect(contract).not.toContain('| Price');
  });

  it('makes commercial material conditional instead of card or email boilerplate', () => {
    expect(workflows).toContain(
      'PROGRAM MATCH: {include if and only if Route is TRANSACT',
    );
    expect(workflows).toContain(
      'ESTIMATED DEAL: ~${total} {include if and only if Route is TRANSACT',
    );
    expect(workflows).toContain('Route-Basis:');
    expect(workflows).toContain('a verbatim span of at most 15 words');
    expect(workflows).not.toContain('RECOMMENDED NEXT STEP:');
    expect(guidelines).toContain(
      'Mention pricing only when it is explicitly requested and the card carries a valid current-message `Route-Basis` for `TRANSACT`.',
    );
    expect(contract).not.toContain(
      'Mention both pricing options: full program price and pay-as-you-go module pricing.',
    );
    expect(contract).not.toContain('Encourage early registration');
    expect(normalizedGuidelines).toContain(
      '`ORIENT` may name a supported program but must not include a sign-up link.',
    );
    expect(normalizedGuidelines).toContain(
      '`ORIENT` must not use it as a sales CTA.',
    );
  });

  it('keeps browsing-path data non-binding and narrowly bounds source context', () => {
    expect(contract).toContain('website-path/browsing signals have zero');
    expect(normalizedContractLower).toContain(
      'do not run a chaos path lookup while drafting',
    );
    expect(normalizedContract).toContain(
      'You may use it only to resolve an explicit page-relative reference',
    );
    expect(normalizedContract).toContain(
      'It cannot establish relationship, unstated purchase intent, answerability, a commercial route, a fact, recommendation, price, cohort, or CTA.',
    );
    expect(workflows).not.toContain('chaos_intent()');
    expect(contract).not.toContain(
      'LEAD with a confident program recommendation',
    );
  });

  it('uses visible recipients as bounded context rather than automatic reply-all authority', () => {
    expect(workflows).toContain('## Visible recipients and bounded reply-all');
    expect(workflows).toContain('`Reply-All-Candidates` list');
    expect(workflows).toContain(
      'If no explicit intent exists, omit `Cc:` even when',
    );
    expect(workflows).toContain(
      'must be a bare address from the host-supplied',
    );
    expect(normalizedContract).toContain(
      'BCC is intentionally unavailable and must never be requested, inferred, or placed on a card.',
    );
    expect(normalizedContractLower).toContain('never exceed ten cc recipients');
    expect(role).toContain('carry it across EVERY round');
    expect(role).toContain(
      '`Visible-To`, `Visible-Cc`, `Reply-All-Candidates`, and `Recipient-Context`',
    );
  });

  it('requires an ask-to-content audit and canonical Sales headings', () => {
    expect(workflows).toContain('Every explicit ask is answered, clarified');
    expect(workflows).toContain('ADDED BEYOND ASK:');
    expect(workflows).toContain(
      'The only legal Sales draft headings are the exact standalone lines',
    );
    expect(workflows).toContain('`DRAFT RESPONSE TO LEAD:`');
    expect(workflows).toContain('`DRAFT FOLLOW-UP:`');
  });

  it('does not invent new value in scheduled follow-ups', () => {
    expect(workflows).toContain(
      'Do not manufacture "new value" by introducing an upcoming cohort',
    );
    expect(workflows).not.toContain(
      'Add new value: mention an upcoming cohort, a free module',
    );
  });

  it('treats explicit follow-up rejection as terminal without equating silence to rejection', () => {
    expect(normalizedContract).toContain(
      'an explicit named-human rejection (including "decline" or "drop") is terminal',
    );
    expect(normalizedContract).toContain(
      'Silence, an ignored card, or approval expiry is not rejection',
    );
    expect(normalizeWhitespace(mainContext)).toContain(
      'do not revise, repost, or regenerate it',
    );
    expect(normalizeWhitespace(mainContext)).toContain(
      'The host owns the durable decision receipt and the verified pipeline transition to `lost`',
    );
  });

  it('keeps an adversarial route and content-budget evaluation matrix', () => {
    expect(evalCases.length).toBeGreaterThanOrEqual(9);
    expect(new Set(evalCases.map((testCase) => testCase.id)).size).toBe(
      evalCases.length,
    );
    expect(
      new Set(evalCases.map((testCase) => testCase.expectedRoute)),
    ).toEqual(
      new Set([
        'SERVICE',
        'TRANSACT',
        'ANSWER',
        'ORIENT',
        'CLARIFY',
        'HUMAN',
        'DECLINE',
      ]),
    );
    for (const testCase of evalCases) {
      expect(['HIGH', 'MEDIUM', 'LOW'], testCase.id).toContain(
        testCase.expectedConfidence,
      );
      expect(['YES', 'PARTIAL', 'NO'], testCase.id).toContain(
        testCase.answerability,
      );
      expect(testCase.mustInclude.length, testCase.id).toBeGreaterThan(0);
      expect(testCase.mustNotInclude.length, testCase.id).toBeGreaterThan(0);
      expect(testCase.relationshipEvidence.trim(), testCase.id).not.toBe('');
      expect(testCase.currentMessage.trim(), testCase.id).not.toBe('');
      if (testCase.expectedRoute === 'HUMAN') {
        expect(testCase.draftExpected, testCase.id).toBe(false);
      }
      if (testCase.expectedRoute === 'TRANSACT') {
        expect(testCase.routeBasis, testCase.id).toBeTruthy();
        expect(
          testCase.routeBasis!.split(/\s+/).length,
          testCase.id,
        ).toBeLessThanOrEqual(15);
        expect(testCase.currentMessage, testCase.id).toContain(
          testCase.routeBasis!,
        );
      } else {
        expect(testCase.routeBasis, testCase.id).toBeUndefined();
      }
    }
  });
});
