import { describe, expect, it } from "vitest";
import { buildTranscript, collectOwnLines, sinceReset } from "./transcript";
import type { ChatMessage } from "./message";

const BOT_ID = "bot-1";

function msg(
  id: string,
  authorId: string,
  content: string,
  label = `user${authorId}`,
  timestamp = "2026-08-21T13:00:00Z",
): ChatMessage {
  return { id, content, timestamp, authorId, authorLabel: label, isBot: authorId === BOT_ID };
}

describe("buildTranscript", () => {
  it("renders oldest-first with the bot labeled kawaiko", () => {
    // Chat APIs return newest first.
    const messages = [
      msg("3", "222", "続きの質問", "ubugeeei"),
      msg("2", BOT_ID, "kawaiko の返事"),
      msg("1", "222", "最初の質問", "ubugeeei"),
    ];
    expect(buildTranscript(messages, { botId: BOT_ID })).toBe(
      "ubugeeei: 最初の質問\nkawaiko: kawaiko の返事\nubugeeei: 続きの質問",
    );
  });

  it("excludes the triggering message and empty ones", () => {
    const messages = [
      msg("3", "222", "いま来たやつ"),
      msg("2", "222", "  "),
      msg("1", "222", "前の発言"),
    ];
    expect(buildTranscript(messages, { botId: BOT_ID, excludeId: "3" })).toBe("user222: 前の発言");
  });

  it("caps message length", () => {
    expect(
      buildTranscript([msg("1", "222", "あ".repeat(500))], { botId: BOT_ID }).length,
    ).toBeLessThan(200);
  });

  it("keeps only the newest of kawaiko's near-duplicate lines", () => {
    // The exact failure mode: every bot line the same shape, which the model
    // then reads back as a few-shot template.
    const messages = [
      msg("5", BOT_ID, "yamanoku さん，それはあまりに浅いです"),
      msg("4", "222", "三番目"),
      msg("3", BOT_ID, "kazupon さん，それはあまりに筋が悪いです"),
      msg("2", "222", "二番目"),
      msg("1", BOT_ID, "ubugeeei さん，それはあまりに雑な質問ですね"),
    ];
    const transcript = buildTranscript(messages, { botId: BOT_ID });

    expect(transcript.match(/kawaiko:/g)).toHaveLength(1);
    expect(transcript).toContain("yamanoku さん，それはあまりに浅いです");
    // Human turns are never dropped, even when the bot's replies collapse.
    expect(transcript).toContain("二番目");
    expect(transcript).toContain("三番目");
  });

  it("keeps distinct kawaiko lines so a game in progress survives", () => {
    const messages = [
      msg("3", BOT_ID, "じゃあ次は「ごりら」です"),
      msg("2", "222", "しりとりしよう"),
      msg("1", BOT_ID, "眠いです．レッドブルが切れました．"),
    ];
    expect(buildTranscript(messages, { botId: BOT_ID }).match(/kawaiko:/g)).toHaveLength(2);
  });
});

describe("collectOwnLines", () => {
  it("returns kawaiko's own recent lines, newest first", () => {
    const messages = [
      msg("3", BOT_ID, "新しい方"),
      msg("2", "222", "人間の発言"),
      msg("1", BOT_ID, "古い方"),
    ];
    expect(collectOwnLines(messages, BOT_ID)).toEqual(["新しい方", "古い方"]);
  });

  it("respects the limit and skips empty lines", () => {
    const messages = [msg("3", BOT_ID, "a"), msg("2", BOT_ID, "   "), msg("1", BOT_ID, "b")];
    expect(collectOwnLines(messages, BOT_ID, 1)).toEqual(["a"]);
  });
});

describe("sinceReset", () => {
  const messages = [
    msg("3", "222", "リセット後", "u", "2026-08-21T13:00:00Z"),
    msg("2", "222", "リセット前", "u", "2026-08-21T11:00:00Z"),
  ];

  it("passes everything through when the channel was never reset", () => {
    expect(sinceReset(messages, 0)).toHaveLength(2);
  });

  it("drops everything posted before the marker", () => {
    const cutoff = Date.UTC(2026, 7, 21, 12);
    expect(sinceReset(messages, cutoff).map((m) => m.content)).toEqual(["リセット後"]);
  });

  it("treats an unparseable timestamp as older than any marker", () => {
    const broken = [msg("9", "222", "壊れた", "u", "not-a-timestamp")];
    expect(sinceReset(broken, 1)).toEqual([]);
  });
});
