import { Temporal } from "temporal-polyfill";

/**
 * Time, for a bot that lives on JST.
 *
 * Everything goes through Temporal rather than Date: the old code carried its
 * own timezone arithmetic (`now + 9 * 3_600_000`, then read the UTC fields
 * back), which is the kind of thing that is silently wrong twice a year in
 * most of the world and merely unreadable here.
 *
 * The polyfill is imported in this one module and re-exported, because neither
 * workerd nor Node exposes Temporal natively yet (verified against workerd on
 * compatibility_date 2026-08-01: `Temporal is not defined`). When they do, this
 * import is the only line that has to change.
 */
export { Temporal };

/** kawaiko keeps Japan time. */
export const JST = "Asia/Tokyo";

/** Now, as an instant. The one place a use case may read the wall clock. */
export function nowInstant(): Temporal.Instant {
  return Temporal.Now.instant();
}

/**
 * Parse an ISO timestamp from an external system.
 * Temporal throws on malformed input where Date.parse quietly returned NaN;
 * callers here would rather have "unknown" than an exception.
 */
export function parseInstant(iso: string): Temporal.Instant | undefined {
  try {
    return Temporal.Instant.from(iso);
  } catch {
    return undefined;
  }
}

/** Epoch milliseconds of an ISO timestamp, or undefined when unparseable. */
export function epochMillis(iso: string): number | undefined {
  return parseInstant(iso)?.epochMilliseconds;
}

/** Instant from epoch milliseconds. */
export function instantFromMillis(millis: number): Temporal.Instant {
  return Temporal.Instant.fromEpochMilliseconds(millis);
}

/** Millisecond-precision ISO string, for logs and status payloads. */
export function isoStamp(instant: Temporal.Instant = nowInstant()): string {
  return instant.toString({ smallestUnit: "millisecond" });
}
