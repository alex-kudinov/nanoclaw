import { describe, expect, it, vi } from 'vitest';

import {
  fetchPlutioEngagementSnapshot,
  normalizePlutioProjectStatus,
  plutioEngagementEnabled,
  plutioEngagementManifest,
  resetPlutioEngagementHealthForTests,
  runPlutioEngagementEnrichment,
} from './relationship-context-plutio-engagement.js';

const definitions = [
  'Number of Sessions',
  'Coach',
  'Session Duration',
  'Number of Sessions (Group)',
  'Mentor Coach',
  'Individual Mentor Hours',
  'Group Mentor Hours',
  'ICF Credential',
].map((title, index) => ({
  _id: `field_${index}`,
  entityType: 'project',
  title,
}));

function ok(value: unknown): string {
  return `OK ${JSON.stringify(value)}`;
}

describe('relationship context Plutio engagement adapter', () => {
  it('normalizes only the bounded project status vocabulary', () => {
    expect(normalizePlutioProjectStatus({ name: 'In progress' })).toEqual({
      status: 'in_progress',
      engagementState: 'current',
    });
    expect(normalizePlutioProjectStatus('Completed')).toEqual({
      status: 'completed',
      engagementState: 'historical',
    });
    expect(normalizePlutioProjectStatus({ title: 'New' })).toEqual({
      status: 'new',
      engagementState: 'planned',
    });
    expect(normalizePlutioProjectStatus('Cancelled')).toEqual({
      status: 'canceled',
      engagementState: 'canceled',
    });
    expect(normalizePlutioProjectStatus('Custom status')).toEqual({
      status: 'unknown',
      engagementState: 'unknown',
    });
  });

  it('reduces complete provider pages to exact links and controlled coaching codes', async () => {
    const callTool = vi.fn(async (script: string) => {
      if (script === 'list-custom-fields.sh') return ok(definitions);
      if (script === 'list-contracts.sh') {
        return ok([
          {
            _id: 'contract_1',
            status: 'signed',
            projectId: 'project_active',
            signatures: [{ name: 'discarded', signature: 'discarded' }],
          },
        ]);
      }
      if (script === 'list-projects.sh') {
        return ok([
          {
            _id: 'project_active',
            status: { name: 'In progress' },
            clients: [{ _id: 'person_1', entityType: 'person' }],
            customFields: [
              { _id: 'field_1', value: ['private-provider-value'] },
              { _id: 'unknown_field', value: ['ignored'] },
            ],
            name: 'discarded project name',
            descriptionPlain: 'discarded description',
            startDate: '2026-08-01T00:00:00Z',
            updatedAt: '2026-08-26T00:00:00Z',
          },
          {
            _id: 'project_company',
            status: 'Completed',
            clients: [{ _id: 'company_1', entityType: 'company' }],
            customFields: [{ _id: 'field_0', value: ['12'] }],
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-08-20T00:00:00Z',
          },
          {
            _id: 'project_unqualified',
            status: 'In progress',
            clients: [{ _id: 'person_2', entityType: 'person' }],
            customFields: [{ _id: 'unknown_field', value: ['anything'] }],
            updatedAt: '2026-08-20T00:00:00Z',
          },
        ]);
      }
      throw new Error('unexpected_tool');
    });

    const snapshot = await fetchPlutioEngagementSnapshot({
      observedAt: '2026-08-27T04:00:00Z',
      callTool,
    });
    expect(snapshot).toMatchObject({
      complete: true,
      projectsScanned: 3,
      contractsScanned: 1,
      customFieldsScanned: 8,
      signedContracts: 1,
      signedContractsWithoutProject: 0,
    });
    expect(snapshot.projects).toEqual([
      {
        id: 'project_active',
        status: 'in_progress',
        engagementState: 'current',
        clients: [{ id: 'person_1', entityType: 'person' }],
        coachingFieldCodes: ['coach'],
        signedContractCorroborated: true,
        effectiveAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-26T00:00:00.000Z',
      },
      {
        id: 'project_company',
        status: 'completed',
        engagementState: 'historical',
        clients: [{ id: 'company_1', entityType: 'company' }],
        coachingFieldCodes: ['session_count'],
        signedContractCorroborated: false,
        effectiveAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-08-20T00:00:00.000Z',
      },
      {
        id: 'project_unqualified',
        status: 'in_progress',
        engagementState: 'current',
        clients: [{ id: 'person_2', entityType: 'person' }],
        coachingFieldCodes: [],
        signedContractCorroborated: false,
        effectiveAt: null,
        updatedAt: '2026-08-20T00:00:00.000Z',
      },
    ]);
    expect(JSON.stringify(snapshot)).not.toMatch(
      /discarded project name|discarded description|private-provider-value|signature/i,
    );
  });

  it('fails closed on duplicate pagination IDs and incomplete custom-field authority', async () => {
    const duplicateProjects = Array.from({ length: 100 }, () => ({
      _id: 'same_project',
      status: 'New',
      clients: [],
      customFields: [],
      updatedAt: '2026-08-20T00:00:00Z',
    }));
    await expect(
      fetchPlutioEngagementSnapshot({
        observedAt: '2026-08-27T04:00:00Z',
        callTool: vi.fn(async (script: string) =>
          script === 'list-projects.sh'
            ? ok(duplicateProjects)
            : script === 'list-contracts.sh'
              ? ok([])
              : ok(definitions),
        ),
      }),
    ).rejects.toThrow('plutio_engagement_projects_invalid_duplicate_id');

    await expect(
      fetchPlutioEngagementSnapshot({
        observedAt: '2026-08-27T04:00:00Z',
        callTool: vi.fn(async (script: string) =>
          script === 'list-projects.sh'
            ? ok([])
            : script === 'list-contracts.sh'
              ? ok([])
              : ok(definitions.slice(0, 7)),
        ),
      }),
    ).rejects.toThrow('plutio_engagement_custom_field_catalog_incomplete');
  });

  it('double-reads and refuses a provider snapshot that changes during pagination', async () => {
    let projectRead = 0;
    await expect(
      fetchPlutioEngagementSnapshot({
        observedAt: '2026-08-27T04:00:00Z',
        callTool: vi.fn(async (script: string) => {
          if (script === 'list-custom-fields.sh') return ok(definitions);
          if (script === 'list-contracts.sh') return ok([]);
          projectRead += 1;
          return ok([
            {
              _id: 'project_drift',
              status: projectRead === 1 ? 'New' : 'In progress',
              clients: [],
              customFields: [],
              updatedAt: '2026-08-20T00:00:00Z',
            },
          ]);
        }),
      }),
    ).rejects.toThrow('plutio_engagement_snapshot_drift');
  });

  it('registers a default-off provider-neutral read manifest and degrades safely', async () => {
    expect(plutioEngagementEnabled({})).toBe(false);
    expect(
      plutioEngagementEnabled({
        RELATIONSHIP_CONTEXT_PLUTIO_ENGAGEMENT_ENABLED: '1',
      }),
    ).toBe(true);
    expect(plutioEngagementManifest()).toMatchObject({
      adapterKey: 'plutio_engagement_snapshot',
      sourceSystem: 'plutio',
      supportedScopes: ['primary-engagement'],
      externalReferenceTypes: ['person'],
      projectionTargets: ['relationship'],
      credentialHandle: 'plutio_read_only',
    });
    resetPlutioEngagementHealthForTests();
    const health = await runPlutioEngagementEnrichment({
      env: { RELATIONSHIP_CONTEXT_PLUTIO_ENGAGEMENT_ENABLED: '1' },
      nowMs: Date.parse('2026-08-27T04:00:00Z'),
      callTool: vi.fn(async () => {
        throw new Error('plutio_read_unavailable');
      }),
    });
    expect(health).toMatchObject({
      enabled: true,
      mode: 'read_only_snapshot',
      consumerEnabled: false,
      status: 'degraded',
      lastSuccessAt: null,
      result: null,
      errorCodes: ['plutio_read_unavailable'],
    });
  });
});
