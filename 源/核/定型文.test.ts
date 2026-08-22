import { describe, expect, it } from "vitest";
import {
  リセットの文,
  予算超過の文,
  利用制限の文,
  受け流しの文,
  反復打ち切りの文,
  定型文を選ぶ,
  拒否の文,
  無言の文,
  異常の文,
} from "./定型文";

const 在庫 = {
  利用制限の文,
  予算超過の文,
  異常の文,
  拒否の文,
  無言の文,
  反復打ち切りの文,
  リセットの文,
  受け流しの文,
};

describe("定型文を選ぶ", () => {
  it("待ち時間を差し込む", () => {
    expect(定型文を選ぶ(["{m}分待って"], { 分: 12 })).toBe("12分待って");
  });

  it("待ち時間を渡さなければ既定になる", () => {
    expect(定型文を選ぶ(["{m}分待って"])).toBe("60分待って");
  });

  it("在庫の端から端まで選ばれる", () => {
    const 候補 = ["あ", "い", "う"];

    expect(定型文を選ぶ(候補, undefined, () => 0)).toBe("あ");
    expect(定型文を選ぶ(候補, undefined, () => 0.999_999)).toBe("う");
  });
});

describe("在庫の一言", () => {
  it("同じ状況に何度当たっても機械的に見えないだけの数がある", () => {
    for (const [名前, 候補] of Object.entries(在庫)) {
      expect(候補.length, 名前).toBeGreaterThanOrEqual(4);
      expect(new Set(候補).size, 名前).toBe(候補.length);
    }
  });

  it("kawaiko は「私」も「僕」も言わない", () => {
    for (const [名前, 候補] of Object.entries(在庫)) {
      for (const 一文 of 候補) {
        expect(一文, `${名前}: ${一文}`).not.toMatch(/[私僕俺]/);
      }
    }
  });

  it("待ち時間の差し込み口を持つのは利用制限だけ", () => {
    for (const [名前, 候補] of Object.entries(在庫)) {
      if (名前 === "利用制限の文") continue;
      expect(
        候補.some((一文) => 一文.includes("{m}")),
        名前,
      ).toBe(false);
    }
  });
});
