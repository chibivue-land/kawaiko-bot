/**
 * Cloudflare Workers AI の text-to-image．
 *
 * FLUX.1 [schnell] は Cloudflare 自身がホストしているので，1 日ぶんの neuron
 * 無料枠から引かれる．しかも桁が違って安い — 1 枚あたり 512x512 のタイル 4 枚
 * (4.8 neuron/枚) と 4 手 (9.6 neuron/手) で 58 neuron ほど．1 日 10,000 の枠なら
 * 170 枚ぶん．言葉で返事をするのと同じくらいの重さしかない．
 *
 * 費用は 料金.ts の 画像の概算費用ドル が見積もり，予算番が数える．
 */
import { 画像の概算費用ドル } from "./料金";

import type { 描いた絵, 絵描き } from "../../振る舞い/接続口";

import { 偽, 文字列, 新しい例外, 真 } from "../../共通/型";
import type { 不明, 省略可, 約束, 記録 } from "../../共通/型";
import { しくじる, もし } from "../../共通/構文";
import { 空か } from "../../共通/関数";

/**
 * 出来上がりの一辺 (px)．
 *
 * こちらが選べる値ではない — flux-1-schnell が受け取るのは prompt と steps
 * だけで，大きさはモデルが決める．ここに置いてあるのは費用を見積もるための
 * 前提で，実際に渡してはいない．
 */
export const 出来上がりの一辺 = 1024;

/** 拡散の手数．schnell は 4 手で仕上がるよう蒸留してある (上限 8)． */
export const 描く手数 = 4;

export const 絵のモデル = "@cf/black-forest-labs/flux-1-schnell";

export function WorkersAIの絵描き(ai: Ai): 絵描き {
  // env.AI.run は組み込みモデル一覧で型が付いている．任意の id 用に広げる．
  const 実行 = ai.run.bind(ai) as (モデル: 文字列, 入力: 記録<文字列, 不明>) => 約束<絵の応答>;

  return {
    使えるか: 真,

    描く(指示: 文字列): 約束<描いた絵> {
      // 渡してよいのは prompt と steps だけ．余計な鍵を足すと，親切に無視されず
      // «Additional or unevaluated properties ... not allowed» で断られる
      // (width / height / num_steps を渡して本番で断られた)．
      return 実行(絵のモデル, { prompt: 指示, steps: 描く手数 }).んで((応答) =>
        もし(空か(応答.image ?? ""), {
          であれば: (): 描いた絵 => しくじる(新しい例外("絵: モデルが何も返さなかった")),
          でなければ: (): 描いた絵 => ({
            中身: 応答.image!,
            種別: "image/jpeg",
            名前: "kawaiko.jpg",
            費用ドル: 画像の概算費用ドル(出来上がりの一辺, 出来上がりの一辺, 描く手数),
          }),
        }),
      );
    },
  };
}

/** 描けない構成のときの身代わり． */
export const 絵描きなし: 絵描き = {
  使えるか: 偽,
  描く: () => しくじる(新しい例外("絵: 絵描きが繋がっていない")),
};

/** flux は base64 の文字列で返す． */
interface 絵の応答 {
  image?: 省略可<文字列>;
}
