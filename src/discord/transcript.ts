import type { ChannelMessage } from "./api";

/**
 * Render recent channel messages (as returned by the Discord API, newest
 * first) into a compact transcript for the prompt, so kawaiko can hold a
 * conversation instead of answering every message in isolation.
 */
export function buildTranscript(
  messages: ChannelMessage[],
  opts: { botId: string; excludeId?: string; limit?: number },
): string {
  const limit = opts.limit ?? 12;
  return messages
    .filter((m) => m.id !== opts.excludeId && m.content.trim().length > 0)
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
