import { describe, expect, it } from "vitest";
import { isRepetitive, normalizeLine, repetitionScore } from "./repetition";

describe("normalizeLine", () => {
  it("drops the leading 〇〇さん address so templates line up", () => {
    expect(normalizeLine("ubugeeei さん，それはあまりに雑です")).toBe("それはあまりに雑です");
    expect(normalizeLine("kazupon さん、それはあまりに雑です")).toBe("それはあまりに雑です");
  });

  it("does not eat words that merely start with さん", () => {
    expect(normalizeLine("さんまが好きです")).toBe("さんまが好きです");
  });

  it("strips mentions, links and punctuation", () => {
    expect(normalizeLine("<@123> はい．https://example.com 🦆")).toBe("はい");
  });
});

describe("repetitionScore", () => {
  // The exact shape a channel got stuck on: same skeleton, rotating name.
  const stuck = [
    "ubugeeei さん，それはあまりに雑な質問ですね",
    "kazupon さん，それはあまりに筋が悪いです",
  ];

  it("flags the same skeleton with a different name and tail", () => {
    expect(isRepetitive("yamanoku さん，それはあまりに浅いです", stuck)).toBe(true);
  });

  it("scores an exact repeat as 1", () => {
    expect(repetitionScore("kazupon さん，それはあまりに筋が悪いです", stuck)).toBe(1);
  });

  it("lets a genuinely different reply through", () => {
    expect(isRepetitive("Vapor Mode の話なら朝まで喋れます (誰も聞いていない)", stuck)).toBe(false);
    expect(isRepetitive("眠いです．レッドブルが切れました．", stuck)).toBe(false);
  });

  it("ignores very short lines instead of false-flagging them", () => {
    expect(isRepetitive("はい．", ["すごい"])).toBe(false);
  });

  it("returns 0 when there is nothing to compare against", () => {
    expect(repetitionScore("なんでもよい", [])).toBe(0);
  });
});
