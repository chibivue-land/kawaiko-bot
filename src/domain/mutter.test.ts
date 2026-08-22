import { describe, expect, it } from "vitest";
import { TOPIC_SEEDS, buildMutterPrompt, pickTopicSeed, seedWantsNews, shouldPost } from "./mutter";

describe("pickTopicSeed", () => {
  it("returns a seed from the list deterministically", () => {
    expect(pickTopicSeed(() => 0)).toBe(TOPIC_SEEDS[0]);
    expect(pickTopicSeed(() => 0.999_999)).toBe(TOPIC_SEEDS[TOPIC_SEEDS.length - 1]);
  });

  it("offers enough seeds to keep the channel from repeating itself", () => {
    expect(TOPIC_SEEDS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(TOPIC_SEEDS).size).toBe(TOPIC_SEEDS.length);
  });
});

describe("seedWantsNews", () => {
  it("only pulls headlines for the news seed", () => {
    expect(TOPIC_SEEDS.filter(seedWantsNews)).toHaveLength(1);
    expect(seedWantsNews("眠気の話")).toBe(false);
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

describe("buildMutterPrompt", () => {
  const base = {
    nowLabel: "8月21日(金) 22:50",
    seed: TOPIC_SEEDS[0]!,
    headlines: [] as string[],
    facts: [],
    ownLines: [] as string[],
    random: () => 0,
  };

  it("carries the seed, the tone and a length dial", () => {
    const prompt = buildMutterPrompt(base);
    expect(prompt).toContain(TOPIC_SEEDS[0]!);
    expect(prompt).toContain("ネタツイ風");
    expect(prompt).toContain("今回の長さ");
  });

  it("includes headlines only when there are some", () => {
    expect(buildMutterPrompt(base)).not.toContain("直近のニュース見出し");
    expect(buildMutterPrompt({ ...base, headlines: ["Vue 4 released"] })).toContain(
      "- Vue 4 released",
    );
  });

  it("tells kawaiko what not to echo", () => {
    const prompt = buildMutterPrompt({ ...base, ownLines: ["さっき言ったこと"] });
    expect(prompt).toContain("さっき言ったこと");
    expect(prompt).toContain("コピーするのは禁止");
  });
});
