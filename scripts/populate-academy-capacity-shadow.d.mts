export function sha256(value: unknown): string;
export function manifestSha256(manifest: unknown): string;
export function recordKey(participant: Record<string, unknown>): string;
export function validateAcademyCapacityShadowManifest(
  manifest: unknown,
): string[];
export function renderAcademyCapacityShadowSql(manifest: unknown): string;
export function runAcademyCapacityShadowPopulation(options: {
  manifest: string;
  database: string;
  psql: string;
  apply: boolean;
  confirmHost: string;
  expectedManifestSha256: string;
}): Record<string, unknown>;
