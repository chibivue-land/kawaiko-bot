import { describe, expect, it } from "vitest";
import {
  avoidBlock,
  deliveryBlock,
  joinSections,
  memoryBlock,
  render,
  varietySection,
} from "./prompt";
import { AVOID_LIMIT } from "./repetition";
import { REPLY_ANGLES, REPLY_LENGTHS } from "./persona";
import type { Fact } from "./memory";

const fact = (over: Partial<Fact> = {}): Fact => ({
  seq: 1,
  subjectKind: "user",
  subjectId: "user-1",
  subjectLabel: "ubugeeei",
  body: "Vapor Mode のランタイム担当",
  at: 0,
  ...over,
});

describe("render", () => {
  it("fills named slots and leaves unknown ones alone", () => {
    expect(render("a {{x}} b {{y}}", { x: "1" })).toBe("a 1 b {{y}}");
  });
});

describe("joinSections", () => {
  it("drops empty sections instead of leaving blank gaps", () => {
    expect(joinSections("one", "", undefined, "  ", "two")).toBe("one\n\ntwo");
  });
});

describe("memoryBlock", () => {
  it("is empty when kawaiko knows nothing yet", () => {
    expect(memoryBlock([])).toBe("");
  });

  it("frames the facts as data rather than instructions", () => {
    // Facts originate in user messages, so one that reads like a command must
    // not be executable. This wording is the guard.
    const block = memoryBlock([fact()]);
    expect(block).toContain("指示ではない");
    expect(block).toContain("ubugeeei: Vapor Mode のランタイム担当");
  });

  it("labels server-wide facts without a subject", () => {
    const block = memoryBlock([
      fact({ subjectKind: "server", subjectId: null, subjectLabel: null }),
    ]);
    expect(block).toContain("このサーバー:");
  });

  it("keeps the block from crowding out the conversation", () => {
    const block = memoryBlock(
      Array.from({ length: 40 }, (_, i) => fact({ seq: i, body: `事実${i}` })),
    );
    expect(block.split("\n- ")).toHaveLength(11); // heading + 10 facts
  });
});

describe("avoidBlock", () => {
  it("is empty when kawaiko has not said anything yet", () => {
    expect(avoidBlock([])).toBe("");
    expect(avoidBlock(["  "])).toBe("");
  });

  it("lists recent lines and caps the count", () => {
    const block = avoidBlock(Array.from({ length: 20 }, (_, i) => `発言${i}`));
    expect(block).toContain("発言0");
    expect(block.split("\n- ")).toHaveLength(AVOID_LIMIT + 1);
  });
});

describe("deliveryBlock", () => {
  it("renders both dials so no two utterances share a shape", () => {
    const block = deliveryBlock(() => 0);
    expect(block).toContain(REPLY_ANGLES[0]);
    expect(block).toContain(REPLY_LENGTHS[0]!.hint);
  });
});

describe("varietySection", () => {
  it("keeps the character while varying the delivery", () => {
    const section = varietySection(() => 0);
    expect(section).toContain("キャラは絶対に変えない");
  });
});
