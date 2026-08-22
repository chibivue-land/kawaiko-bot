import corpus from "./persona-corpus.md?raw";
import systemTemplate from "./persona-system.md?raw";
import varietyRules from "./persona-variety.md?raw";
import delivery from "./persona-delivery.json";
import { render } from "./prompt";

/**
 * Who kawaiko is.
 *
 * None of the wording lives in this file on purpose — tuning a personality
 * should be editing prose, not editing TypeScript and redeploying a template
 * literal. The text is in the sibling data files:
 *
 *   domain-persona-system.md    the system prompt, with a {{corpus}} slot
 *   domain-persona-corpus.md    the observed style corpus it drops in
 *   domain-persona-variety.md   the standing anti-template rules
 *   domain-persona-delivery.json the per-utterance shape and length dials
 *
 * What lives here is the small amount of behaviour around them.
 */

/**
 * Rotating "shape of this reply" hints, one picked per utterance.
 *
 * The persona is fixed on purpose — what must not be fixed is the delivery.
 * Without this the model settles on whichever skeleton it used last and the
 * channel starts reading like a template bot. Every entry is still kawaiko:
 * the variation is in structure and register, never in character.
 */
export const REPLY_ANGLES: readonly string[] = delivery.angles;

/**
 * Rotating length dial. Without it every reply converges on the same volume,
 * which reads as a template even when the wording differs. Weighted so short
 * dominates and the occasional long ramble still happens.
 */
export const REPLY_LENGTHS: readonly { hint: string; weight: number }[] = delivery.lengths;

/** Standing rules scoped to *delivery*, so variety never flattens the character. */
export const VARIETY_RULES: string = varietyRules.trim();

/** Pick this utterance's shape. */
export function pickReplyAngle(random: () => number = Math.random): string {
  return REPLY_ANGLES[Math.floor(random() * REPLY_ANGLES.length)]!;
}

/** Pick this utterance's length (weighted toward short). */
export function pickReplyLength(random: () => number = Math.random): string {
  const total = REPLY_LENGTHS.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = random() * total;
  for (const entry of REPLY_LENGTHS) {
    roll -= entry.weight;
    if (roll < 0) return entry.hint;
  }
  return REPLY_LENGTHS[REPLY_LENGTHS.length - 1]!.hint;
}

/** The system prompt: hard rules, the persona corpus, and behaviour notes. */
export function buildSystemPrompt(): string {
  return render(systemTemplate, { corpus }).trim();
}
