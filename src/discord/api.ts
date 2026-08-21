import type { Env } from "../env";

const API_BASE = "https://discord.com/api/v10";

/** Discord messages are capped at 2000 characters. */
export function clampMessage(content: string): string {
  const limit = 1990;
  return content.length > limit ? `${content.slice(0, limit)}…` : content;
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
    const text = await res.text();
    throw new Error(`Discord API ${init.method ?? "GET"} ${path} failed: ${res.status} ${text}`);
  }
  return res;
}

/** Post a message to a channel, optionally as a reply to another message. */
export async function postChannelMessage(
  env: Env,
  channelId: string,
  content: string,
  replyToMessageId?: string,
): Promise<void> {
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
}

export interface ChannelMessage {
  id: string;
  content: string;
  timestamp: string;
  author: { id: string; bot?: boolean; username?: string; global_name?: string | null };
}

/** Fetch recent messages of a channel (requires Read Message History). */
export async function fetchRecentMessages(
  env: Env,
  channelId: string,
  limit = 30,
): Promise<ChannelMessage[]> {
  const res = await discordFetch(env, `/channels/${channelId}/messages?limit=${limit}`, {
    method: "GET",
  });
  return (await res.json()) as ChannelMessage[];
}

/** Fire the "kawaiko is typing…" indicator once (Discord shows it ~10s). */
export async function triggerTyping(env: Env, channelId: string): Promise<void> {
  await discordFetch(env, `/channels/${channelId}/typing`, { method: "POST" });
}

/**
 * Keep the typing indicator alive while `fn` runs by re-triggering every 8s.
 * Typing failures are swallowed — the reply matters more than the indicator.
 */
export async function withTyping<T>(env: Env, channelId: string, fn: () => Promise<T>): Promise<T> {
  const fire = () => triggerTyping(env, channelId).catch(() => {});
  await fire();
  const timer = setInterval(fire, 8_000);
  try {
    return await fn();
  } finally {
    clearInterval(timer);
  }
}
