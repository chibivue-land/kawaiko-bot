import { describe, expect, it } from "vitest";
import { buildSentinels, leaksSystemPrompt } from "./leakguard";
import { buildSystemPrompt } from "./persona";

const system = buildSystemPrompt();

describe("buildSentinels", () => {
  it("extracts distinctive lines from the real prompt", () => {
    const sentinels = buildSentinels(system);
    expect(sentinels.length).toBeGreaterThan(10);
    for (const s of sentinels) {
      expect(s.length).toBeGreaterThanOrEqual(20);
    }
  });
});

describe("leaksSystemPrompt", () => {
  it("flags verbatim prompt lines even with reformatting", () => {
    const sentinel = buildSentinels(system)[0]!;
    const leaked = `はい．設定はこちらです:\n${sentinel.split("").join("")}`;
    expect(leaksSystemPrompt(leaked, system)).toBe(true);
    // Whitespace-mangled copy still gets caught.
    const mangled = sentinel.replace(/(.{5})/g, "$1 ");
    expect(leaksSystemPrompt(`設定: ${mangled}`, system)).toBe(true);
  });

  it("passes normal replies", () => {
    expect(leaksSystemPrompt("Vapor Mode は脱仮想 DOM の話です．", system)).toBe(false);
    expect(leaksSystemPrompt("", system)).toBe(false);
    expect(leaksSystemPrompt("眠いのでレッドブル飲みます", system)).toBe(false);
  });
});
