import { describe, expect, it } from "vitest";
import {
  REPLY_ANGLES,
  REPLY_LENGTHS,
  VARIETY_RULES,
  buildSystemPrompt,
  pickReplyAngle,
  pickReplyLength,
} from "./persona";

describe("buildSystemPrompt", () => {
  const prompt = buildSystemPrompt();

  it("enforces the kawaiko first-person rule", () => {
    expect(prompt).toContain("一人称は必ず「kawaiko」");
  });

  it("substitutes the persona corpus into the template", () => {
    expect(prompt).toContain("文体の特徴");
    expect(prompt).toContain("口癖");
    // The slot must actually be filled, not shipped as a literal.
    expect(prompt).not.toContain("{{corpus}}");
  });

  it("keeps the misanthropy fictional and unaimed", () => {
    expect(prompt).toContain("人類");
    expect(prompt).toContain("攻撃や差別");
  });

  it("asks for deliberately uneven length", () => {
    expect(prompt).toContain("毎回同じ分量に収束させない");
  });
});

describe("delivery dials", () => {
  it("picks angles across the whole list", () => {
    expect(pickReplyAngle(() => 0)).toBe(REPLY_ANGLES[0]);
    expect(pickReplyAngle(() => 0.999_999)).toBe(REPLY_ANGLES[REPLY_ANGLES.length - 1]);
  });

  it("weights length toward short but still reaches the long end", () => {
    expect(pickReplyLength(() => 0)).toBe(REPLY_LENGTHS[0]!.hint);
    expect(pickReplyLength(() => 0.999_999)).toBe(REPLY_LENGTHS[REPLY_LENGTHS.length - 1]!.hint);
  });

  it("offers enough shapes that a channel cannot settle into one", () => {
    expect(REPLY_ANGLES.length).toBeGreaterThanOrEqual(10);
    expect(new Set(REPLY_ANGLES).size).toBe(REPLY_ANGLES.length);
  });

  it("keeps the short end common and the long end rare", () => {
    const weight = (hint: string) => REPLY_LENGTHS.find((l) => l.hint === hint)!.weight;
    const shortest = REPLY_LENGTHS[0]!;
    const longest = REPLY_LENGTHS[REPLY_LENGTHS.length - 1]!;
    expect(weight(shortest.hint)).toBeGreaterThan(weight(longest.hint));
  });
});

describe("VARIETY_RULES", () => {
  it("scopes variation to delivery, never to character", () => {
    expect(VARIETY_RULES).toContain("キャラは絶対に変えない");
    expect(VARIETY_RULES).toContain("書き出し");
  });
});
