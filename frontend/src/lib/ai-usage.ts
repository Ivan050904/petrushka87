export type AiUsageSummary = {
  costRub: number | null;
  inputTokens: number;
  cachedInputTokens: number;
  toolTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export function readAiUsage(metadata: Record<string, unknown>): AiUsageSummary | null {
  const ai = metadata.ai;
  if (!isRecord(ai)) {
    return null;
  }

  const usage = ai.usage;
  if (!isRecord(usage)) {
    return null;
  }

  return {
    costRub: readFiniteNumber(usage.cost_rub),
    inputTokens: readInteger(usage.input_tokens),
    cachedInputTokens: readInteger(usage.cached_input_tokens),
    toolTokens: readInteger(usage.tool_tokens),
    outputTokens: readInteger(usage.output_tokens),
    totalTokens: readInteger(usage.total_tokens),
  };
}

export function formatAiCost(usage: AiUsageSummary | null) {
  if (!usage || usage.costRub === null) {
    return null;
  }

  const precision = usage.costRub < 0.01 ? 4 : 2;
  return `${usage.costRub.toFixed(precision)} ₽`;
}

function readFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readInteger(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
