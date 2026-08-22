import lines from "./lines.json";

/**
 * Canned lines, in kawaiko's voice, for the moments we do not want to spend API
 * budget on: rate limits, an exhausted budget, errors, refusals, loops.
 *
 * The wording lives in domain-lines.json so it can be tuned without touching
 * code. Kept intentionally varied so repeated hits do not feel robotic.
 * `{m}` is replaced with minutes-until-retry where applicable.
 */

export const RATE_LIMITED_LINES: readonly string[] = lines.RATE_LIMITED_LINES;
export const BUDGET_EXCEEDED_LINES: readonly string[] = lines.BUDGET_EXCEEDED_LINES;
export const ERROR_LINES: readonly string[] = lines.ERROR_LINES;
export const REFUSAL_LINES: readonly string[] = lines.REFUSAL_LINES;
export const EMPTY_RESPONSE_LINES: readonly string[] = lines.EMPTY_RESPONSE_LINES;
/** Last resort when every re-roll still came back as the line just posted. */
export const REPETITION_BREAK_LINES: readonly string[] = lines.REPETITION_BREAK_LINES;
/** Acknowledgement for "@kawaiko reset"; costs no tokens by design. */
export const RESET_LINES: readonly string[] = lines.RESET_LINES;
export const LEAK_DEFLECTION_LINES: readonly string[] = lines.LEAK_DEFLECTION_LINES;

/** Pick one line at random; substitute `{m}` with retry-after minutes if given. */
export function pickLine(
  candidates: readonly string[],
  vars?: { minutes?: number },
  random: () => number = Math.random,
): string {
  const line = candidates[Math.floor(random() * candidates.length)]!;
  return line.replace("{m}", String(vars?.minutes ?? 60));
}
