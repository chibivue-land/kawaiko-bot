import type { Env } from "./env";
import { generate } from "./ai/generate";
import { fetchRecentMessages, postChannelMessage, withTyping } from "./discord/api";
import { buildSystemPrompt, jstNowLabel } from "./persona";
import { shouldPost } from "./mutter";

/** Only barge into messages newer than this. */
const MAX_MESSAGE_AGE_MS = 3 * 3_600_000;

/**
 * Every couple of hours, pick a random recent human message in the channel
 * and reply to it uninvited. Kawaiko hates humanity but cannot stop replying.
 */
export async function postRandomReply(env: Env): Promise<void> {
  if (!shouldPost(env.REPLY_PROBABILITY)) {
    console.log("replier: skipped by probability gate");
    return;
  }

  const budget = env.BUDGET_TRACKER.get(env.BUDGET_TRACKER.idFromName("global"));
  const { allowed, spentUsd } = await budget.checkBudget(Number(env.MONTHLY_BUDGET_USD) || 100);
  if (!allowed) {
    console.warn(`replier: monthly budget exceeded (spent ~$${spentUsd.toFixed(2)}), skipping`);
    return;
  }

  const messages = await fetchRecentMessages(env, env.KAWAIKO_CHANNEL_ID);
  const now = Date.now();
  const appId = env.DISCORD_APPLICATION_ID;
  const candidates = messages.filter(
    (m) =>
      !m.author.bot &&
      m.content.trim().length > 0 &&
      // Skip messages aimed at the bot; the gateway already answers those.
      !m.content.includes(`<@${appId}>`) &&
      now - Date.parse(m.timestamp) < MAX_MESSAGE_AGE_MS,
  );
  if (candidates.length === 0) {
    console.log("replier: no recent human messages to bother");
    return;
  }

  const target = candidates[Math.floor(Math.random() * candidates.length)]!;
  const displayName = target.author.global_name ?? target.author.username ?? "誰か";

  const { text, costUsd } = await withTyping(env, env.KAWAIKO_CHANNEL_ID, () =>
    generate(env, {
      system: buildSystemPrompt(),
      prompt: `今は ${jstNowLabel()}。Discord のチャンネルで ${displayName} さんがこう発言していた:

${target.content}

頼まれてもいないのに、この発言に突然リプライで絡んで。捻くれた辛口の茶々・ツッコミ・共感のどれか。1〜2 文で短く。相手を本気で傷つける個人攻撃はしない (からかいの範囲で)。`,
      maxSearches: 0,
      effort: "low",
      maxTokens: 2048,
    }),
  );

  await budget.recordSpend(costUsd);
  await postChannelMessage(env, env.KAWAIKO_CHANNEL_ID, text, target.id);
  console.log(`replier: replied to ${target.id} (~$${costUsd.toFixed(4)})`);
}
