import type { ChannelMessage } from "./api";
import { isRepetitive } from "../repetition";

/**
 * Render recent channel messages (as returned by the Discord API, newest
 * first) into a compact transcript for the prompt, so kawaiko can hold a
 * conversation instead of answering every message in isolation.
 *
 * Kawaiko's own near-duplicate lines are collapsed to the newest one: a run of
 * identically-shaped self-lines reads as a few-shot template to the model and
 * is exactly how a channel gets stuck on a single catchphrase.
 */
export function buildTranscript(
  messages: ChannelMessage[],
  opts: { botId: string; excludeId?: string; limit?: number },
): string {
  const limit = opts.limit ?? 12;
  const keptSelf: string[] = [];
  return messages
    .filter((m) => m.id !== opts.excludeId && m.content.trim().length > 0)
    .filter((m) => {
      if (m.author.id !== opts.botId) return true;
      // Newest first, so the surviving copy is always the most recent one.
      if (isRepetitive(m.content, keptSelf)) return false;
      keptSelf.push(m.content);
      return true;
    })
    .slice(0, limit)
    .reverse()
    .map((m) => {
      const name =
        m.author.id === opts.botId
          ? "kawaiko"
          : (m.author.global_name ?? m.author.username ?? "誰か");
      const content = m.content.replace(/\s+/g, " ").slice(0, 150);
      return `${name}: ${content}`;
    })
    .join("\n");
}

/**
 * Kawaiko's own most recent lines (newest first), used as the "do not repeat
 * these" list for both the prompt and the output-side repetition check.
 */
export function collectOwnLines(messages: ChannelMessage[], botId: string, limit = 6): string[] {
  return messages
    .filter((m) => m.author.id === botId && m.content.trim().length > 0)
    .slice(0, limit)
    .map((m) => m.content.replace(/\s+/g, " ").trim());
}

/**
 * Drop everything posted before a channel's reset marker (0 = never reset).
 * The marker lives in the per-channel ChannelMemory DO, so applying it here
 * can never leak across channels.
 */
export function sinceReset(messages: ChannelMessage[], resetAt: number): ChannelMessage[] {
  if (!resetAt) return messages;
  return messages.filter((m) => Date.parse(m.timestamp) > resetAt);
}
