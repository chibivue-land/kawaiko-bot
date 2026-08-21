import { describe, expect, it } from "vitest";
import { isExplicitMention, stripBotMention } from "../src/discord/mention";

const APP_ID = "123456789";

describe("isExplicitMention", () => {
  it("detects mentions via the mentions array", () => {
    expect(isExplicitMention(APP_ID, "やあ", [{ id: APP_ID }])).toBe(true);
    expect(isExplicitMention(APP_ID, "やあ", [{ id: "999" }])).toBe(false);
  });

  it("detects raw mention tags in content", () => {
    expect(isExplicitMention(APP_ID, `<@${APP_ID}> こんにちは`, undefined)).toBe(true);
    expect(isExplicitMention(APP_ID, `<@!${APP_ID}> こんにちは`, undefined)).toBe(true);
  });

  it("ignores unrelated messages", () => {
    expect(isExplicitMention(APP_ID, "kawaiko という文字列だけ", undefined)).toBe(false);
    expect(isExplicitMention(APP_ID, "@everyone", [])).toBe(false);
  });
});

describe("stripBotMention", () => {
  it("removes mention tags and squashes whitespace", () => {
    expect(stripBotMention(APP_ID, `<@${APP_ID}>  Vapor Mode って何`)).toBe("Vapor Mode って何");
    expect(stripBotMention(APP_ID, `おい <@!${APP_ID}> 起きて`)).toBe("おい 起きて");
  });

  it("returns empty string for mention-only messages", () => {
    expect(stripBotMention(APP_ID, `<@${APP_ID}>`)).toBe("");
  });
});
