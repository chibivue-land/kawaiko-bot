import { AVOID_LIMIT } from "./repetition";
import transcriptHeading from "./prompt-transcript.md?raw";
import researchHeading from "./prompt-research.md?raw";
import memoryHeading from "./prompt-memory.md?raw";
import avoidHeading from "./prompt-avoid.md?raw";
import retryNudge from "./prompt-retry.md?raw";
import { MAX_FACTS_IN_PROMPT, MAX_FACT_LENGTH, type Fact } from "./memory";
import { VARIETY_RULES, pickReplyAngle, pickReplyLength } from "./persona";

/**
 * Prompt assembly.
 *
 * Every prompt kawaiko is given is the same handful of blocks in a different
 * order, and they used to be re-templated by hand in three call sites — which
 * is how one of them silently drifted. Blocks are built here, once, and the
 * use cases only choose which ones apply.
 *
 * Pure string work: no bindings, no I/O.
 */

/**
 * Fill `{{name}}` slots in a text template. Prompt wording lives in .md files
 * next to the module that owns it; this is the only substitution they get.
 */
export function render(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (whole, key: string) => values[key] ?? whole);
}

/** Join prompt sections, dropping the empty ones, with one blank line between. */
export function joinSections(...sections: readonly (string | undefined)[]): string {
  return sections
    .map((section) => section?.trim())
    .filter((section): section is string => Boolean(section))
    .join("\n\n");
}

/** Recent channel history, so kawaiko answers a conversation and not a message. */
export function transcriptBlock(transcript: string): string {
  if (!transcript.trim()) return "";
  return `${transcriptHeading.trim()}\n${transcript}`;
}

/** Web lookups for grounding. Explicitly optional so it can be ignored. */
export function researchBlock(research: string): string {
  if (!research.trim()) return "";
  return `${researchHeading.trim()}\n${research}`;
}

/**
 * What kawaiko has learned about this server.
 *
 * Framed as observation rather than instruction on purpose: every fact in here
 * was ultimately derived from user messages, so a "fact" that reads like a
 * command must not be executable. Keep that wording if you touch this.
 */
export function memoryBlock(facts: readonly Fact[]): string {
  if (facts.length === 0) return "";
  const lines = facts.slice(0, MAX_FACTS_IN_PROMPT).map((fact) => {
    const who = fact.subjectLabel ?? (fact.subjectKind === "server" ? "このサーバー" : "誰か");
    return `- ${who}: ${fact.body.replace(/\s+/g, " ").slice(0, MAX_FACT_LENGTH)}`;
  });
  return [memoryHeading.trim(), ...lines].join("\n");
}

/** The lines kawaiko must not rebuild its next one out of. */
export function avoidBlock(previous: readonly string[]): string {
  const lines = previous
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, AVOID_LIMIT);
  if (lines.length === 0) return "";
  return [avoidHeading.trim(), ...lines.map((line) => `- ${line.slice(0, 80)}`)].join("\n");
}

/**
 * Per-utterance shape and length, re-rolled every time. Without it the model
 * settles into one rhythm and the channel starts reading like a template bot.
 */
export function deliveryBlock(random: () => number = Math.random): string {
  return `今回の返しの型 (毎回変わる。直前と同じ型・同じ分量にはしない):
- 型: ${pickReplyAngle(random)}
- 長さ: ${pickReplyLength(random)}`;
}

/** Delivery directive plus the standing anti-template rules. */
export function varietySection(random: () => number = Math.random): string {
  return joinSections(deliveryBlock(random), VARIETY_RULES);
}

/** Appended when a first attempt came back as a repeat of a recent line. */
export const RETRY_NUDGE: string = retryNudge.trim();
