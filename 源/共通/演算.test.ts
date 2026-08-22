import { describe, expect, it, vi } from "vitest";
import { かつ, または, 余り, 既定値, 条件, 等しい, 足す, 否定 } from "./演算";
import { 各要素に, 回数だけ, 範囲 } from "./反復";
import { 含む, 写す, 切り出す, 繋ぐ, 絞る } from "./関数";
import type { 文字列 } from "./型";

describe("算術と比較", () => {
  it("記号の演算子と同じ結果になる", () => {
    expect(足す(2, 3)).toBe(5);
    expect(余り(7, 2)).toBe(1);
    expect(等しい("あ", "あ")).toBe(true);
    expect(否定(0)).toBe(true);
  });
});

describe("論理", () => {
  it("右辺を必要なときだけ評価する (短絡が保たれる)", () => {
    const 重い処理 = vi.fn(() => "実行された");
    expect(かつ(false, 重い処理)).toBeUndefined();
    expect(重い処理).not.toHaveBeenCalled();

    expect(かつ(true, 重い処理)).toBe("実行された");
    expect(重い処理).toHaveBeenCalledOnce();
  });

  it("または は左辺が空のときだけ右辺を見る", () => {
    const 代替 = vi.fn(() => "代替");
    expect(または("本命", 代替)).toBe("本命");
    expect(代替).not.toHaveBeenCalled();
    expect(または(undefined, 代替)).toBe("代替");
  });

  it("条件 はどちらか一方しか評価しない", () => {
    const 真 = vi.fn(() => "真");
    const 偽 = vi.fn(() => "偽");
    expect(条件(1, 真, 偽)).toBe("真");
    expect(偽).not.toHaveBeenCalled();
  });

  it("既定値 は null と undefined だけを拾う", () => {
    expect(既定値(0, 60)).toBe(0);
    expect(既定値(undefined, 60)).toBe(60);
    expect(既定値(null, 60)).toBe(60);
  });
});

describe("繰り返し", () => {
  it("各要素に が for-of の代わりになる", () => {
    const 集めた: 文字列[] = [];
    各要素に(["あ", "い"], (要素) => {
      集めた.push(要素);
    });
    expect(集めた).toEqual(["あ", "い"]);
  });

  it("回数だけ と 範囲 が添字回しの代わりになる", () => {
    expect(回数だけ(3, (i) => i * 2)).toEqual([0, 2, 4]);
    expect(範囲(2, 5)).toEqual([2, 3, 4]);
    expect(範囲(5, 2)).toEqual([]);
  });
});

describe("プロトタイプ移植", () => {
  it("元のメソッドと同じ挙動になる", () => {
    expect(切り出す("かわいこ", 0, 2)).toBe("かわ");
    expect(
      繋ぐ(
        写す([1, 2, 3], (n) => n * 2),
        "-",
      ),
    ).toBe("2-4-6");
    expect(絞る([1, 2, 3], (n) => n % 2 === 1)).toEqual([1, 3]);
    expect(含む("kawaiko", "wai")).toBe(true);
  });
});
