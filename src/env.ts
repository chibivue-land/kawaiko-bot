import type { UserRateLimiter, BudgetTracker } from "./do";
import type { DiscordGateway } from "./gateway";

export interface Env {
  // vars (wrangler.jsonc)
  KAWAIKO_MODEL: string;
  POST_PROBABILITY: string;
  REPLY_PROBABILITY: string;
  RATE_LIMIT_PER_HOUR: string;
  RATE_LIMIT_PER_DAY: string;
  MONTHLY_BUDGET_USD: string;
  DISCORD_APPLICATION_ID: string;
  KAWAIKO_CHANNEL_ID: string;

  // secrets (wrangler secret put)
  DISCORD_BOT_TOKEN: string;
  GEMINI_API_KEY: string;
  TRIGGER_TOKEN: string;
  /** Optional no-scope PAT; unauthenticated GitHub API is dead from shared Workers IPs. */
  GITHUB_API_TOKEN?: string;

  // bindings
  AI: Ai;
  USER_RATE_LIMITER: DurableObjectNamespace<UserRateLimiter>;
  BUDGET_TRACKER: DurableObjectNamespace<BudgetTracker>;
  DISCORD_GATEWAY: DurableObjectNamespace<DiscordGateway>;
}
