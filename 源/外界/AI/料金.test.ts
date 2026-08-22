import { describe, expect, it } from "vitest";
import { 概算費用ドル, 月キー } from "./料金";
import { 文字数を収める } from "../Discord/通信";
import { Temporal } from "../../核/時刻";

describe("概算費用ドル", () => {
  it("思考トークンを出力の単価で数える", () => {
    const 費用 = 概算費用ドル("gemini-3.7-flash", {
      total_input_tokens: 1_000_000,
      total_output_tokens: 500_000,
      total_thought_tokens: 500_000,
    });

    // 入力 $0.75 + 出力 $3.75 (本文 0.5M + 思考 0.5M)
    expect(費用).toBeCloseTo(4.5, 5);
  });

  it("前方一致がいちばん長いものを採る", () => {
    // -lite の単価 ($0.10)．3.5-flash の $1.50 ではない．
    expect(概算費用ドル("gemini-3.5-flash-lite", { total_input_tokens: 1_000_000 })).toBeCloseTo(
      0.1,
      5,
    );
  });

  it("知らないモデルには保守的な単価を当てる", () => {
    expect(概算費用ドル("gemini-99-ultra", { total_input_tokens: 1_000_000 })).toBeCloseTo(2, 5);
  });

  it("キャッシュ済み入力は割り引く", () => {
    const 費用 = 概算費用ドル("gemini-3.5-flash-lite", {
      total_input_tokens: 1_000_000,
      total_cached_tokens: 1_000_000,
    });

    expect(費用).toBeCloseTo(0.01, 5);
  });
});

describe("月キー", () => {
  it("UTC の月で束ねる", () => {
    expect(月キー(Temporal.Instant.from("2026-08-21T00:00:00Z"))).toBe("2026-08");
    expect(月キー(Temporal.Instant.from("2026-01-02T00:00:00Z"))).toBe("2026-01");
  });

  it("日本時間の夜でも月を先に繰り上げない", () => {
    // 2026-08-31T23:00Z は東京ではもう 9 月．予算の束ねは UTC．
    expect(月キー(Temporal.Instant.from("2026-08-31T23:00:00Z"))).toBe("2026-08");
  });
});

describe("文字数を収める", () => {
  it("短い発言はそのまま", () => {
    expect(文字数を収める("短い")).toBe("短い");
  });

  it("Discord の 2000 文字上限より内側へ収める", () => {
    const 収めた = 文字数を収める("あ".repeat(3000));

    expect(収めた.length).toBeLessThanOrEqual(2000);
    expect(収めた.endsWith("…")).toBe(true);
  });
});
