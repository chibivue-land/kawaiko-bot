/**
 * Rough API cost estimation (USD) for the monthly budget guard (BudgetTracker DO).
 * This is an estimate, not the actual invoice. On the Gemini API free tier
 * (AI Studio key without billing) nothing can be charged at all — this guard
 * mainly matters once a paid key is used.
 */

/** Shape of `interaction.usage` from the Gemini Interactions API. */
export interface UsageLike {
  total_input_tokens?: number | undefined;
  total_output_tokens?: number | undefined;
  total_thought_tokens?: number | undefined;
  total_cached_tokens?: number | undefined;
}

interface ModelRate {
  /** USD per 1M input tokens */
  input: number;
  /** USD per 1M output tokens (thinking tokens bill as output) */
  output: number;
}

// List prices per 1M tokens. Longest-prefix match wins.
const RATES: Array<[prefix: string, rate: ModelRate]> = [
  // Workers AI is billed in neurons with a free daily allocation; these token
  // rates are the paid-tier equivalents, kept as a conservative estimate.
  ["@cf/google/gemma-4-26b-a4b-it", { input: 0.1, output: 0.3 }],
  ["@cf/zai-org/glm-4.7-flash", { input: 0.06, output: 0.4 }],
  ["@cf/", { input: 0.3, output: 2.5 }],
  ["gemini-3.7-flash", { input: 0.75, output: 3.75 }],
  ["gemini-3.5-flash-lite", { input: 0.1, output: 0.4 }],
  ["gemini-3.5-flash", { input: 1.5, output: 9 }],
  ["gemini-2.5-flash-lite", { input: 0.1, output: 0.4 }],
  ["gemini-2.5-flash", { input: 0.3, output: 2.5 }],
];

// Conservative fallback (Pro-tier pricing) for unknown models.
const DEFAULT_RATE: ModelRate = { input: 2, output: 12 };

// Note: google_search grounded prompts have a free monthly allowance on
// Gemini 3.x (thousands of prompts); this bot's volume stays far below it,
// so searches are not metered here.

export function estimateCostUsd(model: string, usage: UsageLike): number {
  const rate =
    RATES.filter(([prefix]) => model.startsWith(prefix)).sort(
      (a, b) => b[0].length - a[0].length,
    )[0]?.[1] ?? DEFAULT_RATE;

  const input = usage.total_input_tokens ?? 0;
  const cached = usage.total_cached_tokens ?? 0;
  // Thinking tokens are billed at the output rate.
  const output = (usage.total_output_tokens ?? 0) + (usage.total_thought_tokens ?? 0);

  // Cached input is ~10% of the input price.
  return (
    (Math.max(input - cached, 0) / 1e6) * rate.input +
    (cached / 1e6) * rate.input * 0.1 +
    (output / 1e6) * rate.output
  );
}

/** Month key like "2026-08" (UTC). */
export function monthKey(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}
