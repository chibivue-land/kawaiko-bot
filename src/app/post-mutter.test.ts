import { describe, expect, it } from "vitest";
import { postScheduledMutter } from "./post-mutter";
import { TOPIC_SEEDS } from "../domain/mutter";
import { fakeKawaiko, message } from "../testing/fakes";

describe("postScheduledMutter", () => {
  it("skips on the probability gate without spending anything", async () => {
    const kawaiko = fakeKawaiko({ mutterProbability: "0", random: () => 0.5 });
    expect(await postScheduledMutter(kawaiko)).toEqual({ ok: true, skipped: "probability" });
    expect(kawaiko.generator.prompts).toHaveLength(0);
  });

  it("skips when the budget is gone", async () => {
    const kawaiko = fakeKawaiko({
      budget: {
        async allows() {
          return { allowed: false, spentUsd: 200 };
        },
        async record() {},
        async finish() {},
      },
    });
    expect(await postScheduledMutter(kawaiko)).toEqual({ ok: true, skipped: "budget" });
  });

  it("posts into the home channel, unthreaded", async () => {
    const kawaiko = fakeKawaiko();
    expect(await postScheduledMutter(kawaiko)).toEqual({ ok: true });

    expect(kawaiko.chat.posted).toEqual([
      { channelId: "home", text: "kawaiko の返事", replyTo: undefined },
    ]);
    expect(kawaiko.generator.prompts[0]).toContain(TOPIC_SEEDS[0]!);
    expect(kawaiko.finished).toEqual([{ kind: "mutter", ok: true, error: undefined }]);
  });

  it("only fetches headlines for the news seed", async () => {
    let asked = 0;
    const kawaiko = fakeKawaiko({
      news: {
        async headlines() {
          asked++;
          return ["Vue 4 released"];
        },
      },
    });
    await postScheduledMutter(kawaiko);
    // random() === 0 picks the first seed, which is not the news one.
    expect(asked).toBe(0);
  });

  it("tells the model not to echo what it just muttered", async () => {
    const kawaiko = fakeKawaiko();
    kawaiko.chat.history = [
      message({
        id: "prev",
        authorId: "bot-1",
        authorLabel: "kawaiko",
        isBot: true,
        content: "また新しい JS フレームワークが生まれたらしい",
      }),
    ];
    await postScheduledMutter(kawaiko);
    expect(kawaiko.generator.prompts[0]).toContain("また新しい JS フレームワーク");
  });

  it("reports a failure rather than throwing at the cron", async () => {
    const kawaiko = fakeKawaiko();
    kawaiko.generator.generate = async () => {
      throw new Error("model exploded");
    };
    const outcome = await postScheduledMutter(kawaiko);

    expect(outcome.ok).toBe(false);
    expect(kawaiko.finished[0]).toMatchObject({ kind: "mutter", ok: false });
  });
});
