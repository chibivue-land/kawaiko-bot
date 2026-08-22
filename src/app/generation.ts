import type { GenerationRequest, Generated, TextGenerator } from "./ports";
import { isRepetitive, repetitionScore } from "../domain/repetition";
import { leaksSystemPrompt } from "../domain/leakguard";
import { RETRY_NUDGE } from "../domain/prompt";
import {
  EMPTY_RESPONSE_LINES,
  LEAK_DEFLECTION_LINES,
  REFUSAL_LINES,
  REPETITION_BREAK_LINES,
  pickLine,
} from "../domain/lines";

/**
 * The policies that sit between "a provider returned some text" and "kawaiko
 * says this".
 *
 * These are application concerns, not provider concerns: which model served
 * the request has no bearing on whether the answer leaked the system prompt or
 * repeated yesterday's catchphrase. Keeping them here means a new provider
 * adapter inherits every guard for free.
 */

/**
 * Attempts (including the first) before settling for the least repetitive one.
 * Kept at 2: every re-roll is another full generation against a small daily
 * free allocation, and one already breaks the overwhelming majority of loops.
 */
const VARIED_ATTEMPTS = 2;
/** At or above this, the "fresh" pick is still effectively the same sentence. */
const HARD_REPEAT_SCORE = 0.9;

/** Generate once, then replace anything kawaiko must not actually post. */
export async function speak(
  generator: TextGenerator,
  request: GenerationRequest,
): Promise<Generated> {
  const result = await generator.generate(request);
  // Never let the system prompt (or the persona corpus) reach a channel.
  if (leaksSystemPrompt(result.text, request.system)) {
    console.warn("generation: blocked a system-prompt leak");
    return { ...result, text: pickLine(LEAK_DEFLECTION_LINES) };
  }
  if (result.refused) return { ...result, text: pickLine(REFUSAL_LINES) };
  if (!result.text.trim()) return { ...result, text: pickLine(EMPTY_RESPONSE_LINES) };
  return result;
}

/**
 * `speak`, but refusing to hand back something kawaiko just said.
 *
 * The channel transcript in the prompt contains kawaiko's own lines, and small
 * models lock onto that as a template — which is how a channel ends up
 * receiving the same sentence skeleton forever. Re-roll with an explicit nudge,
 * keep the least repetitive candidate, and bail out to a loop-break line if
 * even that is a verbatim repeat. Cost is summed across attempts so the budget
 * guard still sees the real spend.
 */
export async function speakFreshly(
  generator: TextGenerator,
  request: GenerationRequest,
  avoid: readonly string[],
): Promise<Generated> {
  if (avoid.length === 0) return speak(generator, request);

  let best: Generated | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  let costUsd = 0;

  for (let attempt = 0; attempt < VARIED_ATTEMPTS; attempt++) {
    let result: Generated;
    try {
      result = await speak(
        generator,
        attempt === 0 ? request : { ...request, prompt: `${request.prompt}\n\n${RETRY_NUDGE}` },
      );
    } catch (err) {
      // A re-roll is a nice-to-have: never drop a usable answer to get one.
      if (!best) throw err;
      console.warn(`generation: re-roll ${attempt + 1} failed, keeping the earlier line`);
      break;
    }
    costUsd += result.costUsd;
    const score = repetitionScore(result.text, avoid);
    if (score < bestScore) {
      best = result;
      bestScore = score;
    }
    if (!isRepetitive(result.text, avoid)) return { ...result, costUsd };
    console.warn(
      `generation: attempt ${attempt + 1} repeated a recent line (score ${score.toFixed(2)})`,
    );
  }

  const fallback = best!;
  if (bestScore >= HARD_REPEAT_SCORE) {
    console.warn("generation: every attempt was a verbatim repeat, breaking the loop");
    return { ...fallback, text: pickLine(REPETITION_BREAK_LINES), costUsd };
  }
  return { ...fallback, costUsd };
}
