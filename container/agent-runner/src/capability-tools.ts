export const LEGACY_ALLOWED_TOOLS = [
  'Bash',
  'Read',
  'Write',
  'Edit',
  'Glob',
  'Grep',
  'WebSearch',
  'WebFetch',
  'Task',
  'TaskOutput',
  'TaskStop',
  'TeamCreate',
  'TeamDelete',
  'SendMessage',
  'TodoWrite',
  'ToolSearch',
  'Skill',
  'NotebookEdit',
  'mcp__nanoclaw__*',
] as const;

export interface RunnerCapabilityInput {
  enforced: boolean;
  fingerprint: string;
  claudeTools: string[];
  mcpTools: string[];
}

export function buildAllowedTools(
  capability?: RunnerCapabilityInput,
): string[] {
  if (!capability?.enforced) return [...LEGACY_ALLOWED_TOOLS];
  return [
    ...capability.claudeTools,
    ...capability.mcpTools.map((name) => `mcp__nanoclaw__${name}`),
  ];
}

export function parseAllowedMcpTools(
  raw: string | undefined,
): Set<string> | null {
  if (raw === undefined) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      !Array.isArray(parsed) ||
      parsed.some((value) => typeof value !== 'string' || !value)
    ) {
      return new Set();
    }
    return new Set(parsed);
  } catch {
    return new Set();
  }
}

export function mcpToolIsAllowed(
  allowed: Set<string> | null,
  name: string,
): boolean {
  return allowed === null || allowed.has(name);
}
