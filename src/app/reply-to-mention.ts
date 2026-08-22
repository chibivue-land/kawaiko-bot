import type { Kawaiko } from "./ports";
import { speakFreshly } from "./generation";
import { isResetCommand } from "../domain/command";
import { buildMentionPrompt } from "../domain/conversation";
import { buildSystemPrompt } from "../domain/persona";
import { jstNowLabel } from "../domain/schedule";
import { AVOID_LIMIT } from "../domain/repetition";
import { buildTranscript, collectOwnLines, sinceReset } from "../domain/transcript";
import { BUDGET_EXCEEDED_LINES, RATE_LIMITED_LINES, RESET_LINES, pickLine } from "../domain/lines";

/**
 * Answering someone who spoke to kawaiko.
 *
 * Deliberately free of Discord and Cloudflare types: it takes an already
 * normalized message and a bag of ports, which is what makes it testable
 * without a WebSocket, a Durable Object, or a model.
 */

/** A message aimed at kawaiko, normalized away from the gateway payload. */
export interface IncomingMention {
  messageId: string;
  channelId: string;
  guildId: string;
  authorId: string;
  displayName: string;
  /** The message with kawaiko's own mention tags already stripped. */
  body: string;
}

export type MentionResult =
  | { kind: "reset" }
  | { kind: "rate-limited" }
  | { kind: "budget" }
  | { kind: "answered"; model: string };

export async function replyToMention(
  kawaiko: Kawaiko,
  message: IncomingMention,
): Promise<MentionResult> {
  const reply = (text: string) => kawaiko.chat.post(message.channelId, text, message.messageId);

  if (isResetCommand(message.body)) {
    // The escape hatch for a channel stuck in a loop. It spends no tokens, so
    // it deliberately runs ahead of the rate-limit and budget gates: being
    // throttled out of fixing a broken channel would be the wrong failure.
    await kawaiko.channels.reset(message.channelId, kawaiko.now().epochMilliseconds);
    await reply(pickLine(RESET_LINES));
    return { kind: "reset" };
  }

  const decision = await kawaiko.limiter.check(message.authorId);
  if (!decision.allowed) {
    await reply(pickLine(RATE_LIMITED_LINES, { minutes: decision.retryAfterMinutes }));
    return { kind: "rate-limited" };
  }

  const { allowed } = await kawaiko.budget.allows();
  if (!allowed) {
    await reply(pickLine(BUDGET_EXCEEDED_LINES));
    return { kind: "budget" };
  }

  const { text, costUsd, model } = await kawaiko.chat.whileTyping(message.channelId, async () => {
    // Recent history is kawaiko's conversation memory. Fetch wide: near
    // duplicate self-lines get collapsed out of the transcript.
    const fetched = await kawaiko.chat.recentMessages(message.channelId, 30).catch(() => []);
    const recent = sinceReset(fetched, await kawaiko.channels.resetAt(message.channelId));
    const transcript = buildTranscript(recent, {
      botId: kawaiko.botId,
      excludeId: message.messageId,
      limit: 12,
    });
    const ownLines = collectOwnLines(recent, kawaiko.botId, AVOID_LIMIT);
    // Server-scoped long-term memory, unaffected by a channel reset, with
    // anything known about this speaker pulled to the front.
    const facts = await kawaiko.memory.liveFacts(message.guildId, { subjectId: message.authorId });
    const research = message.body ? await kawaiko.research.lookup(message.body) : "";

    return speakFreshly(
      kawaiko.generator,
      {
        system: buildSystemPrompt(),
        prompt: buildMentionPrompt({
          nowLabel: jstNowLabel(kawaiko.now()),
          displayName: message.displayName,
          question: message.body,
          transcript,
          research,
          facts,
          ownLines,
          random: kawaiko.random,
        }),
        effort: "medium",
        maxTokens: 1024,
      },
      ownLines,
    );
  });

  await kawaiko.budget.record(costUsd);
  await reply(text);
  return { kind: "answered", model };
}
