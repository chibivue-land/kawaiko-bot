import { describe, expect, it, vi } from "vitest";
import { もし, 場合分け, 試す, 試みる } from "./構文";

describe("もし", () => {
  it("選ばれた枝だけを評価する", () => {
    const 真の枝 = vi.fn(() => "真");
    const 偽の枝 = vi.fn(() => "偽");

    expect(もし(1, { であれば: 真の枝, でなければ: 偽の枝 })).toBe("真");
    expect(偽の枝).not.toHaveBeenCalled();

    expect(もし(0, { であれば: 真の枝, でなければ: 偽の枝 })).toBe("偽");
    expect(真の枝).toHaveBeenCalledOnce();
  });

  it("でなければ を省くと偽のとき undefined になる", () => {
    expect(もし(false, { であれば: () => "真" })).toBeUndefined();
  });

  it("素の if と同じ真偽の判定をする", () => {
    for (const 値 of [0, "", null, undefined, NaN]) {
      expect(もし(値, { であれば: () => "真", でなければ: () => "偽" }), String(値)).toBe("偽");
    }
    for (const 値 of [1, "あ", [], {}]) {
      expect(もし(値, { であれば: () => "真", でなければ: () => "偽" })).toBe("真");
    }
  });
});

describe("場合分け", () => {
  const 担当を言葉にする = (担当: "独言" | "横槍" | "学習") =>
    場合分け(担当, {
      独言: () => "誰にも宛てずに呟く",
      横槍: () => "人の発言に絡む",
      それ以外: () => "観測を畳み込む",
    });

  it("該当する枝を選ぶ", () => {
    expect(担当を言葉にする("独言")).toBe("誰にも宛てずに呟く");
    expect(担当を言葉にする("横槍")).toBe("人の発言に絡む");
  });

  it("該当が無ければ それ以外 へ落ちる", () => {
    expect(担当を言葉にする("学習")).toBe("観測を畳み込む");
  });
});

describe("試す", () => {
  it("投げられなければ実行の結果を返す", () => {
    expect(試す({ 実行: () => "無事", しくじったら: () => "拾った" })).toBe("無事");
  });

  it("投げられたら しくじったら へ渡す", () => {
    const 結果 = 試す({
      実行: () => {
        throw new Error("転んだ");
      },
      しくじったら: (異常) => (異常 as Error).message,
    });
    expect(結果).toBe("転んだ");
  });

  it("非同期でも同じように拾える", async () => {
    const 結果 = await 試みる({
      実行: async () => {
        throw new Error("非同期で転んだ");
      },
      しくじったら: (異常) => (異常 as Error).message,
    });
    expect(結果).toBe("非同期で転んだ");
  });
});
