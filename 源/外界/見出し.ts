import type { 見出し取得 } from "../振る舞い/接続口";
import { 一覧に含む, 前後の空白を落とす, 取り出す } from "../共通/関数";
import type { 文字列, 配列, 約束, 数値 } from "../共通/型";

/** ニュースのお題で使う RSS (API キー不要)。 */
const 購読先 = [
  "https://hnrss.org/newest?q=javascript+OR+typescript+OR+vue+OR+react",
  "https://zenn.dev/feed",
];

/** 取れたぶんだけ拾う。落ちている / 遅いフィードは、単に件数が減るだけ。 */
export const RSSの見出し: 見出し取得 = {
  async 見出し(上限: 数値 = 8): 約束<配列<文字列>> {
    const 題名一覧: 配列<文字列> = [];
    for (const 購読 of 購読先) {
      try {
        const 応答 = await fetch(購読, { signal: AbortSignal.timeout(4000) });
        if (!応答.ok) continue;
        const xml = await 応答.text();
        const 一致一覧 = [...xml.matchAll(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/gs)];
        // フィードの最初の <title> はフィード自身の名前。
        for (const 一致 of 一致一覧.slice(1)) {
          const 題名 = 前後の空白を落とす(一致[1]!);
          if (題名 && !一覧に含む(題名一覧, 題名)) 題名一覧.push(題名);
        }
      } catch {
        // ニュースは飾り。見出しの無い独り言も独り言ではある。
      }
    }
    return 取り出す(題名一覧, 0, 上限);
  },
};
