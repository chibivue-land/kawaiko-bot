import { describe, expect, it } from "vitest";
import { 独り言を投稿する } from "./独言投稿";
import { お題一覧 } from "../核/独言";
import { 偽の部品一式を作る, 発言を作る } from "../試験/偽物";

describe("独り言を投稿する", () => {
  it("確率ゲートで見送るときは何も使わない", async () => {
    const 部品 = 偽の部品一式を作る({ 独言の確率: "0", 乱数: () => 0.5 });

    expect(await 独り言を投稿する(部品)).toEqual({ 成功か: true, 省略した理由: "確率" });
    expect(部品.発話器.受け取った指示文).toHaveLength(0);
  });

  it("予算が尽きていたら見送る", async () => {
    const 部品 = 偽の部品一式を作る({
      予算番: {
        async 許すか() {
          return { 許すか: false, 使用済みドル: 200 };
        },
        async 記録する() {},
        async 仕事を終える() {},
      },
    });

    expect(await 独り言を投稿する(部品)).toEqual({ 成功か: true, 省略した理由: "予算" });
  });

  it("住処のチャンネルへ、スレッドにせず投げる", async () => {
    const 部品 = 偽の部品一式を作る();

    expect(await 独り言を投稿する(部品)).toEqual({ 成功か: true });
    expect(部品.チャット.投稿済み).toEqual([
      { チャンネルid: "住処", 本文: "kawaiko の返事", 返信先: undefined },
    ]);
    expect(部品.発話器.受け取った指示文[0]).toContain(お題一覧[0]!);
    expect(部品.終えた仕事).toEqual([{ 種類: "独言", 成功か: true, 異常: undefined }]);
  });

  it("見出しはニュースのお題のときだけ取りに行く", async () => {
    let 訊いた回数 = 0;
    const 部品 = 偽の部品一式を作る({
      見出し取得: {
        async 見出し() {
          訊いた回数++;

          return ["Vue 4 released"];
        },
      },
    });

    await 独り言を投稿する(部品);

    // 乱数が 0 なので最初のお題が選ばれ、それはニュースではない。
    expect(訊いた回数).toBe(0);
  });

  it("さっき呟いたことを繰り返すなと伝える", async () => {
    const 部品 = 偽の部品一式を作る();
    部品.チャット.履歴 = [
      発言を作る({
        id: "前",
        発言者id: "bot-1",
        発言者名: "kawaiko",
        bot発言か: true,
        本文: "また新しい JS フレームワークが生まれたらしい",
      }),
    ];

    await 独り言を投稿する(部品);

    expect(部品.発話器.受け取った指示文[0]).toContain("また新しい JS フレームワーク");
  });

  it("cron の中で投げっぱなしにせず、失敗として報告する", async () => {
    const 部品 = 偽の部品一式を作る();
    部品.発話器.発話する = async () => {
      throw new Error("モデルが爆発した");
    };

    const 結果 = await 独り言を投稿する(部品);

    expect(結果.成功か).toBe(false);
    expect(部品.終えた仕事[0]).toMatchObject({ 種類: "独言", 成功か: false });
  });
});
