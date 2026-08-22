import { avoidBlock, joinSections, memoryBlock } from "./prompt";
import { pickReplyLength } from "./persona";
import type { Fact } from "./memory";
import seeds from "./mutter-seeds.json";
import mutterStyle from "./mutter-style.md?raw";

/**
 * The scheduled mutter: kawaiko talking to nobody in particular.
 * Seeds, tone, and the prompt behind one post. Pure.
 */

/**
 * Topic seeds (domain-mutter-seeds.json). One is picked at random per post.
 * The default register is "ネタツイ": internet-nerd shitpost energy — slightly
 * twisted, dry, dark — never preachy, never soft.
 */
export const TOPIC_SEEDS: readonly string[] = seeds.seeds;

/** True when this seed wants fresh headlines pulled in. */
export function seedWantsNews(seed: string): boolean {
  return seed.startsWith("ニュース");
}

const MUTTER_STYLE = mutterStyle.trim();

const MUTTER_OPENING = "Discord の雑談チャンネルに、誰に宛てるでもなくテキトーに一言呟いて。";

export function pickTopicSeed(random: () => number = Math.random): string {
  return TOPIC_SEEDS[Math.floor(random() * TOPIC_SEEDS.length)]!;
}

/** Probability gate for a scheduled slot; unparseable values always fire. */
export function shouldPost(probability: string, random: () => number = Math.random): boolean {
  const p = Number.parseFloat(probability);
  if (!Number.isFinite(p)) return true;
  return random() < Math.min(Math.max(p, 0), 1);
}

export function buildMutterPrompt(context: {
  nowLabel: string;
  seed: string;
  headlines: readonly string[];
  facts: readonly Fact[];
  ownLines: readonly string[];
  random?: () => number;
}): string {
  const random = context.random ?? Math.random;
  const news =
    context.headlines.length > 0
      ? `直近のニュース見出し:\n${context.headlines.map((h) => `- ${h}`).join("\n")}`
      : "";
  return joinSections(
    `今は ${context.nowLabel}。${MUTTER_OPENING}`,
    `ネタの方向性: ${context.seed}`,
    news,
    MUTTER_STYLE,
    memoryBlock(context.facts),
    avoidBlock(context.ownLines),
    [
      `今回の長さ (毎回変える。直前の呟きと同じ分量にしない): ${pickReplyLength(random)}`,
      "毎回同じような書き出しにしない。",
    ].join("\n"),
  );
}
