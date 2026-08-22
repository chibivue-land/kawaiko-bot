import { 仕様, 検証, 期待, 偽装する } from "../../試験/言葉";
import { WorkersAI提供者 } from "./WorkersAI";
import { 偽, 文字列, 真 } from "../../共通/型";
import type { 不明, 記録, 配列 } from "../../共通/型";

const 依頼 = { 指示書: "指示書", 指示文: "これ何" };
const 図 = { 種別: "image/png", 中身: "44GC", 名前: "図.png" };

function 推論を作る() {
  const 呼ばれた: 配列<記録<文字列, 不明>> = [];
  const 走らせる = 偽装する(async (_モデル: 文字列, 入力: 記録<文字列, 不明>) => {
    呼ばれた.push(入力);

    return { response: "ふーん", usage: { prompt_tokens: 10, completion_tokens: 5 } };
  });

  return { 呼ばれた, ai: { run: 走らせる } as unknown as Ai };
}

仕様("WorkersAI提供者", () => {
  検証("@cf/ のモデルだけ受け持つ", () => {
    const 提供者 = WorkersAI提供者(推論を作る().ai);

    期待(提供者.受け持つか("@cf/qwen/qwen3.8-27b")).である(真);
    期待(提供者.受け持つか("gemini-3.5-flash-lite")).である(偽);
  });

  検証("目のあるモデルだけが画像を見られると名乗る", () => {
    const 提供者 = WorkersAI提供者(推論を作る().ai);

    期待(提供者.画像を見られるか("@cf/qwen/qwen3.8-27b")).である(真);
    期待(提供者.画像を見られるか("@cf/zai-org/glm-4.7-flash")).である(偽);
  });

  検証("目のあるモデルには，指示文と画像を OpenAI と同じ形で渡す", () => {
    const { 呼ばれた, ai } = 推論を作る();

    return WorkersAI提供者(ai)
      .実行する("@cf/qwen/qwen3.8-27b", { ...依頼, 画像一覧: [図] })
      .んで(() => {
        期待(呼ばれた[0]!.messages).と等しい([
          { role: "system", content: "指示書" },
          {
            role: "user",
            content: [
              { type: "text", text: "これ何" },
              { type: "image_url", image_url: { url: "data:image/png;base64,44GC" } },
            ],
          },
        ]);
      });
  });

  検証("目の無いモデルには，画像が来ていても指示文だけを渡す", () => {
    const { 呼ばれた, ai } = 推論を作る();

    return WorkersAI提供者(ai)
      .実行する("@cf/zai-org/glm-4.7-flash", { ...依頼, 画像一覧: [図] })
      .んで(() => {
        // 形が違うと言って断られるより，見えないなりに答えるほうがまし．
        期待(呼ばれた[0]!.messages).と等しい([
          { role: "system", content: "指示書" },
          { role: "user", content: "これ何" },
        ]);
      });
  });

  検証("画像が無ければ，目があっても素の文字列で渡す", () => {
    const { 呼ばれた, ai } = 推論を作る();

    return WorkersAI提供者(ai)
      .実行する("@cf/qwen/qwen3.8-27b", 依頼)
      .んで(() => {
        期待(呼ばれた[0]!.messages).と等しい([
          { role: "system", content: "指示書" },
          { role: "user", content: "これ何" },
        ]);
      });
  });

  検証("漏れた思考ブロックは落とす", () => {
    const 走らせる = 偽装する(async () => ({ response: "<think>ぐぬぬ</think>  ふーん" }));

    return WorkersAI提供者({ run: 走らせる } as unknown as Ai)
      .実行する("@cf/zai-org/glm-4.7-flash", 依頼)
      .んで((結果) => {
        期待(結果.本文).である("ふーん");
      });
  });
});
