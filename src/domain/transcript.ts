import type { ChatMessage } from "./message";
import { isRepetitive } from "./repetition";
import { epochMillis } from "./time";

/**
 * Turning recent channel messages into the transcript kawaiko is shown, so it
 * answers a conversation instead of an isolated message.
 *
 * Messages arrive newest-first, the way chat APIs return them.
 */

/**
 * Render a transcript, oldest last-to-first.
 *
 * kawaiko's own near-duplicate lines collapse to the newest one: a run of
 * identically-shaped self-lines reads as a few-shot template to the model and
 * is exactly how a channel gets stuck on a single catchphrase.
 */
export function buildTranscript(
  messages: readonly ChatMessage[],
  opts: { botId: string; excludeId?: string; limit?: number },
): string {
  const limit = opts.limit ?? 12;
  const keptSelf: string[] = [];
  return messages
    .filter((m) => m.id !== opts.excludeId && m.content.trim().length > 0)
    .filter((m) => {
      if (m.authorId !== opts.botId) return true;
      // Newest first, so the surviving copy is always the most recent one.
      if (isRepetitive(m.content, keptSelf)) return false;
      keptSelf.push(m.content);
      return true;
    })
    .slice(0, limit)
    .reverse()
    .map((m) => {
      const name = m.authorId === opts.botId ? "kawaiko" : m.authorLabel;
      return `${name}: ${m.content.replace(/\s+/g, " ").slice(0, 150)}`;
    })
    .join("\n");
}

/**
 * kawaiko's own most recent lines (newest first): the "do not echo these" list
 * for both the prompt and the output-side repetition check.
 */
export function collectOwnLines(
  messages: readonly ChatMessage[],
  botId: string,
  limit = 6,
): string[] {
  return messages
    .filter((m) => m.authorId === botId && m.content.trim().length > 0)
    .slice(0, limit)
    .map((m) => m.content.replace(/\s+/g, " ").trim());
}

/**
 * Drop everything posted before a channel's reset marker (0 = never reset).
 * The marker is per channel, so applying it here can never leak across channels.
 */
export function sinceReset<T extends { timestamp: string }>(
  messages: readonly T[],
  resetAt: number,
): T[] {
  if (!resetAt) return [...messages];
  return messages.filter((m) => (epochMillis(m.timestamp) ?? 0) > resetAt);
}
