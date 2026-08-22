import { describe, expect, it } from "vitest";
import {
  BUDGET_EXCEEDED_LINES,
  EMPTY_RESPONSE_LINES,
  ERROR_LINES,
  LEAK_DEFLECTION_LINES,
  RATE_LIMITED_LINES,
  REFUSAL_LINES,
  REPETITION_BREAK_LINES,
  RESET_LINES,
  pickLine,
} from "./lines";

const POOLS = {
  RATE_LIMITED_LINES,
  BUDGET_EXCEEDED_LINES,
  ERROR_LINES,
  REFUSAL_LINES,
  EMPTY_RESPONSE_LINES,
  REPETITION_BREAK_LINES,
  RESET_LINES,
  LEAK_DEFLECTION_LINES,
};

describe("pickLine", () => {
  it("substitutes retry minutes", () => {
    expect(pickLine(["{m}分待って"], { minutes: 12 })).toBe("12分待って");
  });

  it("defaults the retry hint when none is given", () => {
    expect(pickLine(["{m}分待って"])).toBe("60分待って");
  });

  it("spans the pool", () => {
    const pool = ["a", "b", "c"];
    expect(pickLine(pool, undefined, () => 0)).toBe("a");
    expect(pickLine(pool, undefined, () => 0.999_999)).toBe("c");
  });
});

describe("canned line pools", () => {
  it("carry enough variation that repeated hits do not feel robotic", () => {
    for (const [name, pool] of Object.entries(POOLS)) {
      expect(pool.length, name).toBeGreaterThanOrEqual(4);
      expect(new Set(pool).size, name).toBe(pool.length);
    }
  });

  it("stay in character: kawaiko never says 私 or 僕", () => {
    for (const [name, pool] of Object.entries(POOLS)) {
      for (const line of pool) {
        expect(line, `${name}: ${line}`).not.toMatch(/[私僕俺]/);
      }
    }
  });

  it("only the rate-limit pool uses the minutes placeholder", () => {
    for (const [name, pool] of Object.entries(POOLS)) {
      if (name === "RATE_LIMITED_LINES") continue;
      expect(
        pool.some((line) => line.includes("{m}")),
        name,
      ).toBe(false);
    }
  });
});
