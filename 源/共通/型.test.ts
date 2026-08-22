import { describe, expect, it } from "vitest";
import { 数値, 文字列, 数学, 対応表, 応答 } from "./型";

describe("組み込み型の別名", () => {
  it("型としても値としても使える", () => {
    const 秒: 数値 = 12;
    expect(数値.isFinite(秒)).toBe(true);
    expect(文字列(秒)).toBe("12");
  });

  it("実行環境の別名がそのままコンストラクタとして働く", () => {
    expect(new 応答("ok").status).toBe(200);
    expect(new 対応表([["a", 1]]).get("a")).toBe(1);
    expect(数学.floor(1.9)).toBe(1);
  });
});
