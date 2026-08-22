/**
 * Gemini Interactions API．呼び出し側が求めたときだけ，組み込みの google_search
 * ツール (グラウンディング) でブラウジングさせる．
 */
import { GoogleGenAI } from "@google/genai";
import type { 発話の依頼, 発話の結果 } from "../../振る舞い/接続口";
import type { モデル提供者 } from "./提供者";
import { 概算費用ドル } from "./料金";
import { 前後の空白を落とす } from "../../共通/関数";
import type { 文字列, 約束 } from "../../共通/型";

export function Gemini提供者(apiキー: 文字列): モデル提供者 {
  const 客体 = new GoogleGenAI({ apiKey: apiキー });
  return {
    名前: "gemini",
    受け持つか: (モデル) => モデル.startsWith("gemini-"),
    async 実行する(モデル: 文字列, 依頼: 発話の依頼): 約束<発話の結果> {
      const やりとり = await 客体.interactions.create({
        model: モデル,
        input: 依頼.指示文,
        system_instruction: 依頼.指示書,
        tools: 依頼.検索を許す ? [{ type: "google_search" }] : undefined,
        generation_config: {
          max_output_tokens: 依頼.最大トークン ?? 2048,
          thinking_level: 依頼.深さ ?? "low",
        },
        // Google 側にやりとりを残す必要は無い．
        store: false,
      });

      const 費用ドル = 概算費用ドル(モデル, やりとり.usage ?? {});
      const 拒否された = やりとり.status === "failed" || やりとり.status === "incomplete";
      return {
        本文: 拒否された ? "" : 前後の空白を落とす(やりとり.output_text ?? ""),
        費用ドル,
        モデル,
        拒否された,
      };
    },
  };
}
