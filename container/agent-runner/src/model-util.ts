/**
 * Model resolution + token-usage log formatting for the agent runner.
 * Kept in a separate module so they are unit-testable without importing
 * index.ts (whose top-level main() would run on import).
 */

// Resolve the model passed to `claude --model`. Defaults to sonnet when the
// host did not specify one.
export function resolveModel(model: string | undefined): string {
  return model ?? 'sonnet';
}

// Format the per-turn token-usage log line the host greps for measurement.
export function formatUsageLine(
  turnCount: number,
  model: string,
  usage: Record<string, unknown>,
  numTurns: number,
): string {
  return (
    'event=agent.usage turn=' + turnCount +
    ' model=' + model +
    ' input_tokens=' + (Number(usage.input_tokens) || 0) +
    ' output_tokens=' + (Number(usage.output_tokens) || 0) +
    ' num_turns=' + numTurns
  );
}
