import { describe, expect, it } from "vitest";
import { isExplicitMention, stripBotMention } from "./message";

const BOT_ID = "1540328713248440390";

describe("isExplicitMention", () => {
  it("matches the mentions array", () => {
    expect(isExplicitMention(BOT_ID, "hi", [BOT_ID])).toBe(true);
    expect(isExplicitMention(BOT_ID, "hi", ["999"])).toBe(false);
  });

  it("matches raw mention tags, nickname form included", () => {
    expect(isExplicitMention(BOT_ID, `<@${BOT_ID}> hi`, undefined)).toBe(true);
    expect(isExplicitMention(BOT_ID, `<@!${BOT_ID}> hi`, undefined)).toBe(true);
  });

  it("ignores @everyone and unrelated mentions", () => {
    expect(isExplicitMention(BOT_ID, "@everyone hi", [])).toBe(false);
    expect(isExplicitMention(BOT_ID, "<@999> hi", [])).toBe(false);
  });
});

describe("stripBotMention", () => {
  it("removes the bot's own tags and collapses whitespace", () => {
    expect(stripBotMention(BOT_ID, `<@${BOT_ID}>  こんにちは   kawaiko `)).toBe(
      "こんにちは kawaiko",
    );
    expect(stripBotMention(BOT_ID, `<@!${BOT_ID}>元気?`)).toBe("元気?");
  });

  it("leaves other people's mentions intact", () => {
    expect(stripBotMention(BOT_ID, `<@${BOT_ID}> <@999> みて`)).toBe("<@999> みて");
  });
});
