import type { JobOutcome, Kawaiko } from "./ports";
import { describeFailure } from "./ports";
import { speakFreshly } from "./generation";
import { buildMutterPrompt, pickTopicSeed, seedWantsNews, shouldPost } from "../domain/mutter";
import { buildSystemPrompt } from "../domain/persona";
import { jstNowLabel } from "../domain/schedule";
import { AVOID_LIMIT } from "../domain/repetition";
import { collectOwnLines, sinceReset } from "../domain/transcript";

/**
 * The scheduled mutter: kawaiko says something into its home channel that
 * nobody asked for. Probability gate, then budget gate, then one generation.
 */
export async function postScheduledMutter(
  kawaiko: Kawaiko,
  opts?: { force?: boolean },
): Promise<JobOutcome> {
  if (!opts?.force && !shouldPost(kawaiko.mutterProbability, kawaiko.random)) {
    console.log("mutter: skipped by probability gate");
    return { ok: true, skipped: "probability" };
  }

  const { allowed, spentUsd } = await kawaiko.budget.allows();
  if (!allowed) {
    console.warn(`mutter: monthly budget exceeded (spent ~$${spentUsd.toFixed(2)}), skipping`);
    return { ok: true, skipped: "budget" };
  }

  try {
    const model = await mutter(kawaiko);
    await kawaiko.budget.finish("mutter", true, undefined, model);
    return { ok: true };
  } catch (err) {
    console.error("mutter failed:", err);
    const error = describeFailure(err);
    await kawaiko.budget.finish("mutter", false, error);
    return { ok: false, error };
  }
}

async function mutter(kawaiko: Kawaiko): Promise<string> {
  const channelId = kawaiko.homeChannelId;
  const seed = pickTopicSeed(kawaiko.random);
  const headlines = seedWantsNews(seed) ? await kawaiko.news.headlines() : [];

  // What kawaiko said here lately; a mutter must not echo it either.
  const fetched = await kawaiko.chat.recentMessages(channelId, 30).catch(() => []);
  const recent = sinceReset(fetched, await kawaiko.channels.resetAt(channelId));
  const ownLines = collectOwnLines(recent, kawaiko.botId, AVOID_LIMIT);
  const guildId = await kawaiko.chat.guildOf(channelId);
  const facts = guildId ? await kawaiko.memory.liveFacts(guildId) : [];

  const { text, costUsd, model } = await kawaiko.chat.whileTyping(channelId, () =>
    speakFreshly(
      kawaiko.generator,
      {
        system: buildSystemPrompt(),
        prompt: buildMutterPrompt({
          nowLabel: jstNowLabel(kawaiko.now()),
          seed,
          headlines,
          facts,
          ownLines,
          random: kawaiko.random,
        }),
        effort: "low",
        maxTokens: 2048,
      },
      ownLines,
    ),
  );

  await kawaiko.budget.record(costUsd);
  await kawaiko.chat.post(channelId, text);
  console.log(`mutter: posted via ${model} (~$${costUsd.toFixed(4)})`);
  return model;
}
