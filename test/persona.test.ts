import { describe, expect, it } from "vitest";
import { buildSystemPrompt, jstNowLabel } from "../src/persona";

describe("buildSystemPrompt", () => {
  it("enforces the kawaiko first-person rule", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("一人称は必ず「kawaiko」");
  });

  it("embeds the persona corpus", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("文体の特徴");
    expect(prompt).toContain("口癖");
  });

  it("keeps the misanthropy fictional and unaimed", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("人類");
    expect(prompt).toContain("攻撃や差別");
  });
});

describe("jstNowLabel", () => {
  it("formats UTC time as JST", () => {
    // 2026-08-21T13:50:00Z -> 22:50 JST same day (Friday)
    const label = jstNowLabel(new Date("2026-08-21T13:50:00Z"));
    expect(label).toBe("8月21日(金) 22:50");
  });

  it("rolls over the date across midnight JST", () => {
    // 2026-08-21T16:30:00Z -> 2026-08-22 01:30 JST (Saturday)
    const label = jstNowLabel(new Date("2026-08-21T16:30:00Z"));
    expect(label).toBe("8月22日(土) 1:30");
  });
});
