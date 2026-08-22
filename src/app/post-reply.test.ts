import { describe, expect, it } from "vitest";
import { pickTargets, postRandomReply } from "./post-reply";
import { fakeKawaiko, message, FIXED_NOW } from "../testing/fakes";

const NOW = FIXED_NOW.epochMilliseconds;

describe("pickTargets", () => {
  const recent = "2026-08-21T13:40:00Z";

  it("takes recent human messages", () => {
    const targets = pickTargets([message({ id: "1", timestamp: recent })], {
      botId: "bot-1",
      now: NOW,
    });
    expect(targets.map((m) => m.id)).toEqual(["1"]);
  });

  it("leaves bots, blanks and stale messages alone", () => {
    const targets = pickTargets(
      [
        message({ id: "bot", isBot: true, timestamp: recent }),
        message({ id: "blank", content: "   ", timestamp: recent }),
        message({ id: "stale", timestamp: "2026-08-20T13:40:00Z" }),
        message({ id: "ok", timestamp: recent }),
      ],
      { botId: "bot-1", now: NOW },
    );
    expect(targets.map((m) => m.id)).toEqual(["ok"]);
  });

  it("does not double up on messages the gateway already answers", () => {
    const targets = pickTargets(
      [message({ id: "mention", content: "<@bot-1> ねえ", timestamp: recent })],
      { botId: "bot-1", now: NOW },
    );
    expect(targets).toEqual([]);
  });
});

describe("postRandomReply", () => {
  it("skips on the probability gate without spending anything", async () => {
    const kawaiko = fakeKawaiko({ replyProbability: "0", random: () => 0.5 });
    expect(await postRandomReply(kawaiko)).toEqual({ ok: true, skipped: "probability" });
    expect(kawaiko.generator.prompts).toHaveLength(0);
  });

  it("ignores the gate when forced", async () => {
    const kawaiko = fakeKawaiko({ replyProbability: "0" });
    kawaiko.chat.history = [message({ id: "1", timestamp: "2026-08-21T13:40:00Z" })];
    expect(await postRandomReply(kawaiko, { force: true })).toEqual({ ok: true });
  });

  it("says nothing when there is nobody to bother", async () => {
    const kawaiko = fakeKawaiko();
    expect(await postRandomReply(kawaiko)).toEqual({ ok: true });
    expect(kawaiko.chat.posted).toHaveLength(0);
  });

  it("barges in as a threaded reply and bills it", async () => {
    const kawaiko = fakeKawaiko();
    kawaiko.chat.history = [
      message({ id: "target", content: "眠い", timestamp: "2026-08-21T13:40:00Z" }),
    ];
    expect(await postRandomReply(kawaiko)).toEqual({ ok: true });

    expect(kawaiko.chat.posted).toEqual([
      { channelId: "home", text: "kawaiko の返事", replyTo: "target" },
    ]);
    expect(kawaiko.generator.prompts[0]).toContain("眠い");
    expect(kawaiko.spent).toEqual([0.001]);
    expect(kawaiko.finished).toEqual([{ kind: "reply", ok: true, error: undefined }]);
  });

  it("reports a failure rather than throwing at the cron", async () => {
    const kawaiko = fakeKawaiko();
    kawaiko.chat.history = [message({ id: "t", timestamp: "2026-08-21T13:40:00Z" })];
    kawaiko.generator.generate = async () => {
      throw new Error("model exploded");
    };
    const outcome = await postRandomReply(kawaiko);

    expect(outcome.ok).toBe(false);
    expect(kawaiko.finished[0]).toMatchObject({ kind: "reply", ok: false });
  });
});
