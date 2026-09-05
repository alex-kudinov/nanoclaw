export const defaultContractPath: string;
export const defaultSchemaPath: string;
export function validateStudentEnrollmentFoundation(contract: any): {
  ok: boolean;
  findings: string[];
  summary: Record<string, number>;
};
export function loadAndValidateStudentEnrollmentFoundation(
  contractPath?: string,
  schemaPath?: string,
): { ok: boolean; findings: string[]; summary: Record<string, number> };
