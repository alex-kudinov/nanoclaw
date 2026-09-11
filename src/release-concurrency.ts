type JsonObject = Record<string, unknown>;

export interface ReleaseConcurrencyReason {
  code:
    | 'health_shape'
    | 'queue_shape'
    | 'queue_active_count_invalid'
    | 'runtime_active_count_invalid'
    | 'waiting_groups_invalid'
    | 'waiting_work_present'
    | 'group_states_invalid'
    | 'queue_active_count_mismatch'
    | 'runtime_active_count_mismatch'
    | 'active_container_identity_missing'
    | 'active_container_kind_unknown'
    | 'task_container_active'
    | 'pending_task_work'
    | 'active_host_jobs_invalid'
    | 'host_job_active'
    | 'outgoing_queue_invalid'
    | 'outgoing_delivery_pending';
  count: number;
}

export interface ReleaseConcurrencyAssessment {
  safeForRestart: boolean;
  activeContainers: number | null;
  adoptableMessageContainers: number;
  blockingTaskContainers: number;
  waitingGroups: number | null;
  outgoingQueueDepth: number | null;
  activeHostJobs: number | null;
  reasons: ReleaseConcurrencyReason[];
}

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0
    ? Number(value)
    : null;
}

function reason(
  reasons: ReleaseConcurrencyReason[],
  code: ReleaseConcurrencyReason['code'],
  count = 1,
): void {
  reasons.push({ code, count });
}

/**
 * Classify only restart safety. Conversational containers are detached and
 * sidecar-adopted by the next daemon, so they are not a global drain gate.
 * In-process task closures, waiting queue entries, accounting mismatches, and
 * pending outbound delivery remain fail-closed.
 */
export function assessReleaseConcurrency(
  healthValue: unknown,
): ReleaseConcurrencyAssessment {
  const reasons: ReleaseConcurrencyReason[] = [];
  const health = object(healthValue);
  if (!health) {
    reason(reasons, 'health_shape');
    return {
      safeForRestart: false,
      activeContainers: null,
      adoptableMessageContainers: 0,
      blockingTaskContainers: 0,
      waitingGroups: null,
      outgoingQueueDepth: null,
      activeHostJobs: null,
      reasons,
    };
  }

  const activeContainers = nonNegativeInteger(health.activeContainers);
  if (activeContainers === null)
    reason(reasons, 'runtime_active_count_invalid');

  const queue = object(health.queue);
  if (!queue) reason(reasons, 'queue_shape');
  const activeCount = nonNegativeInteger(queue?.activeCount);
  if (activeCount === null) reason(reasons, 'queue_active_count_invalid');

  const waiting = queue?.waitingGroups;
  const waitingGroups = Array.isArray(waiting) ? waiting.length : null;
  if (waitingGroups === null) reason(reasons, 'waiting_groups_invalid');
  else if (waitingGroups > 0)
    reason(reasons, 'waiting_work_present', waitingGroups);

  const groupStates = object(queue?.groupStates);
  if (!groupStates) reason(reasons, 'group_states_invalid');
  let activeStates = 0;
  let adoptableMessageContainers = 0;
  let blockingTaskContainers = 0;
  let missingIdentity = 0;
  let unknownKind = 0;
  let pendingTaskWork = 0;
  if (groupStates) {
    for (const rawState of Object.values(groupStates)) {
      const state = object(rawState);
      if (!state || state.active !== true) continue;
      activeStates += 1;
      if (typeof state.containerName !== 'string' || !state.containerName) {
        missingIdentity += 1;
      }
      if (typeof state.isTaskContainer !== 'boolean') {
        unknownKind += 1;
      } else if (state.isTaskContainer) {
        blockingTaskContainers += 1;
      } else {
        adoptableMessageContainers += 1;
      }
      const pendingTasks = nonNegativeInteger(state.pendingTaskCount);
      if (pendingTasks === null || pendingTasks > 0) {
        pendingTaskWork += pendingTasks ?? 1;
      }
    }
  }
  if (missingIdentity > 0)
    reason(reasons, 'active_container_identity_missing', missingIdentity);
  if (unknownKind > 0)
    reason(reasons, 'active_container_kind_unknown', unknownKind);
  if (blockingTaskContainers > 0)
    reason(reasons, 'task_container_active', blockingTaskContainers);
  if (pendingTaskWork > 0)
    reason(reasons, 'pending_task_work', pendingTaskWork);
  if (activeCount !== null && activeCount !== activeStates)
    reason(reasons, 'queue_active_count_mismatch');
  if (activeContainers !== null && activeContainers !== activeStates)
    reason(reasons, 'runtime_active_count_mismatch');

  const channels = object(health.channels);
  const slack = object(channels?.slack);
  const diagnostics = object(slack?.diagnostics);
  const outgoingQueueDepth = nonNegativeInteger(
    diagnostics?.outgoingQueueDepth,
  );
  if (outgoingQueueDepth === null) reason(reasons, 'outgoing_queue_invalid');
  else if (outgoingQueueDepth > 0)
    reason(reasons, 'outgoing_delivery_pending', outgoingQueueDepth);

  const releaseActivation = object(health.releaseActivation);
  const activeHostJobs = releaseActivation
    ? nonNegativeInteger(releaseActivation.activeHostJobs)
    : null;
  if (releaseActivation && activeHostJobs === null)
    reason(reasons, 'active_host_jobs_invalid');
  else if (activeHostJobs !== null && activeHostJobs > 0)
    reason(reasons, 'host_job_active', activeHostJobs);

  return {
    safeForRestart: reasons.length === 0,
    activeContainers,
    adoptableMessageContainers,
    blockingTaskContainers,
    waitingGroups,
    outgoingQueueDepth,
    activeHostJobs,
    reasons,
  };
}

export function taskAdmissionBarrierSupported(healthValue: unknown): boolean {
  const health = object(healthValue);
  const releaseActivation = object(health?.releaseActivation);
  return (
    typeof releaseActivation?.taskAdmissionPaused === 'boolean' &&
    typeof releaseActivation.valid === 'boolean' &&
    Object.prototype.hasOwnProperty.call(
      releaseActivation,
      'expectedCurrentCommit',
    ) &&
    nonNegativeInteger(releaseActivation.activeHostJobs) !== null
  );
}

export function assertTaskAdmissionBarrierObserved(
  healthValue: unknown,
  expectedCurrentCommit: string,
): void {
  const health = object(healthValue);
  const releaseActivation = object(health?.releaseActivation);
  if (
    !taskAdmissionBarrierSupported(healthValue) ||
    releaseActivation?.taskAdmissionPaused !== true ||
    releaseActivation.valid !== true ||
    releaseActivation.expectedCurrentCommit !== expectedCurrentCommit ||
    releaseActivation.activeHostJobs !== 0
  ) {
    throw new Error(
      'release task-admission barrier was not validly observed by the live daemon',
    );
  }
}

export function assertReleaseConcurrencySafe(health: unknown): void {
  const assessment = assessReleaseConcurrency(health);
  if (!assessment.safeForRestart) {
    const detail = assessment.reasons
      .map((value) => `${value.code}:${value.count}`)
      .join(',');
    throw new Error(`release restart concurrency gate failed: ${detail}`);
  }
}
