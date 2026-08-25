import {
  RelationshipContextContractError,
  type AdapterManifestV1,
  type FactCatalogEntry,
  type PersonEnrichmentAdapterV1,
  sha256Json,
  validateFactCatalogEntry,
  validateManifest,
} from './relationship-context-contract.js';

export interface AdapterRegistration {
  manifest: AdapterManifestV1;
  manifestSha256: string;
  enabled: false;
  conformanceStatus: 'pending' | 'passed' | 'failed';
  circuitStatus: 'closed' | 'open';
  failureCount: number;
  lastErrorCode: string | null;
}

export class RelationshipContextRegistry {
  private readonly adapters = new Map<
    string,
    { adapter: PersonEnrichmentAdapterV1; registration: AdapterRegistration }
  >();
  private readonly sourceScopes = new Map<string, string>();
  private readonly facts = new Map<string, FactCatalogEntry>();

  registerFact(input: FactCatalogEntry): FactCatalogEntry {
    const entry = validateFactCatalogEntry(input);
    const existing = this.facts.get(entry.factType);
    if (existing && sha256Json(existing) !== sha256Json(entry)) {
      throw new RelationshipContextContractError(
        'relationship_context_fact_catalog_conflict',
      );
    }
    this.facts.set(entry.factType, entry);
    return entry;
  }

  registerAdapter(adapter: PersonEnrichmentAdapterV1): AdapterRegistration {
    const manifest = validateManifest(adapter.describe());
    if (this.adapters.has(manifest.adapterKey)) {
      throw new RelationshipContextContractError(
        'relationship_context_adapter_duplicate',
      );
    }
    for (const factType of manifest.factTypes) {
      if (!this.facts.has(factType)) {
        throw new RelationshipContextContractError(
          'relationship_context_adapter_fact_unregistered',
        );
      }
    }
    for (const scope of manifest.supportedScopes) {
      const key = `${manifest.sourceSystem}\0${scope}`;
      if (this.sourceScopes.has(key)) {
        throw new RelationshipContextContractError(
          'relationship_context_source_scope_duplicate',
        );
      }
    }
    const registration: AdapterRegistration = {
      manifest,
      manifestSha256: sha256Json(manifest),
      enabled: false,
      conformanceStatus: 'pending',
      circuitStatus: 'closed',
      failureCount: 0,
      lastErrorCode: null,
    };
    this.adapters.set(manifest.adapterKey, { adapter, registration });
    for (const scope of manifest.supportedScopes) {
      this.sourceScopes.set(
        `${manifest.sourceSystem}\0${scope}`,
        manifest.adapterKey,
      );
    }
    return structuredClone(registration);
  }

  markConformance(
    adapterKey: string,
    status: 'passed' | 'failed',
  ): AdapterRegistration {
    const current = this.requireAdapter(adapterKey);
    current.registration.conformanceStatus = status;
    return structuredClone(current.registration);
  }

  recordFailure(adapterKey: string, errorCode: string): AdapterRegistration {
    const current = this.requireAdapter(adapterKey);
    current.registration.failureCount += 1;
    current.registration.lastErrorCode = errorCode;
    if (current.registration.failureCount >= 3) {
      current.registration.circuitStatus = 'open';
    }
    return structuredClone(current.registration);
  }

  recordRecovery(adapterKey: string): AdapterRegistration {
    const current = this.requireAdapter(adapterKey);
    current.registration.failureCount = 0;
    current.registration.lastErrorCode = null;
    current.registration.circuitStatus = 'closed';
    return structuredClone(current.registration);
  }

  adapter(adapterKey: string): PersonEnrichmentAdapterV1 {
    const current = this.requireAdapter(adapterKey);
    if (
      current.registration.conformanceStatus !== 'passed' ||
      current.registration.circuitStatus !== 'closed'
    ) {
      throw new RelationshipContextContractError(
        'relationship_context_adapter_unavailable',
      );
    }
    return current.adapter;
  }

  manifest(adapterKey: string): AdapterManifestV1 {
    return structuredClone(
      this.requireAdapter(adapterKey).registration.manifest,
    );
  }

  factCatalog(): ReadonlyMap<string, FactCatalogEntry> {
    return new Map(
      [...this.facts.entries()].map(([key, value]) => [
        key,
        structuredClone(value),
      ]),
    );
  }

  registrations(): AdapterRegistration[] {
    return [...this.adapters.values()].map(({ registration }) =>
      structuredClone(registration),
    );
  }

  private requireAdapter(adapterKey: string): {
    adapter: PersonEnrichmentAdapterV1;
    registration: AdapterRegistration;
  } {
    const current = this.adapters.get(adapterKey);
    if (!current) {
      throw new RelationshipContextContractError(
        'relationship_context_adapter_unknown',
      );
    }
    return current;
  }
}
