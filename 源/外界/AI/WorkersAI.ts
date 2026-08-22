/**
 * Cloudflare Workers AI．モデル id は "@cf/" 始まり．API キーは要らず，アカウント
 * 自身の (小さな) 1 日ぶんの neuron 無料枠から引かれる．
 */
import type { 発話の依頼, 発話の結果 } from "../../振る舞い/接続口";
import type { モデル提供者 } from "./提供者";
import { 概算費用ドル } from "./料金";
import { 置き換える, 前後の空白を落とす } from "../../共通/関数";
import type { 文字列, 数値, 約束, 省略可, 記録, 不明 } from "../../共通/型";

export function WorkersAI提供者(ai: Ai): モデル提供者 {
  // env.AI.run は組み込みモデル一覧で型が付いている．任意の id 用に広げる．
  const 実行 = ai.run.bind(ai) as (モデル: 文字列, 入力: 記録<文字列, 不明>) => 約束<応答の形>;

  return {
    名前: "workers-ai",
    受け持つか: (モデル) => モデル.startsWith("@cf/"),
    async 実行する(モデル: 文字列, 依頼: 発話の依頼): 約束<発話の結果> {
      const 応答 = await 実行(モデル, {
        messages: [
          { role: "system", content: 依頼.指示書 },
          { role: "user", content: 依頼.指示文 },
        ],
        max_completion_tokens: 依頼.最大トークン ?? 1024,
        // GLM 系は chat_template_kwargs の enable_thinking を見る．それ以外は
        // reasoning_effort (呼び出し側の「深さ」に対応) を見る．
        reasoning_effort: 依頼.深さ ?? "low",
        chat_template_kwargs: { enable_thinking: false },
      });

      const 費用ドル = 概算費用ドル(モデル, {
        total_input_tokens: 応答.usage?.prompt_tokens ?? 0,
        total_output_tokens: 応答.usage?.completion_tokens ?? 0,
      });
      // 切り替えが効かなかったときのために，漏れた思考ブロックを落とす．
      const 生 = 応答.choices?.[0]?.message?.content ?? 応答.response ?? "";
      return {
        本文: 前後の空白を落とす(置き換える(生, /<think>[\s\S]*?<\/think>/g, "")),
        費用ドル,
        モデル,
      };
    },
  };
}

/** OpenAI 互換の応答．古い Workers AI のモデルは `response` を使う． */
interface 応答の形 {
  response?: 省略可<文字列>;
  choices?: 省略可<Array<{ message?: 省略可<{ content?: 省略可<文字列> }> }>>;
  usage?: 省略可<{ prompt_tokens?: 省略可<数値>; completion_tokens?: 省略可<数値> }>;
}
