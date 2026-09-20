import { 一度に読む数, 貼られた場所, 読みに行ってよいか } from "./参照";

import { 仕様, 検証, 期待 } from "../試験/言葉";

import { 各要素に } from "../共通/反復";
import { 偽, 真 } from "../共通/型";
import { 長さ } from "../共通/関数";

仕様("貼られた場所", () => {
  検証("本文の中の URL を拾う", () => {
    期待(貼られた場所("これ何 https://example.com/a")).と等しい(["https://example.com/a"]);
  });

  検証("文末の句読点は URL に含めない", () => {
    各要素に(
      [
        "これ見て https://example.com/a。",
        "https://example.com/a、どう？",
        "https://example.com/a.",
      ],
      (本文) => {
        期待(貼られた場所(本文)).と等しい(["https://example.com/a"]);
      },
    );
  });

  検証("鉤括弧に入っていても拾う", () => {
    期待(貼られた場所("「https://example.com/a」って何")).と等しい(["https://example.com/a"]);
  });

  検証("何本貼られても，見に行くのは決めた数まで", () => {
    // ブラウザの時間は 1 日 10 分しかない．
    const 本文 = "https://a.example/1 https://b.example/2 https://c.example/3";

    期待(長さ(貼られた場所(本文))).である(一度に読む数);
  });

  検証("括弧まで含めて 1 つの URL のことがある", () => {
    期待(貼られた場所("https://ja.wikipedia.org/wiki/Rust_(programming_language)")).と等しい([
      "https://ja.wikipedia.org/wiki/Rust_(programming_language)",
    ]);
  });

  検証("釣り合わない閉じ括弧は落とす", () => {
    期待(貼られた場所("(https://example.com/a)")).と等しい(["https://example.com/a"]);
  });

  検証("URL が無ければ空", () => {
    期待(貼られた場所("おはよう")).と等しい([]);
    期待(貼られた場所("")).と等しい([]);
  });

  検証("添付の置き場は見に行かない", () => {
    // 画像やファイルは添付として別の道で読んでいる．
    期待(貼られた場所("https://cdn.discordapp.com/attachments/1/2/図.png")).と等しい([]);
  });
});

仕様("読みに行ってよいか", () => {
  検証("http と https だけ", () => {
    期待(読みに行ってよいか("https://example.com")).である(真);
    期待(読みに行ってよいか("http://example.com")).である(真);
    期待(読みに行ってよいか("ftp://example.com")).である(偽);
    期待(読みに行ってよいか("file:///etc/passwd")).である(偽);
  });

  検証("URL として読めないものは見に行かない", () => {
    期待(読みに行ってよいか("これは URL ではない")).である(偽);
    期待(読みに行ってよいか("")).である(偽);
  });
});

仕様("読みに行ってよいか: 読むものが無い置き場", () => {
  検証("動画や SNS は開きに行かない", () => {
    // ブラウザは動画を再生できないし，できたとして読むものが無い．
    // 1 日 10 分しかない時間を，当たらないと分かっている先に使わない．
    各要素に(
      [
        "https://www.youtube.com/watch?v=XezoLvr1dX0",
        "https://youtu.be/XezoLvr1dX0",
        "https://x.com/someone/status/1",
      ],
      (場所) => {
        期待(読みに行ってよいか(場所)).である(偽);
      },
    );
  });

  検証("記事が読める先は開きに行く", () => {
    各要素に(
      ["https://github.com/ryoppippi", "https://ja.wikipedia.org/wiki/Rust", "https://zenn.dev/x"],
      (場所) => {
        期待(読みに行ってよいか(場所)).である(真);
      },
    );
  });
});
