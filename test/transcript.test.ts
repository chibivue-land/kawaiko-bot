import { describe, expect, it } from "vitest";
import { buildTranscript } from "../src/discord/transcript";
import type { ChannelMessage } from "../src/discord/api";

const BOT_ID = "111";

function msg(id: string, authorId: string, content: string, name?: string): ChannelMessage {
  return {
    id,
    content,
    timestamp: "2026-08-21T13:00:00Z",
    author: { id: authorId, username: name ?? `user${authorId}` },
  };
}

describe("buildTranscript", () => {
  it("renders oldest-first with the bot labeled kawaiko", () => {
    // Discord API returns newest first.
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
    const messages = [msg("1", "222", "あ".repeat(500))];
    const line = buildTranscript(messages, { botId: BOT_ID });
    expect(line.length).toBeLessThan(200);
  });
});
