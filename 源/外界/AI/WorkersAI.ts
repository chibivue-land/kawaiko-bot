/**
 * Cloudflare Workers AI．モデル id は "@cf/" 始まり．API キーは要らず，アカウント
 * 自身の (小さな) 1 日ぶんの neuron 無料枠から引かれる．
 *
 * 目のあるモデルもここに居る．画像は OpenAI と同じ形 — content を配列にして，
 * `image_url` に data URI を入れる — で渡す．どのモデルが見られるかは
 * 目のあるモデル に列挙してある．
 */
import type { 発話の依頼, 発話の結果 } from "../../振る舞い/接続口";
import type { モデル提供者 } from "./提供者";
import { 概算費用ドル } from "./料金";
import { 偽, 数値, 文字列 } from "../../共通/型";
import type { 不明, 省略可, 約束, 記録, 読み取り専用配列, 配列 } from "../../共通/型";
import { 一覧に含む, 写す, 前後の空白を落とす, 空か, 置き換える } from "../../共通/関数";
import { 否定 } from "../../共通/演算";
import { もし } from "../../共通/構文";

export function WorkersAI提供者(ai: Ai): モデル提供者 {
  // env.AI.run は組み込みモデル一覧で型が付いている．任意の id 用に広げる．
  const 実行 = ai.run.bind(ai) as (モデル: 文字列, 入力: 記録<文字列, 不明>) => 約束<応答の形>;

  return {
    名前: "workers-ai",
    受け持つか: (モデル) => モデル.startsWith("@cf/"),
    画像を見られるか: (モデル) => 一覧に含む(目のあるモデル, モデル),
    実行する(モデル: 文字列, 依頼: 発話の依頼): 約束<発話の結果> {
      return 実行(モデル, {
        messages: [
          { role: "system", content: 依頼.指示書 },
          { role: "user", content: 本文を組み立てる(モデル, 依頼) },
        ],
        max_completion_tokens: 依頼.最大トークン ?? 1024,
        // GLM 系は chat_template_kwargs の enable_thinking を見る．それ以外は
        // reasoning_effort (呼び出し側の「深さ」に対応) を見る．
        reasoning_effort: 依頼.深さ ?? "low",
        chat_template_kwargs: { enable_thinking: 偽 },
      }).んで((応答) => {
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
      });
    },
  };
}

/**
 * 目のあるモデル．
 *
 * ここに載っていないモデルへ画像を渡しても，黙って無視されるか，形が違うと
 * 言って断られるだけ．「見えるつもりで見えていない」がいちばん悪いので，
 * 見られると分かっているものだけを名指しする．
 */
const 目のあるモデル: 読み取り専用配列<文字列> = [
  // 2026-08-17 に来た Qwen の視覚モデル．Cloudflare 自身がホストしているので
  // 1 日の neuron 無料枠から引かれる．
  "@cf/qwen/qwen3.8-27b",
  "@cf/meta/llama-3.2-11b-vision-instruct",
  "@cf/mistralai/mistral-small-3.1-24b-instruct",
  "@cf/meta/llama-4-scout-17b-16e-instruct",
];

/**
 * 目のあるモデルには指示文と画像を，そうでないモデルには指示文だけを渡す．
 *
 * 見えないモデルに配列を渡しても意味が無いどころか，形が違うと言って断られる
 * ことがある．添付があったことは指示文にも書いてあるので，見えないなりの返事に
 * はなる．
 */
function 本文を組み立てる(モデル: 文字列, 依頼: 発話の依頼): 文字列 | 配列<中身の一部> {
  const 画像一覧 = 依頼.画像一覧 ?? [];

  return もし<文字列 | 配列<中身の一部>>(
    空か(画像一覧) || 否定(一覧に含む(目のあるモデル, モデル)),
    {
      であれば: () => 依頼.指示文,
      でなければ: () => [
        { type: "text", text: 依頼.指示文 },
        ...写す(画像一覧, (画像): 中身の一部 => ({
          type: "image_url",
          image_url: { url: `data:${画像.種別};base64,${画像.中身}` },
        })),
      ],
    },
  );
}

/** OpenAI と同じ形の content の要素． */
type 中身の一部 =
  | { type: "text"; text: 文字列 }
  | { type: "image_url"; image_url: { url: 文字列 } };

/** OpenAI 互換の応答．古い Workers AI のモデルは `response` を使う． */
interface 応答の形 {
  response?: 省略可<文字列>;
  choices?: 省略可<Array<{ message?: 省略可<{ content?: 省略可<文字列> }> }>>;
  usage?: 省略可<{ prompt_tokens?: 省略可<数値>; completion_tokens?: 省略可<数値> }>;
}
