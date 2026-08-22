import { describe, expect, it } from "vitest";
import { 指示書が漏れているか, 番人の行を作る } from "./漏洩検知";
import { 人格指示書を組み立てる } from "./人格";

const 指示書 = 人格指示書を組み立てる();

describe("番人の行を作る", () => {
  it("短い行や記号だけの行は見張りにしない", () => {
    for (const 行 of 番人の行を作る(指示書)) {
      expect(行.length).toBeGreaterThanOrEqual(20);
    }
  });

  it("同じ指示書には同じ結果を返す (キャッシュ)", () => {
    expect(番人の行を作る(指示書)).toBe(番人の行を作る(指示書));
  });
});

describe("指示書が漏れているか", () => {
  it("内部の行を丸写しした返事を捕まえる", () => {
    const 漏れた行 = 指示書.split("\n").find((行) => 行.length > 40)!;

    expect(指示書が漏れているか(漏れた行, 指示書)).toBe(true);
  });

  it("空白を入れて整形されても捕まえる", () => {
    const 漏れた行 = 指示書.split("\n").find((行) => 行.length > 40)!;

    expect(指示書が漏れているか(漏れた行.split("").join(" "), 指示書)).toBe(true);
  });

  it("普通の返事は通す", () => {
    expect(指示書が漏れているか("はい．眠いです．", 指示書)).toBe(false);
    expect(指示書が漏れているか("", 指示書)).toBe(false);
  });
});
