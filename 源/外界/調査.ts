/**
 * 問いかけっぽいメンションのための，軽くてキーの要らない裏取り．
 *
 * Workers AI のモデルはブラウズできないので，文脈はこちらで集める．集め先は
 * データセンターの IP からでも API キー無しで素直に答えてくれるところ:
 * 日本語 Wikipedia，Google News RSS (ja)，GitHub API，HN Algolia．
 * すべて best-effort — 失敗しても「裏取り無しの返事」に落ちるだけ．
 */
import type { 調査係 } from "../振る舞い/接続口";
import { 応答, 数値, 文字列, 新しい型, 未定義, 真偽, 空 } from "../共通/型";
import type { 省略可, 約束, 記録, 配列 } from "../共通/型";
import { 写す, 切り出す, 前後の空白を落とす, 取り出す, 空か, 絞る, 繋ぐ, 置き換える, 長さ } from "../共通/関数";
import { 以上, 否定, 等しい, 等しくない } from "../共通/演算";
import { もし, 試みる } from "../共通/構文";
import { 改行 } from "../共通/文字";

const 待てる時間 = 4000;
const 名乗り = "kawaiko-bot/1.0 (+https://github.com/chibivue-land/kawaiko-bot)";

export interface 調べもの {
  題: 文字列;
  抜粋: 文字列;
}

/** ただの雑談ではなく，何かを訊いている合図． */
const 問いかけの合図 = [
  "[?？]",
  "とは",
  "教えて",
  "どう(いう|やって|なる|思)",
  "何(が|を|で|の)",
  "なに",
  "最新",
  "最近",
  "リリース",
  "バージョン",
  "いつ",
  "どこ",
  "誰",
  "だれ",
  "何者",
  "調べ",
  "比較",
  "おすすめ",
  "どんな",
];

const 問いかけの型 = 新しい型(繋ぐ(問いかけの合図, "|"));

/** この発言は問いかけ / 情報を求める形か． */
export function 調べる価値があるか(本文: 文字列): 真偽 {
  return 問いかけの型.test(本文);
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

  return 前後の空白を落とす(実体.reduce((文, [型, 置換]) => 置き換える(文, 型, 置換), 素));
}

/**
 * 「〇〇のこと知ってる？」を検索語に絞る．生の問いかけは検索語として最悪で，
 * 主語だけ («からころ») ならそこそこ効く．
 */
const 敬称 = "(?:さん|氏|くん|ちゃん)?";
const 話題の助詞 = "(?:のこと|のことを|って|とは)?";
const 訊き方 = "(?:知って(?:る|ますか|います)?|しってる|誰|だれ|何者)";
const 知ってるか型 = 新しい型(`^(.+?)${敬称}${話題の助詞}${訊き方}`);

export function 検索語を取り出す(問いかけ: 文字列): 文字列 {
  const 主語 = 知ってるか型.exec(問いかけ)?.[1];
  const 削った = 等しい(主語, 未定義)
    ? 未定義
    : 前後の空白を落とす(置き換える(主語, /[はがのをも]\s*$/, ""));

  return もし(等しくない(削った, 未定義) && 以上(長さ(削った!), 2), {
    であれば: () => 削った!,
    でなければ: () => 問いかけ,
  });
}

/** 時間切れと失敗を空として扱う fetch． */
async function 時間を切って取る(
  url: 文字列,
  見出し: 記録<文字列, 文字列> = {},
): 約束<省略可<Response>> {
  return 試みる<省略可<Response>>({
    実行: async () => {
      const 応答 = await fetch(url, {
        headers: { "User-Agent": 名乗り, ...見出し },
        signal: AbortSignal.timeout(待てる時間),
      });

      return もし(応答.ok, { であれば: () => 応答, でなければ: () => 未定義 });
    },
    しくじったら: () => 未定義,
  });
}

/** 応答があれば読む．無ければ空． */
async function 応答から拾う(
  応答: 省略可<Response>,
  読む: (応答: Response) => 約束<配列<調べもの>>,
): 約束<配列<調べもの>> {
  return もし(等しい(応答, 未定義), {
    であれば: async () => [],
    でなければ: () => 試みる({ 実行: () => 読む(応答!), しくじったら: () => [] }),
  });
}

async function Wikipediaを引く(検索語: 文字列): 約束<配列<調べもの>> {
  const 応答 = await 時間を切って取る(
    `https://ja.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(検索語)}&format=json&srlimit=2&utf8=1`,
  );

  return 応答から拾う(応答, async (応答) => {
    const 中身 = (await 応答.json()) as {
      query?: 省略可<{ search?: 省略可<配列<{ title: 文字列; snippet: 文字列 }>> }>;
    };

    return 写す(中身.query?.search ?? [], (件) => ({
      題: `Wikipedia: ${件.title}`,
      抜粋: 切り出す(タグを落とす(件.snippet), 0, 180),
    }));
  });
}

