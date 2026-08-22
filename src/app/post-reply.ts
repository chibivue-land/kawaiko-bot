import type { JobOutcome, Kawaiko } from "./ports";
import { describeFailure } from "./ports";
import { speakFreshly } from "./generation";
import { buildUninvitedReplyPrompt } from "../domain/conversation";
import { shouldPost } from "../domain/mutter";
import { buildSystemPrompt } from "../domain/persona";
import { jstNowLabel } from "../domain/schedule";
import { AVOID_LIMIT } from "../domain/repetition";
import { buildTranscript, collectOwnLines, sinceReset } from "../domain/transcript";
import type { ChatMessage } from "../domain/message";
import { epochMillis } from "../domain/time";

/** Only barge into messages newer than this. */
const MAX_MESSAGE_AGE_MS = 3 * 3_600_000;

/**
 * Every couple of hours, pick a random recent human message in kawaiko's home
 * channel and reply to it uninvited. kawaiko hates humanity but cannot stop
 * replying.
 */
export async function postRandomReply(
  kawaiko: Kawaiko,
  opts?: { force?: boolean },
): Promise<JobOutcome> {
  if (!opts?.force && !shouldPost(kawaiko.replyProbability, kawaiko.random)) {
    console.log("replier: skipped by probability gate");
    return { ok: true, skipped: "probability" };
  }

  const { allowed, spentUsd } = await kawaiko.budget.allows();
  if (!allowed) {
    console.warn(`replier: monthly budget exceeded (spent ~$${spentUsd.toFixed(2)}), skipping`);
    return { ok: true, skipped: "budget" };
  }

  try {
    const model = await bargeIn(kawaiko);
    await kawaiko.budget.finish("reply", true, undefined, model);
    return { ok: true };
  } catch (err) {
    console.error("replier failed:", err);
    const error = describeFailure(err);
    await kawaiko.budget.finish("reply", false, error);
    return { ok: false, error };
  }
}

/** Messages worth bothering: recent, human, and not already aimed at kawaiko. */
export function pickTargets(
  messages: readonly ChatMessage[],
  opts: { botId: string; now: number },
): ChatMessage[] {
  return messages.filter(
    (m) =>
      !m.isBot &&
      m.content.trim().length > 0 &&
      // Mentions are answered by the gateway; do not double up on them.
      !m.content.includes(`<@${opts.botId}>`) &&
      opts.now - (epochMillis(m.timestamp) ?? 0) < MAX_MESSAGE_AGE_MS,
  );
}

async function bargeIn(kawaiko: Kawaiko): Promise<string | undefined> {
  const channelId = kawaiko.homeChannelId;
  const messages = sinceReset(
    await kawaiko.chat.recentMessages(channelId),
    await kawaiko.channels.resetAt(channelId),
  );
  const candidates = pickTargets(messages, {
    botId: kawaiko.botId,
    now: kawaiko.now().epochMilliseconds,
  });
  if (candidates.length === 0) {
    console.log("replier: no recent human messages to bother");
    return undefined;
  }

  const target = candidates[Math.floor(kawaiko.random() * candidates.length)]!;
  const transcript = buildTranscript(messages, {
    botId: kawaiko.botId,
    excludeId: target.id,
    limit: 8,
  });
  const ownLines = collectOwnLines(messages, kawaiko.botId, AVOID_LIMIT);
  const guildId = await kawaiko.chat.guildOf(channelId);
  const facts = guildId
    ? await kawaiko.memory.liveFacts(guildId, { subjectId: target.authorId })
    : [];

  const { text, costUsd, model } = await kawaiko.chat.whileTyping(channelId, () =>
    speakFreshly(
      kawaiko.generator,
      {
        system: buildSystemPrompt(),
        prompt: buildUninvitedReplyPrompt({
          nowLabel: jstNowLabel(kawaiko.now()),
          displayName: target.authorLabel,
          target: target.content,
          transcript,
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
  await kawaiko.chat.post(channelId, text, target.id);
  console.log(`replier: replied to ${target.id} via ${model} (~$${costUsd.toFixed(4)})`);
  return model;
}
