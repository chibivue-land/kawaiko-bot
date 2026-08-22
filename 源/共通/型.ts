/**
 * 組み込み型の日本語別名。
 *
 * このリポジトリのソースは識別子もコメントも日本語で書く。組み込み型だけ英語で
 * 残ると読み口が途切れるので、ここで別名を与えて全レイヤーがこれを使う。
 *
 * 型と値を同じ名前で輸出しているものがある (`数値` は型 `number` と値
 * `Number` の両方)。おかげで `x: 数値` と `数値.isFinite(x)` がどちらも書ける。
 *
 * 外の世界と名前で握手しているもの — Discord や Gemini の JSON の項目名、
 * SQL の列名、wrangler.jsonc が宣言する binding 名、Durable Object のクラス名 —
 * は別名を付けない。あれは identifier ではなく protocol なので。
 */

// ---- 基本型 ----
export type 文字列 = string;
export const 文字列 = String;

export type 数値 = number;
export const 数値 = Number;

export type 真偽 = boolean;
export const 真偽 = Boolean;

/** 返り値がないこと。 */
export type 無 = void;

/** 値が入っていないこと。 */
export type 未定義 = undefined;
export const 未定義 = undefined;

/** 「無い」と明示的に置いてあること。 */
export type 空 = null;
export const 空 = null;
/** 型が分からないこと。`any` と違い、使う前に絞り込みを強制される。 */
export type 不明 = unknown;

// ---- 総称型 ----
export type 約束<T> = Promise<T>;
export type 配列<T> = T[];
export type 読み取り専用配列<T> = readonly T[];
export type 省略可<T> = T | undefined;
export type 一部<T> = Partial<T>;
export type 読み取り専用<T> = Readonly<T>;
export type 記録<鍵 extends keyof never, 値> = Record<鍵, 値>;

export type 対応表<鍵, 値> = Map<鍵, 値>;
export const 対応表 = Map;
export type 読み取り専用対応表<鍵, 値> = ReadonlyMap<鍵, 値>;

export type 集合<T> = Set<T>;
export const 集合 = Set;
export type 読み取り専用集合<T> = ReadonlySet<T>;

// ---- 実行環境 ----
export type 要求 = Request;
export const 要求 = Request;
export type 応答 = Response;
export const 応答 = Response;
export type 例外 = Error;
export const 例外 = Error;
export type 場所 = URL;
export const 場所 = URL;

export const 数学 = Math;
