/**
 * Gemini Interactions API．呼び出し側が求めたときだけ，組み込みの google_search
 * ツール (グラウンディング) でブラウジングさせる．
 *
 * 同じ口で Gemma 4 も受け持つ．AI Studio のキーなら無料で，枠は Gemini のモデルとは
 * 別に数えられる．検索のツールは Gemma には渡さない — この口越しに受けてくれるかを
 * 確かめておらず，断られるとそのモデルが 30 分休みに入るので．
 */
import { GoogleGenAI } from "@google/genai";

import type { モデル提供者 } from "./提供者";
import { 概算費用ドル } from "./料金";

import type { 思考の深さ, 発話の依頼, 発話の結果 } from "../../振る舞い/接続口";

import { 取り次ぐ } from "../../共通/取り次ぎ";
import { 偽, 文字列, 未定義, 真 } from "../../共通/型";
import type { 約束, 配列 } from "../../共通/型";
import { もし } from "../../共通/構文";
import { 等しい } from "../../共通/演算";
import { 写す, 前後の空白を落とす, 空か } from "../../共通/関数";

/**
 * 相手の入力の形．
 *
 * ライブラリはこの型を公開していない (interactions 名前空間の中に隠れている) ので，
 * 同じ形をこちらで名指ししておく．構造さえ合っていれば受け取ってもらえる．
 */
type やりとりの中身 =
  | { type: "text"; text: 文字列 }
  | { type: "image"; data: 文字列; mime_type: 文字列 };

/**
 * 指示文と，見せる画像．
 *
 * 画像が無いときはただの文字列で送る — 相手の既定の形なので，余計な差を作らない．
 */
function 入力を組み立てる(依頼: 発話の依頼): 文字列 | 配列<やりとりの中身> {
  const 画像一覧 = 依頼.画像一覧 ?? [];

  return もし<文字列 | 配列<やりとりの中身>>(空か(画像一覧), {
    であれば: () => 依頼.指示文,
    でなければ: () => [
      { type: "text", text: 依頼.指示文 },
      ...写す(画像一覧, (画像): やりとりの中身 => ({
        type: "image",
        data: 画像.中身,
        mime_type: 画像.種別,
      })),
    ],
  });
}

export function Gemini提供者(apiキー: 文字列): モデル提供者 {
  // ライブラリのコンストラクタ．ここは相手の作法に合わせる．
  // 取り次ぎ越しにすると，向こうが約束を返そうと thenable を返そうと `.んで` で受けられる．
  const 客体 = 取り次ぐ(new GoogleGenAI({ apiKey: apiキー }));
  return {
    名前: "gemini",
    受け持つか: (モデル) => モデル.startsWith("gemini-") || モデル.startsWith("gemma-"),
    画像を見られるか: () => 真,
    実行する(モデル: 文字列, 依頼: 発話の依頼): 約束<発話の結果> {
      return 客体.interactions
        .create({
          model: モデル,
          input: 入力を組み立てる(依頼),
          system_instruction: 依頼.指示書,
          tools:
            依頼.検索を許す && モデル.startsWith("gemini-") ? [{ type: "google_search" }] : 未定義,
          generation_config: {
            max_output_tokens: 依頼.最大トークン ?? 2048,
            thinking_level: 思考の段(モデル, 依頼.深さ ?? "low"),
          },
          // Google 側にやりとりを残す必要は無い．
          store: 偽,
        })
        .んで((やりとり) => {
          const 費用ドル = 概算費用ドル(モデル, やりとり.usage ?? {});
          const 拒否された =
            等しい(やりとり.status, "failed") || 等しい(やりとり.status, "incomplete");

          return {
            本文: 拒否された ? "" : 前後の空白を落とす(やりとり.output_text ?? ""),
            費用ドル,
            モデル,
            拒否された,
          };
        });
    },
  };
}

/**
 * 相手に渡す思考の段．
 *
 * Gemma 4 の段は「切る (minimal)」と「入れる (high)」の 2 つしか無く，low を渡すと
 * 400 で断られる．点呼で両方の Gemma が 400 を返して分かった (2026-10-20)．
 * 浅くてよい回は切り，それより深く頼まれた回は入れる．
 */
export function 思考の段(モデル: 文字列, 深さ: 思考の深さ): 文字列 {
  return もし(モデル.startsWith("gemma-"), {
    であれば: () => (等しい(深さ, "low") ? "minimal" : "high"),
    でなければ: () => 深さ,
  });
}
