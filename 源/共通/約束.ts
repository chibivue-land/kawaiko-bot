import type { 文字列, 不明, 無 } from "./型";
import { 真, 偽 } from "./型";

/**
 * 約束の続きを日本語で書けるようにする．
 *
 * `await` は予約語で別名を付けられないが，`then` はただのメソッドなので，同じ
 * ものに日本語の名前を足せる．おかげで続きが左から右へ読める:
 *
 *   直近の発言(部屋).んで((発言一覧) => 会話ログを組み立てる(発言一覧, 設定))
 *
 * 実体は `Promise.prototype.then` / `catch` / `finally` そのもので，包み直しては
 * いない．挙動もコストも変わらず，増えるのは呼び名だけ．
 *
 * 組み込みのプロトタイプに足すので，**使う前に一度だけ読み込まれている必要が
 * ある**．本番は 入口.ts が先頭で読み込み，試験は vite.config.ts の
 * `test.setupFiles` が読み込む．それ以外の入口を増やすときは同じことをする．
 */

declare global {
  interface Promise<T> {
    /** then — 続き． */
    んで<結果>(次: (値: T) => 結果 | PromiseLike<結果>): Promise<結果>;

    /** catch — 転んだときの拾い方． */
    しくじったら<結果>(拾う: (躓き: 不明) => 結果 | PromiseLike<結果>): Promise<T | 結果>;

    /** finally — 転んでも転ばなくても片付ける． */
    ともかく(始末: () => 無): Promise<T>;
  }
}

const 足す = (名前: 文字列, 元: 不明): 無 => {
  Object.defineProperty(Promise.prototype, 名前, {
    value: 元,
    writable: 真,
    configurable: 真,
    enumerable: 偽,
  });
};

足す("んで", Promise.prototype.then);
足す("しくじったら", Promise.prototype.catch);
足す("ともかく", Promise.prototype.finally);

/**
 * thenable を約束にする．
 *
 * Drizzle のクエリビルダのように「then は持つが Promise ではない」ものには
 * `.んで` が生えていない．一度これを通せば，あとは普通に続きが書ける．
 */
export function 約束にする<値>(thenable: PromiseLike<値>): Promise<値> {
  return Promise.resolve(thenable);
}
