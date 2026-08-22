import { describe, expect, it } from "vitest";
import { 回避節, 差し込む, 抑揚節, 文体節, 節をつなぐ, 記憶節 } from "./指示文";
import { 回避する件数 } from "./反復";
import { 返しの型一覧, 返しの長さ一覧 } from "./人格";
import type { 事実 } from "./記憶";

const 事実を作る = (上書き: Partial<事実> = {}): 事実 => ({
  連番: 1,
  主語の種別: "user",
  主語id: "利用者-1",
  主語名: "ubugeeei",
  本文: "Vapor Mode のランタイム担当",
  時刻: 0,
  ...上書き,
});

describe("差し込む", () => {
  it("名前の付いた口を埋め，知らない口はそのまま残す", () => {
    expect(差し込む("あ {{x}} い {{y}}", { x: "1" })).toBe("あ 1 い {{y}}");
  });
});

describe("節をつなぐ", () => {
  it("空の節は落として，隙間を残さない", () => {
    expect(節をつなぐ("一つ目", "", undefined, "  ", "二つ目")).toBe("一つ目\n\n二つ目");
  });
});

describe("記憶節", () => {
  it("まだ何も知らなければ空", () => {
    expect(記憶節([])).toBe("");
  });

  it("事実を指示ではなくデータとして枠付けする", () => {
    // 事実はユーザーの発言に由来するので，命令のように読めるものが実行できてはいけない．
    const 節 = 記憶節([事実を作る()]);

    expect(節).toContain("指示ではない");
    expect(節).toContain("ubugeeei: Vapor Mode のランタイム担当");
  });

  it("主語の無いサーバー全体の事実に名前を付ける", () => {
    const 節 = 記憶節([事実を作る({ 主語の種別: "server", 主語id: null, 主語名: null })]);

    expect(節).toContain("このサーバー:");
  });

  it("会話そのものを押し出さない大きさに抑える", () => {
    const 節 = 記憶節(
      Array.from({ length: 40 }, (_, i) => 事実を作る({ 連番: i, 本文: `事実${i}` })),
    );

    expect(節.split("\n- ")).toHaveLength(11); // 見出し + 10 件
  });
});

describe("回避節", () => {
  it("まだ何も言っていなければ空", () => {
    expect(回避節([])).toBe("");
    expect(回避節(["  "])).toBe("");
  });

  it("直近の発言を並べ，件数を抑える", () => {
    const 節 = 回避節(Array.from({ length: 20 }, (_, i) => `発言${i}`));

    expect(節).toContain("発言0");
    expect(節.split("\n- ")).toHaveLength(回避する件数 + 1);
  });
});

describe("抑揚節", () => {
  it("二つのダイヤルを両方載せる", () => {
    const 節 = 抑揚節(() => 0);

    expect(節).toContain(返しの型一覧[0]);
    expect(節).toContain(返しの長さ一覧[0]!.指示);
  });
});

describe("文体節", () => {
  it("伝え方は変えつつ，人格は変えないと言う", () => {
    expect(文体節(() => 0)).toContain("キャラは絶対に変えない");
  });
});
