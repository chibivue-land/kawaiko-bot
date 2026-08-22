import { DurableObject } from "cloudflare:workers";
import type { RateLimitDecision } from "../../app/ports";
import { nowInstant } from "../../domain/time";

/**
 * Per-user rate limiter. One instance per user via idFromName(discordUserId),
 * holding fixed-window (hourly/daily) counters in SQLite-backed storage.
 */
export class UserRateLimiter extends DurableObject {
  async checkAndIncrement(perHour: number, perDay: number): Promise<RateLimitDecision> {
    const now = nowInstant().epochMilliseconds;
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
      return {
        allowed: false,
        retryAfterMinutes: Math.ceil(((dayWindow + 1) * 86_400_000 - now) / 60_000),
      };
    }
    if (state.hourCount >= perHour) {
      return {
        allowed: false,
        retryAfterMinutes: Math.ceil(((hourWindow + 1) * 3_600_000 - now) / 60_000),
      };
    }

    state.hourCount++;
    state.dayCount++;
    await this.ctx.storage.put("counters", state);
    return { allowed: true };
  }
}
