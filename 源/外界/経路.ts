import type { 記憶への問い } from "../振る舞い/記憶操作";
import { 偽, 場所, 応答, 数値, 文字列, 新しい応答, 未定義, 真偽, 空, 要求 } from "../共通/型";
import type { 不明, 省略可 } from "../共通/型";
import { 前後の空白を落とす, 空か } from "../共通/関数";
import { かつ, 以上, 等しい, 等しくない } from "../共通/演算";
import { もし, 場合分け } from "../共通/構文";

/**
 * Worker の HTTP 面の，リクエストの読み取り．
 *
 * 入口.ts と分けてあるのは，Durable Object のクラス (ひいては
 * `cloudflare:workers`) をモジュールグラフに引き込まずに試験するため．ここは
 * バインディングに一切触らず，URL を意図へ変えるだけ．
 */

/**
 *   GET  /memory                                kawaiko が観測したサーバー
 *   GET  /memory?guild=<id>                     信じていること + 直近の学習の回
 *   POST /memory/retract-batch?guild=&batch=    学習 1 回を取り消す
 *   POST /memory/rollback?guild=&seq=           知識をその位置へ戻す
 *
 * 取り消しは POST 限定．リンクのプレビューや通りすがりのクローラーに kawaiko の
 * 記憶を消させないため．
 */
export function 記憶への問いを読み取る(手段: 文字列, 行き先: 場所): 省略可<記憶への問い> {
  const サーバーid = 行き先.searchParams.get("guild") ?? 未定義;
  const 理由 = 行き先.searchParams.get("note") ?? 未定義;

  return 場合分け(`${手段} ${行き先.pathname}`, {
    "GET /memory": () =>
      もし(等しくない(サーバーid, 未定義), {
        であれば: (): 記憶への問い => ({ 種別: "現状", サーバーid: サーバーid! }),
        でなければ: (): 記憶への問い => ({ 種別: "サーバー一覧" }),
      }),

    "POST /memory/retract-batch": () => {
      const 識別子 = 行き先.searchParams.get("batch");

      return もし(等しくない(サーバーid, 未定義) && 等しくない(識別子, 空), {
        であれば: (): 省略可<記憶への問い> => ({
          種別: "回を取り消す",
          サーバーid: サーバーid!,
          識別子: 識別子!,
          理由,
        }),
        でなければ: (): 省略可<記憶への問い> => 未定義,
      });
    },

    "POST /memory/rollback": () => {
      // 厳しく読む．`数値(null)` も `数値("")` も 0 になるので，seq を書き忘れた
      // だけのリクエストが「位置 0 へ巻き戻す」= サーバーごと忘れる，になってしまう．
      const 連番 = 位置を読む(行き先.searchParams.get("seq"));

      return もし(等しくない(サーバーid, 未定義) && 等しくない(連番, 未定義), {
        であれば: (): 省略可<記憶への問い> => ({
          種別: "巻き戻す",
          サーバーid: サーバーid!,
          連番: 連番!,
          理由,
        }),
        でなければ: (): 省略可<記憶への問い> => 未定義,
      });
    },
  });
}

/** 0 以上の整数の位置．それ以外は undefined． */
function 位置を読む(生: 文字列 | 空): 省略可<数値> {
  return もし(等しい(生, 空) || 空か(前後の空白を落とす(生)), {
    であれば: (): 省略可<数値> => 未定義,
    でなければ: () => {
      const 連番 = 数値(生!);

      return もし(数値.isInteger(連番) && 以上(連番, 0), {
        であれば: (): 省略可<数値> => 連番,
        でなければ: (): 省略可<数値> => 未定義,
      });
    },
  });
}

/** 記憶を見せる / 変える口を守る Bearer の確認． */
export function 認可されているか(要求: 要求, 合言葉: 省略可<文字列>): 真偽 {
  return (
    かつ(真偽(合言葉), () => 等しい(要求.headers.get("Authorization"), `Bearer ${合言葉}`)) ?? 偽
  );
}

export function JSONで返す(本体: 不明, 状態: 数値 = 200): 応答 {
  return 新しい応答(JSON.stringify(本体, 空, 2), {
    status: 状態,
    headers: { "Content-Type": "application/json" },
  });
}
