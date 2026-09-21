/**
 * API 費用のざっくり見積もり (USD)．月次の予算ガード (予算 DO) 用．
 * 請求書ではなく見積もり．Gemini の無料枠 (課金無しの AI Studio キー) では
 * そもそも一銭も掛からないので，この見張りが効いてくるのは有料キーのとき．
 */
import { 現在時刻, Temporal } from "../../核/時刻";

import { 数値, 数学, 文字列 } from "../../共通/型";
import type { 省略可 } from "../../共通/型";
import { 前を埋める, 絞る, 長さ } from "../../共通/関数";

/** Gemini Interactions API の `usage` の形． */
export interface 使用量 {
  total_input_tokens?: 省略可<数値>;
  total_output_tokens?: 省略可<数値>;
  total_thought_tokens?: 省略可<数値>;
  total_cached_tokens?: 省略可<数値>;
}

interface 単価 {
  /** 100 万入力トークンあたりの USD */
  入力: 数値;
  /** 100 万出力トークンあたりの USD (思考トークンは出力として課金) */
  出力: 数値;
}

// 100 万トークンあたりの表示価格．前方一致がいちばん長いものが勝つ．
const 料金表: Array<[接頭辞: 文字列, 単価: 単価]> = [
  // Workers AI は neuron 課金で 1 日の無料枠がある．ここの単価は有料相当の
  // 見積もりで，あえて保守的に置いてある．
  ["@cf/google/gemma-4-26b-a4b-it", { 入力: 0.1, 出力: 0.3 }],
  ["@cf/zai-org/glm-4.7-flash", { 入力: 0.06, 出力: 0.4 }],
  ["@cf/qwen/qwen3.8-27b", { 入力: 0.45, 出力: 3.2 }],
  ["@cf/", { 入力: 0.3, 出力: 2.5 }],
  ["gemini-3.7-flash", { 入力: 0.75, 出力: 3.75 }],
  ["gemini-3.5-flash-lite", { 入力: 0.1, 出力: 0.4 }],
  ["gemini-3.5-flash", { 入力: 1.5, 出力: 9 }],
  ["gemini-2.5-flash-lite", { 入力: 0.1, 出力: 0.4 }],
  ["gemini-2.5-flash", { 入力: 0.3, 出力: 2.5 }],
];

/**
 * 画像 1 枚の単価 (flux-1-schnell)．
 *
 * 言葉と違ってトークンではなく，512x512 のタイル数と拡散の手数で決まる．
 */
const 絵の単価 = { タイル: 0.0000528, 手: 0.0001056 };

/** タイルの一辺 (px)． */
const タイルの一辺 = 512;

/**
 * 絵 1 枚の概算費用．
 *
 * 1024x1024 を 4 手なら，タイル 4 枚 + 4 手で $0.00063 ほど — 言葉の返事 1 回と
 * 同じ桁．無料枠のうちは一銭も掛からない．
 */
export function 画像の概算費用ドル(幅: 数値, 高さ: 数値, 手数: 数値): 数値 {
  const タイル数 = 数学.ceil(幅 / タイルの一辺) * 数学.ceil(高さ / タイルの一辺);

  return タイル数 * 絵の単価.タイル + 手数 * 絵の単価.手;
}

// 知らないモデルには保守的な単価 (Pro 相当) を当てる．
const 既定の単価: 単価 = { 入力: 2, 出力: 12 };

// 注: google_search を使った指示文は Gemini 3.x では月あたり無料枠 (数千件) が
// あり，この bot の量はそこに遠く届かないので検索ぶんは数えていない．
export function 概算費用ドル(モデル: 文字列, 使用: 使用量): 数値 {
  const 該当 = 絞る(料金表, ([接頭辞]) => モデル.startsWith(接頭辞)).sort(
    (左, 右) => 長さ(右[0]) - 長さ(左[0]),
  )[0];
  const 単価 = 該当 ? 該当[1] : 既定の単価;

  const 入力 = 使用.total_input_tokens ?? 0;
  const キャッシュ = 使用.total_cached_tokens ?? 0;
  // 思考トークンは出力の単価で課金される．
  const 出力 = (使用.total_output_tokens ?? 0) + (使用.total_thought_tokens ?? 0);

  // キャッシュ済み入力は入力単価の 1 割ほど．
  return (
    (数学.max(入力 - キャッシュ, 0) / 1e6) * 単価.入力 +
    (キャッシュ / 1e6) * 単価.入力 * 0.1 +
    (出力 / 1e6) * 単価.出力
  );
}

/** 「2026-08」形式の月キー (UTC)．予算番が数え込む単位． */
export function 月キー(時刻: Temporal.Instant = 現在時刻()): 文字列 {
  const utc = 時刻.toZonedDateTimeISO("UTC");
  return `${utc.year}-${前を埋める(文字列(utc.month), 2, "0")}`;
}
