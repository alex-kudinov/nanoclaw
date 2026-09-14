export class IdentityControlPlaneError extends Error {
  constructor(
    readonly code: string,
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(code);
    this.name = 'IdentityControlPlaneError';
  }
}

export function invariant(
  condition: unknown,
  code: string,
  details: Readonly<Record<string, unknown>> = {},
): asserts condition {
  if (!condition) throw new IdentityControlPlaneError(code, details);
}
