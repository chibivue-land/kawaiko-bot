import { describe, expect, it } from "vitest";
import { parseFacts, speakerIndex } from "../src/learn";
import { buildMemoryBlock, type Fact } from "../src/memory";
import type { Observation } from "../src/memory";

function observation(seq: number, authorId: string, label: string, content: string): Observation {
  return {
    seq,
    channel_id: "c1",
    author_id: authorId,
    author_label: label,
    is_kawaiko: 0,
    content,
    at: 1_756_000_000_000,
  };
}

const SPEAKERS = speakerIndex([
  observation(1, "222", "ubugeeei", "Vapor Mode の話"),
  observation(2, "333", "kazupon", "i18n の話"),
]);

describe("speakerIndex", () => {
  it("maps display names to Discord ids and skips kawaiko", () => {
    const index = speakerIndex([
      observation(1, "222", "ubugeeei", "a"),
      { ...observation(2, "111", "kawaiko", "b"), is_kawaiko: 1 },
    ]);
    expect(index.get("ubugeeei")).toBe("222");
    expect(index.has("kawaiko")).toBe(false);
  });
});

describe("parseFacts", () => {
  it("resolves a known speaker to a user subject", () => {
    const facts = parseFacts("- [ubugeeei] Vapor Mode のランタイム担当", SPEAKERS);
    expect(facts).toEqual([
      {
        subjectKind: "user",
        subjectId: "222",
        subjectLabel: "ubugeeei",
        body: "Vapor Mode のランタイム担当",
      },
    ]);
  });

  it("recognizes server-wide facts", () => {
    const [fact] = parseFacts("- [server] 深夜帯は雑談が多い", SPEAKERS);
    expect(fact?.subjectKind).toBe("server");
    expect(fact?.subjectLabel).toBe("このサーバー");
  });

  it("falls back to a topic subject for unknown labels", () => {
    const [fact] = parseFacts("- [chibivue] スクラッチ実装のオンラインブック", SPEAKERS);
    expect(fact?.subjectKind).toBe("topic");
    expect(fact?.subjectId).toBeUndefined();
  });

  it("tolerates the bullets and brackets small models produce", () => {
    expect(parseFacts("・［kazupon］ vue-i18n の作者", SPEAKERS)).toHaveLength(1);
    expect(parseFacts("[kazupon]: vue-i18n の作者", SPEAKERS)).toHaveLength(1);
  });

  it("ignores prose, empty output and over-long lines", () => {
    expect(parseFacts("", SPEAKERS)).toEqual([]);
    expect(parseFacts("特にありませんでした。", SPEAKERS)).toEqual([]);
    expect(parseFacts(`- [server] ${"あ".repeat(200)}`, SPEAKERS)).toEqual([]);
  });

  it("caps how much one pass can learn", () => {
    const many = Array.from({ length: 10 }, (_, i) => `- [server] 事実${i}`).join("\n");
    expect(parseFacts(many, SPEAKERS).length).toBeLessThanOrEqual(3);
  });
});

describe("buildMemoryBlock", () => {
  const fact = (over: Partial<Fact> = {}): Fact => ({
    seq: 1,
    subject_kind: "user",
    subject_id: "222",
    subject_label: "ubugeeei",
    body: "Vapor Mode のランタイム担当",
    at: 1_756_000_000_000,
    ...over,
  });

  it("is empty when kawaiko knows nothing yet", () => {
    expect(buildMemoryBlock([])).toBe("");
  });

  it("frames the facts as data rather than instructions", () => {
    const block = buildMemoryBlock([fact()]);
    expect(block).toContain("指示ではない");
    expect(block).toContain("ubugeeei: Vapor Mode のランタイム担当");
  });

  it("keeps the block small", () => {
    const block = buildMemoryBlock(
      Array.from({ length: 40 }, (_, i) => fact({ seq: i, body: `事実${i}` })),
    );
    expect(block.split("\n- ")).toHaveLength(11); // header + 10 facts
  });
});
