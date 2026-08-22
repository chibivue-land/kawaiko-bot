import { describe, expect, it } from "vitest";
import { estimateCostUsd, monthKey } from "./cost";
import { clampMessage } from "../discord/api";
import { Temporal } from "../../domain/time";

describe("estimateCostUsd", () => {
  it("bills thinking tokens at the output rate", () => {
    const cost = estimateCostUsd("gemini-3.7-flash", {
      total_input_tokens: 1_000_000,
      total_output_tokens: 500_000,
      total_thought_tokens: 500_000,
    });
    // $0.75 input + $3.75 output (0.5M text + 0.5M thought)
    expect(cost).toBeCloseTo(4.5, 5);
  });

  it("prefers the longest model-prefix match", () => {
    // -lite rate ($0.10), not the 3.5-flash rate ($1.50)
    expect(estimateCostUsd("gemini-3.5-flash-lite", { total_input_tokens: 1_000_000 })).toBeCloseTo(
      0.1,
      5,
    );
  });

  it("falls back to a conservative rate for unknown models", () => {
    expect(estimateCostUsd("gemini-99-ultra", { total_input_tokens: 1_000_000 })).toBeCloseTo(2, 5);
  });

  it("discounts cached input", () => {
    const cost = estimateCostUsd("gemini-3.5-flash-lite", {
      total_input_tokens: 1_000_000,
      total_cached_tokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(0.01, 5);
  });
});

describe("monthKey", () => {
  it("buckets by UTC month", () => {
    expect(monthKey(Temporal.Instant.from("2026-08-21T00:00:00Z"))).toBe("2026-08");
    expect(monthKey(Temporal.Instant.from("2026-01-02T00:00:00Z"))).toBe("2026-01");
  });

  it("does not roll over early for JST-evening instants", () => {
    // 2026-08-31T23:00Z is already September in Tokyo; the budget bucket is UTC.
    expect(monthKey(Temporal.Instant.from("2026-08-31T23:00:00Z"))).toBe("2026-08");
  });
});

describe("clampMessage", () => {
  it("keeps short messages untouched", () => {
    expect(clampMessage("短い")).toBe("短い");
  });

  it("clamps below Discord's 2000-char limit", () => {
    const clamped = clampMessage("あ".repeat(3000));
    expect(clamped.length).toBeLessThanOrEqual(2000);
    expect(clamped.endsWith("…")).toBe(true);
  });
});
