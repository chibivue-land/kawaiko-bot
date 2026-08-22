import type { BudgetGuard, ChannelMemory, Kawaiko, RateLimiter } from "../app/ports";
import { discordChatClient } from "./discord/api";
import { DEFAULT_MODELS, fallbackGenerator, parseModelList } from "./ai/generator";
import { workersAiProvider } from "./ai/workers";
import { geminiProvider } from "./ai/gemini";
import { NO_MEMORY, d1MemoryStore } from "./d1/memory";
import { rssNewsFeed } from "./news";
import { webResearchService } from "./research";
import { monthlyBudgetUsd, type Env } from "./env";
import { nowInstant } from "../domain/time";

/**
 * The composition root: bindings in, ports out.
 *
 * This is the only place that knows both halves. Everything inward of it names
 * interfaces from app-ports.ts, which is what lets a test drive the exact same
 * use cases with fakes and no Cloudflare runtime.
 */
export function kawaikoFrom(env: Env): Kawaiko {
  const budgetTracker = env.BUDGET_TRACKER.get(env.BUDGET_TRACKER.idFromName("global"));

  const budget: BudgetGuard = {
    allows: () => budgetTracker.checkBudget(monthlyBudgetUsd(env)),
    record: (costUsd) => budgetTracker.recordSpend(costUsd),
    finish: (kind, ok, error, model) => budgetTracker.recordOutcome(kind, ok, error, model),
  };

  const limiter: RateLimiter = {
    check: (userId) =>
      env.USER_RATE_LIMITER.get(env.USER_RATE_LIMITER.idFromName(userId)).checkAndIncrement(
        Number(env.RATE_LIMIT_PER_HOUR) || 5,
        Number(env.RATE_LIMIT_PER_DAY) || 20,
      ),
  };

  const channels: ChannelMemory = {
    resetAt: (channelId) =>
      env.CHANNEL_MEMORY.get(env.CHANNEL_MEMORY.idFromName(channelId)).resetAt(),
    reset: async (channelId, at) => {
      await env.CHANNEL_MEMORY.get(env.CHANNEL_MEMORY.idFromName(channelId)).reset(at);
    },
  };

  return {
    chat: discordChatClient(env),
    generator: fallbackGenerator(
      [workersAiProvider(env.AI), geminiProvider(env.GEMINI_API_KEY)],
      parseModelList(env.KAWAIKO_MODEL || DEFAULT_MODELS),
    ),
    memory: env.DB ? d1MemoryStore(env.DB) : NO_MEMORY,
    budget,
    limiter,
    channels,
    research: webResearchService({ githubToken: env.GITHUB_API_TOKEN }),
    news: rssNewsFeed,
    botId: env.DISCORD_APPLICATION_ID,
    homeChannelId: env.KAWAIKO_CHANNEL_ID,
    mutterProbability: env.POST_PROBABILITY,
    replyProbability: env.REPLY_PROBABILITY,
    observeMessages: env.OBSERVE_MESSAGES !== "false",
    now: nowInstant,
    random: Math.random,
    newBatchId: () => crypto.randomUUID(),
  };
}
