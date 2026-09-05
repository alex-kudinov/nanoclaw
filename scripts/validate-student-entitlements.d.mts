export interface StudentEntitlementValidationSummary {
  components: number;
  bundles: number;
  offers: number;
  conflicts: number;
  unresolvedComponents: number;
  provisionalComponents: number;
  openQuestions: number;
}

export interface StudentEntitlementValidationResult {
  ok: boolean;
  findings: string[];
  summary: StudentEntitlementValidationSummary;
}

export const defaultCatalogPath: string;
export const defaultSchemaPath: string;

export function validateStudentEntitlementCatalog(
  catalog: unknown,
): StudentEntitlementValidationResult;

export function loadAndValidateStudentEntitlementCatalog(
  catalogPath?: string,
): StudentEntitlementValidationResult;
