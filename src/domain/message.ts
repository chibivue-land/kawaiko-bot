/**
 * What a chat message is, as far as kawaiko is concerned, and how to read one.
 *
 * The gateway and the REST API both hand back their own payload shapes; both
 * are normalized to this before anything inward sees them, so nothing in the
 * domain or the use cases is written against Discord's JSON.
 */

export interface ChatMessage {
  id: string;
  content: string;
  /** ISO timestamp assigned by the chat platform. */
  timestamp: string;
  authorId: string;
  /** Nickname, global name, or username — whatever the platform shows. */
  authorLabel: string;
  isBot: boolean;
}

/** True when the message explicitly mentions the bot (not @everyone/@here). */
export function isExplicitMention(
  botId: string,
  content: string,
  mentionedIds: readonly string[] | undefined,
): boolean {
  if (mentionedIds?.some((id) => id === botId)) return true;
  return content.includes(`<@${botId}>`) || content.includes(`<@!${botId}>`);
}

/** Remove the bot's own mention tags and trim the remainder. */
export function stripBotMention(botId: string, content: string): string {
  return content
    .replaceAll(`<@${botId}>`, "")
    .replaceAll(`<@!${botId}>`, "")
    .replace(/\s+/g, " ")
    .trim();
}
