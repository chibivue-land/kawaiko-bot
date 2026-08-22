import type { UserRateLimiter } from "./do/rate-limit";
import type { BudgetTracker } from "./do/budget";
// Same name as the ChannelMemory *port* in app-ports.ts on purpose: this is
// the Durable Object that implements it. They are never imported together.
import type { ChannelMemory } from "./do/channel-memory";
import type { DiscordGateway } from "./discord/gateway";

/**
 * The Worker's bindings, exactly as wrangler.jsonc declares them.
 *
 * This is the outermost edge: only infra-* modules and index.ts may name it.
 * Use cases receive the `Kawaiko` port bag instead (see app-ports.ts), which is
 * what lets them run in a test with no Cloudflare runtime at all.
 */
export interface Env {
  // vars
  KAWAIKO_MODEL: string;
  POST_PROBABILITY: string;
  REPLY_PROBABILITY: string;
  RATE_LIMIT_PER_HOUR: string;
  RATE_LIMIT_PER_DAY: string;
  MONTHLY_BUDGET_USD: string;
  DISCORD_APPLICATION_ID: string;
  KAWAIKO_CHANNEL_ID: string;
  /** "false" turns off writing the observation log. */
  OBSERVE_MESSAGES?: string;

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
  /** One instance per Discord channel; scopes "forget this channel" to it. */
  CHANNEL_MEMORY: DurableObjectNamespace<ChannelMemory>;
  /**
   * Server-scoped long-term memory. Optional: until the D1 database is
   * provisioned and bound, kawaiko simply does not remember and everything
   * else keeps working.
   */
  DB?: D1Database;
}

/** Budget cap, defaulted. */
export function monthlyBudgetUsd(env: Env): number {
  return Number(env.MONTHLY_BUDGET_USD) || 100;
}
