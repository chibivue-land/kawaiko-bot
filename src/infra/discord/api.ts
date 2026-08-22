import type { ChatClient } from "../../app/ports";
import type { ChatMessage } from "../../domain/message";
import type { Env } from "../env";

/**
 * Discord's REST API, adapted to the ChatClient port. Everything that crosses
 * inward is normalized to ChatMessage so no use case reads Discord's JSON.
 */

const API_BASE = "https://discord.com/api/v10";

/** Discord messages are capped at 2000 characters. */
export function clampMessage(content: string): string {
  const limit = 1990;
  return content.length > limit ? `${content.slice(0, limit)}\u2026` : content;
}

export function discordChatClient(env: Env): ChatClient {
  return {
    async post(channelId, content, replyToMessageId) {
      await discordFetch(env, `/channels/${channelId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          content: clampMessage(content),
          ...(replyToMessageId
            ? {
                message_reference: { message_id: replyToMessageId },
                // Reply without pinging the author; kawaiko is aloof like that.
                allowed_mentions: { replied_user: false },
              }
            : {}),
        }),
      });
    },

    async recentMessages(channelId, limit = 30) {
      const res = await discordFetch(env, `/channels/${channelId}/messages?limit=${limit}`, {
        method: "GET",
      });
      return ((await res.json()) as RawMessage[]).map(toChatMessage);
    },

    async guildOf(channelId) {
      try {
        const res = await discordFetch(env, `/channels/${channelId}`, { method: "GET" });
        return ((await res.json()) as { guild_id?: string }).guild_id;
      } catch (err) {
        console.warn("discord: failed to resolve the channel's guild:", String(err));
        return undefined;
      }
    },

    /**
     * Keep the "kawaiko is typing…" indicator alive for the duration.
     * Typing failures are swallowed — the reply matters more than the hint.
     */
    async whileTyping(channelId, work) {
      const fire = () =>
        discordFetch(env, `/channels/${channelId}/typing`, { method: "POST" }).catch(() => {});
      await fire();
      const timer = setInterval(fire, 8_000);
      try {
        return await work();
      } finally {
        clearInterval(timer);
      }
    },
  };
}

async function discordFetch(env: Env, path: string, init: RequestInit): Promise<Response> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      ...init.headers,
    },
  });
  if (!res.ok) {
    throw new Error(
      `Discord API ${init.method ?? "GET"} ${path} failed: ${res.status} ${await res.text()}`,
    );
  }
  return res;
}

interface RawAuthor {
  id: string;
  bot?: boolean;
  username?: string;
  global_name?: string | null;
}

interface RawMessage {
  id: string;
  content: string;
  timestamp: string;
  author: RawAuthor;
  member?: { nick?: string | null };
}

/** Nickname beats global name beats username, the way Discord displays them. */
export function displayNameOf(author: RawAuthor, nick?: string | null): string {
  return nick ?? author.global_name ?? author.username ?? "\u8ab0\u304b";
}

function toChatMessage(raw: RawMessage): ChatMessage {
  return {
    id: raw.id,
    content: raw.content,
    timestamp: raw.timestamp,
    authorId: raw.author.id,
    authorLabel: displayNameOf(raw.author, raw.member?.nick),
    isBot: Boolean(raw.author.bot),
  };
}
