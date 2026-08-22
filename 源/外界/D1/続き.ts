import type {} from "drizzle-orm/query-promise";

import type { 不明, 無, 約束, 約束もどき } from "../../共通/型";

/**
 * Drizzle のクエリに `.んで` の型を足す．
 *
 * 実行時に生やしているのは 共通/取り次ぎ.ts の Proxy のほう．あちらは `.んで` を
 * 訊かれたらその場で約束にして返すので，連鎖のどこでも書ける．ただし
 * TypeScript はその取り次ぎを追えない — Drizzle のクエリは `Promise` ではなく
 * `QueryPromise` という別のクラスで，`Promise.prototype` へ足した宣言は届かない．
 *
 * `QueryPromise` は class なので，同名の interface を宣言してマージすれば
 * インスタンス側に型が足せる．実行時 (Proxy) と型 (これ) で，同じことを別々に
 * 言っている形になる．
 */
declare module "drizzle-orm/query-promise" {
  interface QueryPromise<T> {
    /** then — 続き． */
    んで<結果>(次: (値: T) => 結果 | 約束もどき<結果>): 約束<結果>;

    /** catch — 転んだときの拾い方． */
    しくじったら<結果>(拾う: (躓き: 不明) => 結果 | 約束もどき<結果>): 約束<T | 結果>;

    /** finally — 転んでも転ばなくても片付ける． */
    ともかく(始末: () => 無): 約束<T>;
  }
}
