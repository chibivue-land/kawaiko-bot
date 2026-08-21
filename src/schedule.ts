/**
 * Hourly dispatch logic. The Workers Free plan caps cron triggers at 5 per
 * account, so instead of one cron per posting slot we run a single hourly
 * dispatcher and decide here (in JST) what kind of post this hour gets.
 * Probability gates are applied later by the mutter/replier modules.
 */

/** JST hours that get a mutter slot (~3/day after the probability gate). */
export const MUTTER_HOURS_JST: readonly number[] = [9, 13, 18, 23];

export type DispatchAction = "mutter" | "reply" | "learn";

/**
 * Mutter on designated hours, barge into someone's message every other hour,
 * and spend the remaining hours folding what was said into memory. The learning
 * pass costs nothing when the server was quiet — it needs a minimum number of
 * unread messages before it calls a model at all (see src/learn.ts).
 */
export function dispatchForHour(jstHour: number): DispatchAction {
  if (MUTTER_HOURS_JST.includes(jstHour)) return "mutter";
  if (jstHour % 2 === 0) return "reply";
  return "learn";
}

/** Current hour (0-23) in JST. */
export function jstHour(now: Date = new Date()): number {
  return new Date(now.getTime() + 9 * 3_600_000).getUTCHours();
}
