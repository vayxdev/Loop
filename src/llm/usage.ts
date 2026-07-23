import type { UsageSummary } from './types.js';

export function emptyUsage(): UsageSummary {
  return { calls: 0, inputTokens: 0, outputTokens: 0 };
}

export function mergeUsage(a: UsageSummary, b: UsageSummary): UsageSummary {
  return {
    calls: a.calls + b.calls,
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
}

export function usageDelta(current: UsageSummary, checkpoint: UsageSummary): UsageSummary {
  return {
    calls: current.calls - checkpoint.calls,
    inputTokens: current.inputTokens - checkpoint.inputTokens,
    outputTokens: current.outputTokens - checkpoint.outputTokens,
  };
}
