export const defaultReportPath: string;
export const defaultSchemaPath: string;
export const defaultCorrectionPath: string;
export const defaultCorrectionSchemaPath: string;
export const defaultResolutionPath: string;
export const defaultResolutionSchemaPath: string;
export function validateJsonSchemaDocument(
  schema: unknown,
  value: unknown,
): string[];
export function validateAcademyCapacityReconciliation(
  report: unknown,
): string[];
export function validateAcademyCapacitySalesReconstruction(
  correction: unknown,
): string[];
export function validateAcademyCapacitySourceResolution(
  resolution: unknown,
): string[];
