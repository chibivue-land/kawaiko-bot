import { describe, expect, it } from "vitest";
import { TOPIC_SEEDS, pickTopicSeed, shouldPost } from "../src/mutter";
import { clampMessage } from "../src/discord/api";
import { estimateCostUsd, monthKey } from "../src/ai/cost";
import {
  BUDGET_EXCEEDED_LINES,
  EMPTY_RESPONSE_LINES,
  ERROR_LINES,
  RATE_LIMITED_LINES,
  REFUSAL_LINES,
  pickLine,
} from "../src/lines";

describe("pickTopicSeed", () => {
  it("returns a seed from the list deterministically", () => {
    expect(pickTopicSeed(() => 0)).toBe(TOPIC_SEEDS[0]);
    expect(pickTopicSeed(() => 0.999_999)).toBe(TOPIC_SEEDS[TOPIC_SEEDS.length - 1]);
  });
});

describe("shouldPost", () => {
  it("respects the probability gate", () => {
    expect(shouldPost("0.75", () => 0.5)).toBe(true);
    expect(shouldPost("0.75", () => 0.9)).toBe(false);
    expect(shouldPost("0", () => 0.0001)).toBe(false);
    expect(shouldPost("1", () => 0.9999)).toBe(true);
  });

  it("defaults to posting when the value is not a number", () => {
    expect(shouldPost("banana", () => 0.99)).toBe(true);
  });
});

describe("clampMessage", () => {
  it("keeps short messages untouched", () => {
    expect(clampMessage("短い")).toBe("短い");
  });

  it("clamps to below Discord's 2000-char limit", () => {
    const long = "あ".repeat(3000);
    const clamped = clampMessage(long);
    expect(clamped.length).toBeLessThanOrEqual(2000);
    expect(clamped.endsWith("…")).toBe(true);
  });
});

describe("estimateCostUsd", () => {
  it("estimates gemini 3.7 flash pricing, billing thinking as output", () => {
    const cost = estimateCostUsd("gemini-3.7-flash", {
      total_input_tokens: 1_000_000,
      total_output_tokens: 500_000,
      total_thought_tokens: 500_000,
    });
    // $0.75 input + $3.75 output (0.5M text + 0.5M thought)
    expect(cost).toBeCloseTo(4.5, 5);
  });

  it("prefers the longest model-prefix match", () => {
    const cost = estimateCostUsd("gemini-3.5-flash-lite", {
      total_input_tokens: 1_000_000,
    });
    // -lite rate ($0.10), not the 3.5-flash rate ($1.50)
    expect(cost).toBeCloseTo(0.1, 5);
  });

  it("falls back to a conservative rate for unknown models", () => {
    const cost = estimateCostUsd("gemini-99-ultra", {
      total_input_tokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(2, 5);
  });
});

describe("monthKey", () => {
  it("formats the UTC month", () => {
    expect(monthKey(new Date("2026-08-21T00:00:00Z"))).toBe("2026-08");
    expect(monthKey(new Date("2026-01-02T00:00:00Z"))).toBe("2026-01");
  });
});

describe("pickLine", () => {
  it("substitutes retry minutes", () => {
    const line = pickLine(["{m}分待って"], { minutes: 12 });
    expect(line).toBe("12分待って");
  });

  it("has plenty of variation in every canned pool", () => {
    expect(RATE_LIMITED_LINES.length).toBeGreaterThanOrEqual(8);
    expect(BUDGET_EXCEEDED_LINES.length).toBeGreaterThanOrEqual(5);
    expect(ERROR_LINES.length).toBeGreaterThanOrEqual(5);
    expect(REFUSAL_LINES.length).toBeGreaterThanOrEqual(3);
    expect(EMPTY_RESPONSE_LINES.length).toBeGreaterThanOrEqual(3);
  });
});
