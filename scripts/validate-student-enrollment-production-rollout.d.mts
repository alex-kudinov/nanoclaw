export const defaultPacketPath: string;
export const defaultSchemaPath: string;
export function studentEnrollmentProductionRolloutSafetyHash(
  packet: unknown,
): string;
export function validateStudentEnrollmentProductionRollout(
  packet: unknown,
  schema: unknown,
  options?: { root?: string; verifyFiles?: boolean },
): string[];
