import { describe, expect, it } from "vitest";
import { 学習を一巡させる } from "./学習実行";
import { 学習に要る観測数 } from "../核/学習";
import type { 観測 } from "../核/記憶";
import { 偽の発話器を作る, 偽の記憶庫を作る, 偽の部品一式を作る } from "../試験/偽物";

function 観測の窓(件数: number): 観測[] {
  return Array.from({ length: 件数 }, (_, i) => ({
    連番: i + 1,
    チャンネルid: "ちゃんねる-1",
    発言者id: "利用者-1",
    発言者名: "ubugeeei",
    kawaikoの発言か: false,
    本文: `発言${i}`,
    時刻: 0,
  }));
}

describe("学習を一巡させる", () => {
  it("記憶庫が無ければ丸ごと省略する", async () => {
    const 部品 = 偽の部品一式を作る({ 記憶庫: 偽の記憶庫を作る({ 使えるか: false }) });

    expect(await 学習を一巡させる(部品)).toEqual({ 成功か: true, 省略した理由: "記憶庫なし" });
    expect(部品.発話器.受け取った指示文).toHaveLength(0);
  });

  it("予算が尽きていたら省略する", async () => {
    const 部品 = 偽の部品一式を作る({
      予算番: {
        async 許すか() {
          return { 許すか: false, 使用済みドル: 200 };
        },
        async 記録する() {},
        async 仕事を終える() {},
      },
    });

    expect(await 学習を一巡させる(部品)).toEqual({ 成功か: true, 省略した理由: "予算" });
  });

  it("閑散なサーバーではコストが出ない", async () => {
    // ゲートは未読の件数なので，暇な時間はモデルをそもそも呼ばない．
    const 部品 = 偽の部品一式を作る();
    部品.記憶庫.未学習の行 = 観測の窓(学習に要る観測数 - 1);

    await 学習を一巡させる(部品);

    expect(部品.発話器.受け取った指示文).toHaveLength(0);
    expect(部品.記憶庫.追記済み).toHaveLength(0);
  });

  it("強制すれば少なくても読む", async () => {
    const 部品 = 偽の部品一式を作る({ 発話器: 偽の発話器を作る(["- [server] 静かなサーバー"]) });
    部品.記憶庫.未学習の行 = 観測の窓(1);

    await 学習を一巡させる(部品, { 強制するか: true });

    expect(部品.記憶庫.追記済み).toHaveLength(1);
  });

  it("1 回ぶんを 1 つの識別子に畳み，どこまで読んだかを残す", async () => {
    const 部品 = 偽の部品一式を作る({
      発話器: 偽の発話器を作る(["- [ubugeeei] Vapor Mode 担当\n- [server] 深夜は過疎"]),
    });
    部品.記憶庫.未学習の行 = 観測の窓(12);

    expect(await 学習を一巡させる(部品)).toEqual({ 成功か: true });

    const [一巡] = 部品.記憶庫.追記済み;
    expect(一巡?.識別子).toBe("回-1");
    // 回がロールバックの単位で，読み取り位置はそれに乗っている．
    expect(一巡?.読んだ位置).toBe(12);
    expect(一巡?.事実一覧.map((事実) => 事実.本文)).toEqual(["Vapor Mode 担当", "深夜は過疎"]);
    expect(一巡?.事実一覧[0]).toMatchObject({ 主語の種別: "user", 主語id: "利用者-1" });
    expect(部品.終えた仕事).toEqual([{ 種類: "学習", 成功か: true, 異常: undefined }]);
  });

  it("学ぶに値するものが無くても回は閉じる", async () => {
    // 閉じないと読み取り位置が進まず，同じ窓を永遠に読み直す．
    const 部品 = 偽の部品一式を作る({ 発話器: 偽の発話器を作る(["特にありませんでした。"]) });
    部品.記憶庫.未学習の行 = 観測の窓(12);

    await 学習を一巡させる(部品);

    expect(部品.記憶庫.追記済み).toHaveLength(1);
    expect(部品.記憶庫.追記済み[0]?.事実一覧).toEqual([]);
    expect(部品.記憶庫.追記済み[0]?.読んだ位置).toBe(12);
  });

  it("cron の中で投げっぱなしにせず，失敗として報告する", async () => {
    const 部品 = 偽の部品一式を作る();
    部品.記憶庫.未学習の行 = 観測の窓(12);
    部品.発話器.発話する = async () => {
      throw new Error("モデルが爆発した");
    };

    const 結果 = await 学習を一巡させる(部品);

    expect(結果.成功か).toBe(false);
    expect(結果.異常).toContain("モデルが爆発した");
    expect(部品.終えた仕事[0]).toMatchObject({ 種類: "学習", 成功か: false });
  });
});
