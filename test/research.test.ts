import { describe, expect, it } from "vitest";
import { needsResearch, stripHtml } from "../src/research";

describe("needsResearch", () => {
  it("detects question-like messages", () => {
    expect(needsResearch("Vapor Mode って何？")).toBe(true);
    expect(needsResearch("Vue の最新リリースについて教えて")).toBe(true);
    expect(needsResearch("Rust と Zig の比較どう思う")).toBe(true);
    expect(needsResearch("what is Vite?")).toBe(true);
  });

  it("ignores plain chatter", () => {
    expect(needsResearch("おはよう")).toBe(false);
    expect(needsResearch("進捗ないです")).toBe(false);
  });
});

describe("stripHtml", () => {
  it("strips tags and entities", () => {
    expect(stripHtml('<b>Vue</b> &amp; <a href="x">Vite</a>')).toBe("Vue & Vite");
    expect(stripHtml("a\n  b\t c")).toBe("a b c");
  });
});

describe("extractSearchQuery", () => {
  it("extracts the subject from do-you-know questions", async () => {
    const { extractSearchQuery } = await import("../src/research");
    expect(extractSearchQuery("からころのこと知ってる？")).toBe("からころ");
    expect(extractSearchQuery("sosukesuzuki はしってる？")).toBe("sosukesuzuki");
    expect(extractSearchQuery("yamanokuさんのこと知ってる？")).toBe("yamanoku");
    expect(extractSearchQuery("Vapor Mode って何？")).toBe("Vapor Mode って何？");
  });
});
