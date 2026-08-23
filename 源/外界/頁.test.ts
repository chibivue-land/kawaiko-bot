import { 仕様, 検証, 期待 } from "../試験/言葉";

import { BrowserRunの頁読み, 頁読みなし } from "./頁";

import { 偽, 文字列, 新しい応答, 未定義, 真 } from "../共通/型";
import type { 不明 } from "../共通/型";
import { 否定, 等しい } from "../共通/演算";
import { しくじる, もし } from "../共通/構文";

/**
 * 束縛の身代わり．
 *
 * 本物は「知らないプロパティ＝向こう側のメソッド呼び出し」として扱うので，
 * 約束のつもりで `.んで` と書くと «んで» を探しにいって落ちる．永続体で 1 度，
 * ブラウザでもう 1 度，同じ形で本番を落とした．ここでも同じように咎める．
 */
function 束縛もどき(応答: Response): BrowserRun {
  const 素 = {
    // then を持つだけで約束ではないもの — それがこの検証の題材そのもの．
    // oxlint-disable-next-line unicorn/no-thenable
    quickAction: () => ({ then: (次: (応答: Response) => 不明) => 次(応答) }),
  };

  return new Proxy(素, {
    // 記号までは咎めない．咎めるのは「メソッド名のつもりの，知らない文字列」だけ．
    get: (的, 名前) =>
      もし<不明>(等しい(typeof 名前, "string") && 否定(名前 in 的), {
        であれば: () =>
          しくじる(new Error(`The RPC receiver does not implement the method "${文字列(名前)}".`)),
        でなければ: () => Reflect.get(的, 名前),
      }),
  }) as unknown as BrowserRun;
}

仕様("BrowserRunの頁読み", () => {
  検証("束縛の返事を均してから続きを書く", () => {
    // 均さずに `.んで` と書くと «んで» を探しにいって落ちる．
    return BrowserRunの頁読み(束縛もどき(新しい応答("# 見出し\n\n中身")))
      .読む("https://example.com/a")
      .んで((頁) => {
        期待(頁!.場所).である("https://example.com/a");
        期待(頁!.中身).を含む("中身");
      });
  });

  検証("開けなかったら，理由を残して黙って諦める", () => {
    const 読み = BrowserRunの頁読み(束縛もどき(新しい応答("だめ", { status: 500 })));

    return 読み.読む("https://example.com/a").んで((頁) => {
      期待(頁).である(未定義);
      期待(読み.直前の躓き()).を含む("500");
    });
  });

  検証("中身が空なら，読めなかったことにする", () => {
    return BrowserRunの頁読み(束縛もどき(新しい応答("   ")))
      .読む("https://example.com/a")
      .んで((頁) => {
        期待(頁).である(未定義);
      });
  });

  検証("繋がっていない構成は，使えないと名乗る", () => {
    期待(頁読みなし.使えるか).である(偽);
    期待(BrowserRunの頁読み(束縛もどき(新しい応答("x"))).使えるか).である(真);
  });
});
