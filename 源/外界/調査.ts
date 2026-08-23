/**
 * 問いかけっぽいメンションのための，軽くてキーの要らない裏取り．
 *
 * Workers AI のモデルはブラウズできないので，文脈はこちらで集める．集め先は
 * データセンターの IP からでも API キー無しで素直に答えてくれるところ:
 * 日本語 Wikipedia，Google News RSS (ja)，GitHub API，HN Algolia．
 * すべて best-effort — 失敗しても「裏取り無しの返事」に落ちるだけ．
 */
import type { 調べた結果, 調査係 } from "../振る舞い/接続口";

import { 数値, 文字列, 未定義, 空 } from "../共通/型";
import type { 省略可, 約束, 記録, 読み取り専用配列, 配列 } from "../共通/型";
import { 改行 } from "../共通/文字";
import { もし, 試みる } from "../共通/構文";
import { 否定, 等しい, 等しくない } from "../共通/演算";
import { すぐ返す, 揃える } from "../共通/約束";
import {
  写す,
  切り出す,
  前後の空白を落とす,
  取り出す,
  平らにする,
  空か,
  畳む,
  絞る,
  繋ぐ,
  置き換える,
} from "../共通/関数";

const 待てる時間 = 4000;
const 名乗り = "kawaiko-bot/1.0 (+https://github.com/chibivue-land/kawaiko-bot)";

export interface 調べもの {
  題: 文字列;
  抜粋: 文字列;
  /** さらに開いて読める先．拾えたときだけ． */
  場所?: 省略可<文字列>;
}

/** ざっくり HTML/XML を落として実体参照を戻す． */
function タグを落とす(生: 文字列): 文字列 {
  const 素 = 置き換える(生, /<[^>]*>/g, "");
  const 実体 = [
    [/&amp;/g, "&"],
    [/&lt;/g, "<"],
    [/&gt;/g, ">"],
    [/&quot;/g, '"'],
    [/&#x?\d+;/g, ""],
    [/\s+/g, " "],
  ] as const;

  return 前後の空白を落とす(畳む(実体, (文, [型, 置換]) => 置き換える(文, 型, 置換), 素));
}

/** 時間切れと失敗を空として扱う fetch． */
function 時間を切って取る(url: 文字列, 見出し: 記録<文字列, 文字列> = {}): 約束<省略可<Response>> {
  return 試みる<省略可<Response>>({
    実行: () =>
      fetch(url, {
        headers: { "User-Agent": 名乗り, ...見出し },
        signal: AbortSignal.timeout(待てる時間),
      }).んで((応答) => もし(応答.ok, { であれば: () => 応答, でなければ: () => 未定義 })),
    しくじったら: () => 未定義,
  });
}

/** 応答があれば読む．無ければ空． */
function 応答から拾う(
  応答: 省略可<Response>,
  読む: (応答: Response) => 約束<配列<調べもの>>,
): 約束<配列<調べもの>> {
  return もし<約束<配列<調べもの>>>(等しい(応答, 未定義), {
    であれば: () => すぐ返す([]),
    でなければ: () => 試みる({ 実行: () => 読む(応答!), しくじったら: () => [] }),
  });
}

function Wikipediaを引く(検索語: 文字列): 約束<配列<調べもの>> {
  return 時間を切って取る(
    `https://ja.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(検索語)}&format=json&srlimit=2&utf8=1`,
  ).んで((応答) =>
    応答から拾う(応答, (応答) =>
      応答.json().んで((中身) =>
        写す(
          (中身 as { query?: 省略可<{ search?: 省略可<配列<Wikipediaの件>> }> }).query?.search ??
            [],
          (件) => ({
            題: `Wikipedia: ${件.title}`,
            抜粋: 切り出す(タグを落とす(件.snippet), 0, 180),
            場所: `https://ja.wikipedia.org/wiki/${encodeURIComponent(件.title)}`,
          }),
        ),
      ),
    ),
  );
}

interface Wikipediaの件 {
  title: 文字列;
  snippet: 文字列;
}

/** Google News の RSS は Workers から素直に返るし，日本語のニュースを拾える． */
function ニュースを引く(検索語: 文字列): 約束<配列<調べもの>> {
  return 時間を切って取る(
    `https://news.google.com/rss/search?q=${encodeURIComponent(検索語)}&hl=ja&gl=JP&ceid=JP:ja`,
  ).んで((応答) => 応答から拾う(応答, (応答) => 応答.text().んで((xml) => ニュースを読む(xml))));
}

/** RSS の <item> ごとに，題と行き先を組にして拾う． */
function ニュースを読む(xml: 文字列): 配列<調べもの> {
  const 記事一覧 = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gu)];

  return 絞る(
    写す(取り出す(記事一覧, 0, 4), (記事): 調べもの => {
      const 中 = 記事[1] ?? "";

      return {
        題: `News: ${タグを落とす(題を抜く(中))}`,
        抜粋: "",
        場所: 前後の空白を落とす(行き先を抜く(中)),
      };
    }),
    (件) => 否定(空か(件.題)),
  );
}

