/**
 * Pure helpers for @mention handling on gateway MESSAGE_CREATE payloads.
 * For modern Discord apps the bot user id equals the application id.
 */

export interface MentionUser {
  id: string;
}

/** True when the message explicitly mentions the bot (not @everyone/@here). */
export function isExplicitMention(
  appId: string,
  content: string,
  mentions: MentionUser[] | undefined,
): boolean {
  if (mentions?.some((m) => m.id === appId)) return true;
  return content.includes(`<@${appId}>`) || content.includes(`<@!${appId}>`);
}

/** Remove the bot's own mention tags and trim the remainder. */
export function stripBotMention(appId: string, content: string): string {
  return content
    .replaceAll(`<@${appId}>`, "")
    .replaceAll(`<@!${appId}>`, "")
    .replace(/\s+/g, " ")
    .trim();
}
