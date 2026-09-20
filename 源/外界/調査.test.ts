import { Bingの結果を読む, Bingの行き先を解く } from "./調査";

import { 検索語を取り出す, 調べる価値があるか } from "../核/問いかけ";

import { 各要素に } from "../共通/反復";

import { 仕様, 検証, 期待 } from "../試験/言葉";

import { 偽, 真 } from "../共通/型";

仕様("調べる価値があるか", () => {
  検証("問いかけの形を拾う", () => {
    for (const 本文 of [
      "Vapor Mode って何ですか?",
      "chibivue とは",
      "最新の Vue のバージョン教えて",
      "おすすめある?",
    ]) {
      期待(調べる価値があるか(本文), 本文).である(真);
    }
  });

  検証("ただの雑談は拾わない", () => {
    for (const 本文 of ["おはよう", "眠い", "ですね"]) {
      期待(調べる価値があるか(本文), 本文).である(偽);
    }
  });
});

仕様("検索語を取り出す", () => {
  検証("「〇〇のこと知ってる?」から主語だけを取る", () => {
    // 生の問いかけは検索語として最悪で，主語だけならそこそこ効く．
    期待(検索語を取り出す("からころのこと知ってる？")).である("からころ");
    期待(検索語を取り出す("kazupon さんって誰")).である("kazupon");
  });

  検証("末尾の助詞を落とす", () => {
    期待(検索語を取り出す("ubugeeei は誰")).である("ubugeeei");
  });

  検証("主語が短すぎるときは元の問いかけを返す", () => {
    期待(検索語を取り出す("あ知ってる")).である("あ知ってる");
  });

  検証("その形をしていない問いかけはそのまま", () => {
    期待(検索語を取り出す("Vapor Mode の最新状況")).である("Vapor Mode の最新状況");
  });
});

仕様("検索語を取り出す: 頼み方を削る", () => {
  検証("「〜について教えて」から主語だけを取る", () => {
    // これをそのまま投げて，どの検索先にも当たらず「知らない」と答えた．
    期待(検索語を取り出す("ryoppippi について教えて")).である("ryoppippi");
    期待(検索語を取り出す("Vapor Mode について調べて")).である("Vapor Mode");
  });

  検証("いろいろな頼み方を削る", () => {
    各要素に(
      [
        ["ryoppippi って何", "ryoppippi"],
        ["ryoppippi ってどんな人", "ryoppippi"],
        ["ryoppippi とは", "ryoppippi"],
        ["ryoppippi は誰", "ryoppippi"],
        ["ryoppippi を教えて", "ryoppippi"],
        ["ryoppippi のこと知ってる？", "ryoppippi"],
        ["ryoppippi さんについて", "ryoppippi"],
        ["Vue の最新情報", "Vue"],
      ],
      ([問い, 語]) => {
        期待(検索語を取り出す(問い!)).である(語);
      },
    );
  });

  検証("削れないものは元のまま返す", () => {
    // 下手に切り詰めて別のものを引くより，当たらないほうがまし．
    期待(検索語を取り出す("今日は寒いね")).である("今日は寒いね");
    期待(検索語を取り出す("Rust の所有権がむずかしい")).である("Rust の所有権がむずかしい");
  });

  検証("削った結果が短すぎるなら元のまま返す", () => {
    期待(検索語を取り出す("あとは")).である("あとは");
  });
});

仕様("Bingの行き先を解く", () => {
  検証("ck/a の包みを素の行き先に戻す", () => {
    // u=a1 の後ろは base64url．a1aHR0…= "https://example.com/docs"
    期待(
      Bingの行き先を解く(
        "https://www.bing.com/ck/a?!&&p=deadbeef&u=a1aHR0cHM6Ly9leGFtcGxlLmNvbS9kb2Nz&ntb=1",
      ),
    ).である("https://example.com/docs");
  });

  検証("包まれていない行き先はそのまま", () => {
    期待(Bingの行き先を解く("https://example.com/x")).である("https://example.com/x");
  });

  検証("解いても URL にならない包みは，包みのまま返す", () => {
    // a1Zm9v の中身は "foo"．リンクとしては包みのままのほうがまだ飛べる．
    期待(Bingの行き先を解く("https://www.bing.com/ck/a?u=a1Zm9v")).である(
      "https://www.bing.com/ck/a?u=a1Zm9v",
    );
  });
});

仕様("Bingの結果を読む", () => {
  const 見本 =
    '<li class="b_algo"><h2 class=""><a target="_blank" href="https://www.bing.com/ck/a?!&amp;&amp;p=x&amp;u=a1aHR0cHM6Ly9leGFtcGxlLmNvbS9kb2Nz&amp;ntb=1">Example <strong>Docs</strong></a></h2><div class="b_caption"><p class="b_lineclamp2">説明文がここに入る。</p></div></li>';

  検証("題・抜粋・行き先を拾い，リンクの包みも解く", () => {
    期待(Bingの結果を読む({ result: [{ results: [{ html: 見本 }] }] })).と等しい([
      { 題: "Web: Example Docs", 抜粋: "説明文がここに入る。", 場所: "https://example.com/docs" },
    ]);
  });

  検証("見出しの無い要素 (広告など) は落とす", () => {
    期待(Bingの結果を読む({ result: [{ results: [{ html: "<li>広告</li>" }] }] })).と等しい([]);
  });

  検証("封筒が空でも転ばない", () => {
    期待(Bingの結果を読む({})).と等しい([]);
  });
});
