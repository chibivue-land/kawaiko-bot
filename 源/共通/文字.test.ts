import { describe, expect, it } from "vitest";
import { 空文字, 空行, 改行, 空白, タブ } from "./文字";
import { 未定義, 空 } from "./型";

describe("制御文字の定数", () => {
  it("素のエスケープと同じものを指す", () => {
    expect(改行).toBe("\n");
    expect(空行).toBe("\n\n");
    expect(タブ).toBe("\t");
    expect(空白).toBe(" ");
    expect(空文字).toBe("");
  });

  it("繋ぐ の区切りとして読める", () => {
    expect(["一", "二"].join(改行)).toBe("一\n二");
  });
});

describe("未定義 と 空", () => {
  it("素の undefined / null と同一である", () => {
    expect(未定義).toBeUndefined();
    expect(空).toBeNull();
    expect(未定義 === undefined).toBe(true);
    expect(空 === null).toBe(true);
  });
});
