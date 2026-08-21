import type { Env } from "./env";
import { generateVaried } from "./ai/generate";
import {
  fetchChannelGuildId,
  fetchRecentMessages,
  postChannelMessage,
  withTyping,
} from "./discord/api";
import { buildTranscript, collectOwnLines, sinceReset } from "./discord/transcript";
import { VARIETY_RULES, buildDeliveryBlock, buildSystemPrompt, jstNowLabel } from "./persona";
import { AVOID_LIMIT, buildAvoidBlock } from "./repetition";
import { buildMemoryBlock, liveFacts } from "./memory";
import { shouldPost, type PostOutcome } from "./mutter";

/** Only barge into messages newer than this. */
const MAX_MESSAGE_AGE_MS = 3 * 3_600_000;

/**
 * Every couple of hours, pick a random recent human message in the channel
 * and reply to it uninvited. Kawaiko hates humanity but cannot stop replying.
 */
export async function postRandomReply(env: Env, opts?: { force?: boolean }): Promise<PostOutcome> {
  if (!opts?.force && !shouldPost(env.REPLY_PROBABILITY)) {
    console.log("replier: skipped by probability gate");
    return { ok: true, skipped: "probability" };
  }

  const budget = env.BUDGET_TRACKER.get(env.BUDGET_TRACKER.idFromName("global"));
  const { allowed, spentUsd } = await budget.checkBudget(Number(env.MONTHLY_BUDGET_USD) || 100);
  if (!allowed) {
    console.warn(`replier: monthly budget exceeded (spent ~$${spentUsd.toFixed(2)}), skipping`);
    return { ok: true, skipped: "budget" };
  }

  try {
    const model = await postReply(env, budget);
    await budget.recordOutcome("reply", true, undefined, model);
    return { ok: true };
  } catch (err) {
    console.error("replier failed:", err);
    const error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    await budget.recordOutcome("reply", false, error);
    return { ok: false, error };
  }
}

async function postReply(
  env: Env,
  budget: ReturnType<Env["BUDGET_TRACKER"]["get"]>,
): Promise<string | undefined> {
  // Scoped to kawaiko's home channel only, so its reset marker is the one that applies.
  const memory = env.CHANNEL_MEMORY.get(env.CHANNEL_MEMORY.idFromName(env.KAWAIKO_CHANNEL_ID));
  const messages = sinceReset(
    await fetchRecentMessages(env, env.KAWAIKO_CHANNEL_ID),
    await memory.resetAt(),
  );
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
    return undefined;
  }

  const target = candidates[Math.floor(Math.random() * candidates.length)]!;
  const displayName = target.author.global_name ?? target.author.username ?? "誰か";
  const transcript = buildTranscript(messages, {
    botId: appId,
    excludeId: target.id,
    limit: 8,
  });
  // kawaiko's own recent lines: the list it must not echo.
  const ownLines = collectOwnLines(messages, appId, AVOID_LIMIT);
  // Server-scoped long-term memory, biased toward the person being bothered.
  const guildId = await fetchChannelGuildId(env, env.KAWAIKO_CHANNEL_ID);
  const memoryBlock = guildId
    ? buildMemoryBlock(await liveFacts(env, guildId, { subjectId: target.author.id }))
    : "";

  const { text, costUsd, model } = await withTyping(env, env.KAWAIKO_CHANNEL_ID, () =>
    generateVaried(
      env,
      {
        system: buildSystemPrompt(),
        prompt: `今は ${jstNowLabel()}。${transcript ? `チャンネルの直近の流れ:\n${transcript}\n\n` : ""}この中で ${displayName} さんのこの発言に注目した:

${target.content}

頼まれてもいないのに、この発言に突然リプライで絡んで。捻くれた辛口の茶々・ツッコミ・共感のどれか。相手を本気で傷つける個人攻撃はしない (からかいの範囲で)。${memoryBlock}${buildAvoidBlock(ownLines)}

${buildDeliveryBlock()}

${VARIETY_RULES}`,
        maxSearches: 0,
        effort: "low",
        maxTokens: 2048,
      },
      ownLines,
    ),
  );

  await budget.recordSpend(costUsd);
  await postChannelMessage(env, env.KAWAIKO_CHANNEL_ID, text, target.id);
  console.log(`replier: replied to ${target.id} via ${model} (~$${costUsd.toFixed(4)})`);
  return model;
}
