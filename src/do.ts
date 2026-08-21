import { DurableObject } from "cloudflare:workers";
import { monthKey } from "./ai/cost";

export interface RateLimitDecision {
  allowed: boolean;
  /** When blocked: approximate minutes until the next window opens. */
  retryAfterMinutes?: number;
}

/**
 * Per-Discord-user rate limiter.
 * One instance per user via idFromName(discordUserId).
 * Keeps fixed-window (hourly/daily) counters in SQLite-backed storage.
 */
export class UserRateLimiter extends DurableObject {
  async checkAndIncrement(perHour: number, perDay: number): Promise<RateLimitDecision> {
    const now = Date.now();
    const hourWindow = Math.floor(now / 3_600_000);
    const dayWindow = Math.floor(now / 86_400_000);

    const stored = await this.ctx.storage.get<{
      hourWindow: number;
      hourCount: number;
      dayWindow: number;
      dayCount: number;
    }>("counters");

    const state = {
      hourWindow,
      hourCount: stored?.hourWindow === hourWindow ? stored.hourCount : 0,
      dayWindow,
      dayCount: stored?.dayWindow === dayWindow ? stored.dayCount : 0,
    };

    if (state.dayCount >= perDay) {
      const minutes = Math.ceil(((dayWindow + 1) * 86_400_000 - now) / 60_000);
      return { allowed: false, retryAfterMinutes: minutes };
    }
    if (state.hourCount >= perHour) {
      const minutes = Math.ceil(((hourWindow + 1) * 3_600_000 - now) / 60_000);
      return { allowed: false, retryAfterMinutes: minutes };
    }

    state.hourCount++;
    state.dayCount++;
    await this.ctx.storage.put("counters", state);
    return { allowed: true };
  }
}

/**
 * Monthly estimated-cost tracker (singleton via idFromName("global")).
 * Soft code-side guard that stops generation once MONTHLY_BUDGET_USD is exceeded.
 */
export class BudgetTracker extends DurableObject {
  async checkBudget(budgetUsd: number): Promise<{ allowed: boolean; spentUsd: number }> {
    const spentUsd = (await this.ctx.storage.get<number>(`spent:${monthKey()}`)) ?? 0;
    return { allowed: spentUsd < budgetUsd, spentUsd };
  }

  async recordSpend(costUsd: number): Promise<void> {
    const key = `spent:${monthKey()}`;
    const spent = (await this.ctx.storage.get<number>(key)) ?? 0;
    await this.ctx.storage.put(key, spent + costUsd);
  }
}
