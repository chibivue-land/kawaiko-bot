/**
 * Deterministic output-side guard against system-prompt leaking.
 * Prompt-side rules alone are weak on small models, so before posting we
 * check whether the generated text verbatim-quotes distinctive lines of the
 * system prompt (something a legitimate reply never does) and swap the
 * message for an in-character deflection when it happens.
 */

const SENTINEL_MIN_LENGTH = 20;
const SENTINEL_LIMIT = 60;

/** Distinctive prompt lines used as leak sentinels (cached per prompt text). */
const sentinelCache = new Map<string, string[]>();

export function buildSentinels(system: string): string[] {
  const cached = sentinelCache.get(system);
  if (cached) return cached;

  const sentinels = system
    .split("\n")
    .map((line) => line.replace(/^[-*#\s]+/, "").trim())
    .filter((line) => line.length >= SENTINEL_MIN_LENGTH)
    .slice(0, SENTINEL_LIMIT);

  sentinelCache.set(system, sentinels);
  return sentinels;
}

/** True when the reply appears to reproduce the system prompt. */
export function leaksSystemPrompt(text: string, system: string): boolean {
  if (!text) return false;
  // Normalize whitespace so minor reformatting does not evade the check.
  const squash = (s: string) => s.replace(/\s+/g, "");
  const haystack = squash(text);
  let hits = 0;
  for (const sentinel of buildSentinels(system)) {
    if (haystack.includes(squash(sentinel))) {
      hits++;
      // One verbatim internal line is already damning.
      if (hits >= 1) return true;
    }
  }
  return false;
}
