export function buildAcademyCapacityShadowManifest(input: {
  accRows: Array<Record<string, unknown>>;
  mcsRows: Array<Record<string, unknown>>;
  allowCreatePartySha256: string[];
  heldFundingSha256: string;
  aliasSha256: string;
}): Record<string, unknown>;
export function writePrivateAcademyCapacityShadowManifest(options: {
  accRoster: string;
  mcsRoster: string;
  output: string;
  allowCreatePartySha256: string[];
  heldFundingSha256: string;
  aliasSha256: string;
}): Record<string, unknown>;
