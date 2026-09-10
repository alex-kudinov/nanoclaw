export function runEnrollmentStoreDisposableProof(
  mode?: 'store' | 'admission',
): {
  ok: boolean;
  worker: Record<string, unknown>;
  dropped: boolean;
  emptyRollbackReapply: boolean;
};
