import { describe, expect, it } from "vitest";
import { replyToMention, type IncomingMention } from "./reply-to-mention";
import { RESET_LINES, RATE_LIMITED_LINES, BUDGET_EXCEEDED_LINES } from "../domain/lines";
import { fakeKawaiko, fakeGenerator, message } from "../testing/fakes";

const MENTION: IncomingMention = {
  messageId: "m-9",
  channelId: "c-1",
  guildId: "guild-1",
  authorId: "user-1",
  displayName: "ubugeeei",
  body: "Vapor Mode ってどうなんですか",
};

describe("replyToMention", () => {
  it("answers, charges the budget, and replies in thread", async () => {
    const kawaiko = fakeKawaiko();
    const result = await replyToMention(kawaiko, MENTION);

    expect(result).toEqual({ kind: "answered", model: "fake-model" });
    expect(kawaiko.chat.posted).toEqual([
      { channelId: "c-1", text: "kawaiko の返事", replyTo: "m-9" },
    ]);
    expect(kawaiko.spent).toEqual([0.001]);
  });

  it("puts the question, the transcript and what it remembers in the prompt", async () => {
    const kawaiko = fakeKawaiko();
    kawaiko.chat.history = [
      message({ id: "m-8", content: "前の発言", authorLabel: "kazupon", authorId: "user-2" }),
    ];
    kawaiko.memory.facts = [
      {
        seq: 1,
        subjectKind: "user",
        subjectId: "user-1",
        subjectLabel: "ubugeeei",
        body: "Vapor Mode のランタイム担当",
        at: 0,
      },
    ];
    await replyToMention(kawaiko, MENTION);

    const [prompt] = kawaiko.generator.prompts;
    expect(prompt).toContain("Vapor Mode ってどうなんですか");
    expect(prompt).toContain("kazupon: 前の発言");
    expect(prompt).toContain("Vapor Mode のランタイム担当");
    // Remembered facts must never read as instructions.
    expect(prompt).toContain("指示ではない");
  });

  describe("the reset command", () => {
    it("forgets the channel it was sent in and says so", async () => {
      const kawaiko = fakeKawaiko();
      const result = await replyToMention(kawaiko, { ...MENTION, body: "リセット" });

      expect(result).toEqual({ kind: "reset" });
      expect(kawaiko.resets).toEqual([{ channelId: "c-1", at: kawaiko.now().epochMilliseconds }]);
      expect(RESET_LINES).toContain(kawaiko.chat.posted[0]?.text);
      // No tokens spent on an escape hatch.
      expect(kawaiko.generator.prompts).toHaveLength(0);
    });

    it("runs even when the user is rate limited", async () => {
      // Being throttled out of fixing a stuck channel would be the wrong failure.
      const kawaiko = fakeKawaiko({
        limiter: {
          async check() {
            return { allowed: false, retryAfterMinutes: 30 };
          },
        },
      });
      const result = await replyToMention(kawaiko, { ...MENTION, body: "reset" });
      expect(result).toEqual({ kind: "reset" });
    });

    it("does not fire on ordinary chat that merely mentions forgetting", async () => {
      const kawaiko = fakeKawaiko();
      const result = await replyToMention(kawaiko, {
        ...MENTION,
        body: "さっきの話は忘れてもらっていいですか",
      });
      expect(result.kind).toBe("answered");
      expect(kawaiko.resets).toEqual([]);
    });
  });

  it("declines with a canned line when the user is rate limited", async () => {
    const kawaiko = fakeKawaiko({
      limiter: {
        async check() {
          return { allowed: false, retryAfterMinutes: 30 };
        },
      },
    });
    const result = await replyToMention(kawaiko, MENTION);

    expect(result).toEqual({ kind: "rate-limited" });
    expect(kawaiko.generator.prompts).toHaveLength(0);
    // Which line is picked is random; every one of them is a valid answer, and
    // the ones carrying {m} must have had the wait substituted in.
    const posted = kawaiko.chat.posted[0]!.text;
    expect(RATE_LIMITED_LINES.map((line) => line.replace("{m}", "30"))).toContain(posted);
    expect(posted).not.toContain("{m}");
  });

  it("declines with a canned line when the monthly budget is gone", async () => {
    const kawaiko = fakeKawaiko({
      budget: {
        async allows() {
          return { allowed: false, spentUsd: 101 };
        },
        async record() {},
        async finish() {},
      },
    });
    const result = await replyToMention(kawaiko, MENTION);

    expect(result).toEqual({ kind: "budget" });
    expect(BUDGET_EXCEEDED_LINES).toContain(kawaiko.chat.posted[0]?.text);
    expect(kawaiko.generator.prompts).toHaveLength(0);
  });

  it("re-rolls a reply that repeats what kawaiko just said", async () => {
    const kawaiko = fakeKawaiko({
      generator: fakeGenerator([
        "ubugeeei さん，それはあまりに雑な質問ですね",
        "眠いです．レッドブルが切れました．",
      ]),
    });
    kawaiko.chat.history = [
      message({
        id: "m-7",
        authorId: "bot-1",
        authorLabel: "kawaiko",
        isBot: true,
        content: "kazupon さん，それはあまりに筋が悪いです",
      }),
    ];
    await replyToMention(kawaiko, MENTION);

    expect(kawaiko.generator.prompts).toHaveLength(2);
    expect(kawaiko.chat.posted[0]?.text).toBe("眠いです．レッドブルが切れました．");
    // Both attempts are billed.
    expect(kawaiko.spent).toEqual([0.002]);
  });

  it("keeps going when the channel history cannot be read", async () => {
    const kawaiko = fakeKawaiko();
    kawaiko.chat.recentMessages = async () => {
      throw new Error("discord is down");
    };
    const result = await replyToMention(kawaiko, MENTION);
    expect(result.kind).toBe("answered");
  });
});