function 題を抜く(記事: 文字列): 文字列 {
  return /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/u.exec(記事)?.[1] ?? "";
}

function 行き先を抜く(記事: 文字列): 文字列 {
  return /<link>([\s\S]*?)<\/link>/u.exec(記事)?.[1] ?? "";
}

/** ハンドルっぽい検索語なら GitHub のユーザーを引く (ここは開発者の集まりなので)． */
function GitHubのひとを引く(検索語: 文字列, トークン?: 省略可<文字列>): 約束<配列<調べもの>> {
  return もし<約束<配列<調べもの>>>(否定(/^[a-zA-Z0-9-]{2,39}$/.test(検索語)), {
    であれば: () => すぐ返す([]),
    でなければ: () =>
      時間を切って取る(
        `https://api.github.com/users/${encodeURIComponent(検索語)}`,
        トークン ? { Authorization: `Bearer ${トークン}` } : {},
      ).んで((応答) =>
        応答から拾う(応答, (応答) =>
          応答.json().んで((中身) => {
            const ひと = 中身 as GitHubのひと;

            return もし(等しい(ひと.login, 未定義), {
              であれば: (): 配列<調べもの> => [],
              でなければ: () => {
                const 断片 = 絞る(
                  [
                    ひと.name && 等しくない(ひと.name, ひと.login) ? `name: ${ひと.name}` : "",
                    ひと.bio ? `bio: ${ひと.bio}` : "",
                    `repos: ${ひと.public_repos}, followers: ${ひと.followers}`,
                  ],
                  (断片) => 否定(空か(断片)),
                );

                return [
                  { 題: `GitHub: ${ひと.login!}`, 抜粋: 切り出す(繋ぐ(断片, " / "), 0, 220) },
                ];
              },
            });
          }),
        ),
      ),
  });
}

interface GitHubのひと {
  login?: 省略可<文字列>;
  name?: 省略可<文字列 | 空>;
  bio?: 省略可<文字列 | 空>;
  followers?: 省略可<数値>;
  public_repos?: 省略可<数値>;
}

/** 英語の技術話題は HN Algolia が強い． */
function HackerNewsを引く(検索語: 文字列): 約束<配列<調べもの>> {
  return 時間を切って取る(
    `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(検索語)}&hitsPerPage=3&tags=story`,
  ).んで((応答) =>
    応答から拾う(応答, (応答) =>
      応答.json().んで((中身) =>
        写す(
          絞る((中身 as { hits?: 省略可<配列<HNの件>> }).hits ?? [], (件) =>
            否定(等しい(件.title, 未定義)),
          ),
          (件) => ({
            題: `HN: ${件.title!}`,
            抜粋: `${件.points ?? 0} points`,
            場所: 件.url ?? 未定義,
          }),
        ),
      ),
    ),
  );
}

interface HNの件 {
  title?: 省略可<文字列>;
  points?: 省略可<数値>;
  url?: 省略可<文字列>;
}

/** 指示文に差す短い参考情報を集める．役に立つものが無ければ空文字． */
/** 一度に指示文へ載せる抜粋の数． */
const 載せる件数 = 8;

/** さらに開いて読む先の候補として持ち帰る数． */
const 持ち帰る候補の数 = 3;

export function 参考情報を集める(
  検索語: 文字列,
  設定?: 省略可<{ GitHubのトークン?: 省略可<文字列> }>,
): 約束<調べた結果> {
  // 四つは互いを待たない．遅い先が一つあっても，残りは同じ時間で揃う．
  return 揃える([
    Wikipediaを引く(検索語),
    ニュースを引く(検索語),
    GitHubのひとを引く(検索語, 設定?.GitHubのトークン),
    HackerNewsを引く(検索語),
  ]).んで((束) => 結果にまとめる(取り出す(平らにする(束), 0, 載せる件数)));
}

function 結果にまとめる(一覧: 読み取り専用配列<調べもの>): 調べた結果 {
  return {
    抜粋: 繋ぐ(
      写す(一覧, (件) => (件.抜粋 ? `- ${件.題}: ${件.抜粋}` : `- ${件.題}`)),
      改行,
    ),
    候補: 取り出す(
      絞る(
        写す(一覧, (件) => 件.場所 ?? ""),
        (場所) => 否定(空か(場所)),
      ),
      0,
      持ち帰る候補の数,
    ),
  };
}

/**
 * 調査係のポート．
 *
 * 「調べるか」を決めるのはもうここではない (振る舞い/道案内.ts)．ここは
 * 渡された語で引くだけ．
 */
export function webの調査係(設定: { GitHubのトークン?: 省略可<文字列> }): 調査係 {
  return {
    調べる(検索語: 文字列): 約束<調べた結果> {
      return もし<約束<調べた結果>>(空か(検索語), {
        であれば: () => すぐ返す(空の結果),
        でなければ: () =>
          参考情報を集める(検索語, { GitHubのトークン: 設定.GitHubのトークン }).しくじったら(
            () => 空の結果,
          ),
      });
    },
  };
}

const 空の結果: 調べた結果 = { 抜粋: "", 候補: [] };
