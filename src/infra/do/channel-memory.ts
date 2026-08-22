import { DurableObject } from "cloudflare:workers";
import { nowInstant } from "../../domain/time";

/**
 * Per-channel conversation marker. One instance per channel via
 * idFromName(discordChannelId).
 *
 * kawaiko keeps no stored conversation state: its short-term "memory" is
 * whatever the channel transcript happens to say. Resetting a channel therefore
 * means agreeing to ignore everything posted before a point in time. Because
 * the instance is keyed by channel id, a reset in one channel is completely
 * invisible to every other channel — and to the server-wide long-term memory,
 * which lives in D1 and is untouched by this.
 */
export class ChannelMemory extends DurableObject {
  /** Ignore everything posted before `at` (epoch ms). */
  async reset(at: number = nowInstant().epochMilliseconds): Promise<number> {
    await this.ctx.storage.put("resetAt", at);
    return at;
  }

  /** Epoch ms before which this channel's history is ignored (0 = never reset). */
  async resetAt(): Promise<number> {
    return (await this.ctx.storage.get<number>("resetAt")) ?? 0;
  }
}
