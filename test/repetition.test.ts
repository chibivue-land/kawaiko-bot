import { describe, expect, it } from "vitest";
import {
  AVOID_LIMIT,
  buildAvoidBlock,
  isRepetitive,
  normalizeLine,
  repetitionScore,
} from "../src/repetition";
import { isResetCommand } from "../src/commands";
import {
  REPLY_ANGLES,
  REPLY_LENGTHS,
  buildDeliveryBlock,
  pickReplyAngle,
  pickReplyLength,
} from "../src/persona";

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

describe("buildAvoidBlock", () => {
  it("is empty when kawaiko has not said anything yet", () => {
    expect(buildAvoidBlock([])).toBe("");
    expect(buildAvoidBlock(["  "])).toBe("");
  });

  it("lists past lines and caps the count", () => {
    const block = buildAvoidBlock(Array.from({ length: 20 }, (_, i) => `発言${i}`));
    expect(block).toContain("発言0");
    expect(block.split("\n- ").length - 1).toBe(AVOID_LIMIT);
  });
});

describe("isResetCommand", () => {
  it("matches the documented commands", () => {
    for (const cmd of ["reset", "/reset", "RESET", "リセット", "忘れて", "記憶リセット"]) {
      expect(isResetCommand(cmd), cmd).toBe(true);
    }
  });

  it("tolerates trailing punctuation and quotes", () => {
    expect(isResetCommand("  リセット！ ")).toBe(true);
    expect(isResetCommand("「reset」")).toBe(true);
  });

  it("does not swallow ordinary chat", () => {
    for (const text of [
      "さっきの話は忘れてもらっていいですか",
      "reset ってどういう意味ですか",
      "リセットしたほうがいい?",
      "",
    ]) {
      expect(isResetCommand(text), text).toBe(false);
    }
  });
});

describe("delivery variation", () => {
  it("picks angles across the whole list", () => {
    expect(pickReplyAngle(() => 0)).toBe(REPLY_ANGLES[0]);
    expect(pickReplyAngle(() => 0.999_999)).toBe(REPLY_ANGLES[REPLY_ANGLES.length - 1]);
  });

  it("weights the length dial toward short but reaches the long end", () => {
    expect(pickReplyLength(() => 0)).toBe(REPLY_LENGTHS[0]!.hint);
    expect(pickReplyLength(() => 0.999_999)).toBe(REPLY_LENGTHS[REPLY_LENGTHS.length - 1]!.hint);
  });

  it("renders both dials into the prompt block", () => {
    const block = buildDeliveryBlock(() => 0);
    expect(block).toContain(REPLY_ANGLES[0]);
    expect(block).toContain(REPLY_LENGTHS[0]!.hint);
  });
});
