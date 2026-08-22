/**
 * 組み込みプロトタイプのメソッドを，日本語の関数として移植したもの．
 *
 * どれも `Function.prototype.call.bind(元のメソッド)` で作った uncurried this 版．
 * つまり `文.slice(0, 3)` が `切り出す(文, 0, 3)` になる．実体は同じ関数なので
 * 挙動もコストも変わらず，増えるのは呼び名だけ．
 *
 * 型は `as` で明示的に与えている．bind を通すと総称型の推論が落ちるため，
 * ここで一度だけ書いておいて，使う側は普通に型が付いた状態で書ける．
 */
import type { 文字列, 数値, 真偽, 配列, 読み取り専用配列, 省略可, 不明 } from "./型";

const 呼ぶ = Function.prototype.call;

// ---- 文字列 ----
export const 切り出す = 呼ぶ.bind(String.prototype.slice) as (
  文: 文字列,
  開始: 数値,
  終わり?: 数値,
) => 文字列;

export const 前後の空白を落とす = 呼ぶ.bind(String.prototype.trim) as (文: 文字列) => 文字列;

export const 置き換える = 呼ぶ.bind(String.prototype.replace) as (
  文: 文字列,
  対象: 文字列 | RegExp,
  置換: 文字列 | ((一致: 文字列, ...組: 任意[]) => 文字列),
) => 文字列;

export const すべて置き換える = 呼ぶ.bind(String.prototype.replaceAll) as (
  文: 文字列,
  対象: 文字列,
  置換: 文字列,
) => 文字列;

export const 分ける = 呼ぶ.bind(String.prototype.split) as (
  文: 文字列,
  区切り: 文字列 | RegExp,
) => 配列<文字列>;

export const 含む = 呼ぶ.bind(String.prototype.includes) as (文: 文字列, 部分: 文字列) => 真偽;

export const 前を埋める = 呼ぶ.bind(String.prototype.padStart) as (
  文: 文字列,
  長さ: 数値,
  埋める文字?: 文字列,
) => 文字列;

export const 小文字にする = 呼ぶ.bind(String.prototype.toLowerCase) as (文: 文字列) => 文字列;

export const 繰り返す = 呼ぶ.bind(String.prototype.repeat) as (文: 文字列, 回数: 数値) => 文字列;

export const 始まるか = 呼ぶ.bind(String.prototype.startsWith) as (
  文: 文字列,
  接頭辞: 文字列,
) => 真偽;

export const 終わるか = 呼ぶ.bind(String.prototype.endsWith) as (
  文: 文字列,
  接尾辞: 文字列,
) => 真偽;

export const 小数で書く = 呼ぶ.bind(Number.prototype.toFixed) as (値: 数値, 桁: 数値) => 文字列;

// ---- 配列 ----
export const 写す = 呼ぶ.bind(Array.prototype.map) as <元, 先>(
  一覧: 読み取り専用配列<元>,
  変換: (要素: 元, 添字: 数値) => 先,
) => 配列<先>;

export const 絞る = 呼ぶ.bind(Array.prototype.filter) as {
  <元, 先 extends 元>(一覧: 読み取り専用配列<元>, 判定: (要素: 元) => 要素 is 先): 配列<先>;
  <元>(一覧: 読み取り専用配列<元>, 判定: (要素: 元, 添字: 数値) => 不明): 配列<元>;
};

export const 畳む = 呼ぶ.bind(Array.prototype.reduce) as <元, 積>(
  一覧: 読み取り専用配列<元>,
  演算: (積: 積, 要素: 元) => 積,
  初期値: 積,
) => 積;

export const 繋ぐ = 呼ぶ.bind(Array.prototype.join) as (
  一覧: 読み取り専用配列<不明>,
  区切り: 文字列,
) => 文字列;

export const 取り出す = 呼ぶ.bind(Array.prototype.slice) as <要素>(
  一覧: 読み取り専用配列<要素>,
  開始?: 数値,
  終わり?: 数値,
) => 配列<要素>;

export const 逆順にする = 呼ぶ.bind(Array.prototype.reverse) as <要素>(
  一覧: 配列<要素>,
) => 配列<要素>;

export const いずれか = 呼ぶ.bind(Array.prototype.some) as <要素>(
  一覧: 読み取り専用配列<要素>,
  判定: (要素: 要素) => 不明,
) => 真偽;

export const 探す = 呼ぶ.bind(Array.prototype.find) as <要素>(
  一覧: 読み取り専用配列<要素>,
  判定: (要素: 要素) => 不明,
) => 省略可<要素>;

export const 一覧に含む = 呼ぶ.bind(Array.prototype.includes) as <要素>(
  一覧: 読み取り専用配列<要素>,
  値: 要素,
) => 真偽;

export const 末尾に足す = 呼ぶ.bind(Array.prototype.push) as <要素>(
  一覧: 配列<要素>,
  ...値: 要素[]
) => 数値;

export const 並べ替える = 呼ぶ.bind(Array.prototype.sort) as <要素>(
  一覧: 配列<要素>,
  比べる: (左: 要素, 右: 要素) => 数値,
) => 配列<要素>;

export const 番号付きで = 呼ぶ.bind(Array.prototype.entries) as <要素>(
  一覧: 読み取り専用配列<要素>,
) => IterableIterator<[数値, 要素]>;

/** 総和など，初期値から畳み込む． */
export const 総和 = (一覧: 読み取り専用配列<数値>): 数値 => 畳む(一覧, (積, 値) => 積 + 値, 0);

/** 可変長の捕捉群は，何が来るか型で言えない． */
type 任意 = any;

/** 文字列でも配列でも長さ． */
export function 長さ(もの: { readonly length: 数値 }): 数値 {
  return もの.length;
}

/** 中身が無いか． */
export function 空か(もの: { readonly length: 数値 }): 真偽 {
  return もの.length === 0;
}
