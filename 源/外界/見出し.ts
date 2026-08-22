import type { 見出し取得 } from "../振る舞い/接続口";
import { 応答, 数値, 文字列, 新しい集合 } from "../共通/型";
import type { 約束, 配列 } from "../共通/型";
import { 写す, 前後の空白を落とす, 取り出す, 空か, 絞る } from "../共通/関数";
import { 否定 } from "../共通/演算";
import { もし, 試みる } from "../共通/構文";

/** ニュースのお題で使う RSS (API キー不要)． */
const 購読先 = [
  "https://hnrss.org/newest?q=javascript+OR+typescript+OR+vue+OR+react",
  "https://zenn.dev/feed",
];

/** 取れたぶんだけ拾う．落ちている / 遅いフィードは，単に件数が減るだけ． */
/** 取れたぶんだけ拾う．落ちている / 遅いフィードは，単に件数が減るだけ． */
export const RSSの見出し: 見出し取得 = {
  async 見出し(上限: 数値 = 8): 約束<配列<文字列>> {
    const 束 = await Promise.all(写す(購読先, 一つの購読から拾う));

    // フィードをまたいで同じ題名が来ることがあるので，順序を保ったまま重複を消す．
    return 取り出す([...新しい集合(束.flat())], 0, 上限);
  },
};

async function 一つの購読から拾う(購読: 文字列): 約束<配列<文字列>> {
  return 試みる<配列<文字列>>({
    実行: async () => {
      const 応答 = await fetch(購読, { signal: AbortSignal.timeout(4000) });

      return もし(否定(応答.ok), {
        であれば: async () => [],
        でなければ: async () => 題名を拾う(await 応答.text()),
      });
    },
    // ニュースは飾り．見出しの無い独り言も独り言ではある．
    しくじったら: () => [],
  });
}

function 題名を拾う(xml: 文字列): 配列<文字列> {
  const 一致一覧 = [...xml.matchAll(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/gs)];

  // フィードの最初の <title> はフィード自身の名前．
  return 絞る(
    写す(取り出す(一致一覧, 1), (一致) => 前後の空白を落とす(一致[1]!)),
    (題名) => 否定(空か(題名)),
  );
}
