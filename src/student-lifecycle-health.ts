import type { StudentLifecycleHealth } from './student-lifecycle-store.js';

export const STUDENT_LIFECYCLE_HEALTH_REFRESH_MS = 60_000;

export interface StudentLifecycleStoreHealthStatus {
  state: 'disabled' | 'pending' | 'healthy' | 'error';
  checkedAt: string | null;
  errorCode: 'store_unavailable' | null;
  metrics: StudentLifecycleHealth | null;
}

export class StudentLifecycleHealthMonitor {
  private status: StudentLifecycleStoreHealthStatus;

  constructor(
    private readonly enabled: boolean,
    private readonly readHealth: () => Promise<StudentLifecycleHealth>,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
    this.status = {
      state: enabled ? 'pending' : 'disabled',
      checkedAt: null,
      errorCode: null,
      metrics: null,
    };
  }

  getStatus(): StudentLifecycleStoreHealthStatus {
    return structuredClone(this.status);
  }

  async refresh(): Promise<StudentLifecycleStoreHealthStatus> {
    if (!this.enabled) return this.getStatus();
    const checkedAt = this.now();
    try {
      this.status = {
        state: 'healthy',
        checkedAt,
        errorCode: null,
        metrics: await this.readHealth(),
      };
    } catch {
      this.status = {
        state: 'error',
        checkedAt,
        errorCode: 'store_unavailable',
        metrics: null,
      };
    }
    return this.getStatus();
  }
}