/** Google News の RSS は Workers から素直に返るし，日本語のニュースを拾える． */
async function ニュースを引く(検索語: 文字列): 約束<配列<調べもの>> {
  const 応答 = await 時間を切って取る(
    `https://news.google.com/rss/search?q=${encodeURIComponent(検索語)}&hl=ja&gl=JP&ceid=JP:ja`,
  );

  return 応答から拾う(応答, async (応答) => {
    const xml = await 応答.text();
    const 一致一覧 = [...xml.matchAll(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/gs)];

    // 最初の <title> はフィード自身の名前なので飛ばす．
    return 絞る(
      写す(取り出す(一致一覧, 1, 4), (一致) => ({
        題: `News: ${タグを落とす(一致[1]!)}`,
        抜粋: "",
      })),
      (件) => 否定(空か(件.題)),
    );
  });
}

/** ハンドルっぽい検索語なら GitHub のユーザーを引く (ここは開発者の集まりなので)． */
async function GitHubのひとを引く(検索語: 文字列, トークン?: 省略可<文字列>): 約束<配列<調べもの>> {
  return もし(否定(/^[a-zA-Z0-9-]{2,39}$/.test(検索語)), {
    であれば: async (): 約束<配列<調べもの>> => [],
    でなければ: async () => {
      const 応答 = await 時間を切って取る(
        `https://api.github.com/users/${encodeURIComponent(検索語)}`,
        トークン ? { Authorization: `Bearer ${トークン}` } : {},
      );

      return 応答から拾う(応答, async (応答) => {
        const ひと = (await 応答.json()) as {
          login?: 省略可<文字列>;
          name?: 省略可<文字列 | 空>;
          bio?: 省略可<文字列 | 空>;
          followers?: 省略可<数値>;
          public_repos?: 省略可<数値>;
        };

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

            return [{ 題: `GitHub: ${ひと.login!}`, 抜粋: 切り出す(繋ぐ(断片, " / "), 0, 220) }];
          },
        });
      });
    },
  });
}

/** 英語の技術話題は HN Algolia が強い． */
async function HackerNewsを引く(検索語: 文字列): 約束<配列<調べもの>> {
  const 応答 = await 時間を切って取る(
    `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(検索語)}&hitsPerPage=3&tags=story`,
  );

  return 応答から拾う(応答, async (応答) => {
    const 中身 = (await 応答.json()) as {
      hits?: 省略可<配列<{ title?: 省略可<文字列>; points?: 省略可<数値> }>>;
    };

    return 写す(
      絞る(中身.hits ?? [], (件) => 否定(等しい(件.title, 未定義))),
      (件) => ({ 題: `HN: ${件.title!}`, 抜粋: `${件.points ?? 0} points` }),
    );
  });
}

/** 指示文に差す短い参考情報を集める．役に立つものが無ければ空文字． */
export async function 参考情報を集める(
  生の問いかけ: 文字列,
  設定?: 省略可<{ GitHubのトークン?: 省略可<文字列> }>,
): 約束<文字列> {
  const 検索語 = 検索語を取り出す(生の問いかけ);
  const 束 = await Promise.all([
    Wikipediaを引く(検索語),
    ニュースを引く(検索語),
    GitHubのひとを引く(検索語, 設定?.GitHubのトークン),
    HackerNewsを引く(検索語),
  ]);
  const 一覧 = 取り出す(束.flat(), 0, 8);

  return もし(空か(一覧), {
    であれば: () => "",
    でなければ: () =>
      繋ぐ(
        写す(一覧, (件) => (件.抜粋 ? `- ${件.題}: ${件.抜粋}` : `- ${件.題}`)),
        改行,
      ),
  });
}

/**
 * 調査係のポート．調べるまでもない問いかけには空文字を返すので，呼び出し側が
 * 二度判定しなくて済む．
 */
export function webの調査係(設定: { GitHubのトークン?: 省略可<文字列> }): 調査係 {
  return {
    async 調べる(問いかけ: 文字列): 約束<文字列> {
      return もし(空か(問いかけ) || 否定(調べる価値があるか(問いかけ)), {
        であれば: async () => "",
        でなければ: () =>
          参考情報を集める(問いかけ, { GitHubのトークン: 設定.GitHubのトークン }).catch(() => ""),
      });
    },
  };
}
