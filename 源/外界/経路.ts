import type { 記憶への問い } from "../振る舞い/記憶操作";

import { 応答, 数値, 真偽 } from "../共通/型";
import { 前後の空白を落とす, 空か } from "../共通/関数";
import { もし, 場合分け } from "../共通/構文";
import type {
  文字列,
  数値 as 数値型,
  真偽 as 真偽型,
  応答 as 応答型,
  要求 as 要求型,
  場所 as 場所型,
  空,
  省略可,
  不明,
} from "../共通/型";

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
export function 記憶への問いを読み取る(手段: 文字列, 場所: 場所型): 省略可<記憶への問い> {
  const サーバーid = 場所.searchParams.get("guild") ?? undefined;
  const 理由 = 場所.searchParams.get("note") ?? undefined;

  return 場合分け(`${手段} ${場所.pathname}`, {
    "GET /memory": () =>
      もし(サーバーid !== undefined, {
        であれば: (): 記憶への問い => ({ 種別: "現状", サーバーid: サーバーid! }),
        でなければ: (): 記憶への問い => ({ 種別: "サーバー一覧" }),
      }),

    "POST /memory/retract-batch": () => {
      const 識別子 = 場所.searchParams.get("batch");

      return もし(サーバーid !== undefined && 識別子 !== null, {
        であれば: (): 省略可<記憶への問い> => ({
          種別: "回を取り消す",
          サーバーid: サーバーid!,
          識別子: 識別子!,
          理由,
        }),
        でなければ: (): 省略可<記憶への問い> => undefined,
      });
    },

    "POST /memory/rollback": () => {
      // 厳しく読む．`数値(null)` も `数値("")` も 0 になるので，seq を書き忘れた
      // だけのリクエストが「位置 0 へ巻き戻す」= サーバーごと忘れる，になってしまう．
      const 連番 = 位置を読む(場所.searchParams.get("seq"));

      return もし(サーバーid !== undefined && 連番 !== undefined, {
        であれば: (): 省略可<記憶への問い> => ({
          種別: "巻き戻す",
          サーバーid: サーバーid!,
          連番: 連番!,
          理由,
        }),
        でなければ: (): 省略可<記憶への問い> => undefined,
      });
    },
  });
}

/** 0 以上の整数の位置．それ以外は undefined． */
function 位置を読む(生: 文字列 | 空): 省略可<数値型> {
  return もし(生 === null || 空か(前後の空白を落とす(生)), {
    であれば: (): 省略可<数値型> => undefined,
    でなければ: () => {
      const 連番 = 数値(生!);

      return もし(数値.isInteger(連番) && 連番 >= 0, {
        であれば: (): 省略可<数値型> => 連番,
        でなければ: (): 省略可<数値型> => undefined,
      });
    },
  });
}

/** 記憶を見せる / 変える口を守る Bearer の確認． */
export function 認可されているか(要求: 要求型, 合言葉: 省略可<文字列>): 真偽型 {
  return 真偽(合言葉) && 要求.headers.get("Authorization") === `Bearer ${合言葉}`;
}

export function JSONで返す(本体: 不明, 状態: 数値型 = 200): 応答型 {
  return new 応答(JSON.stringify(本体, null, 2), {
    status: 状態,
    headers: { "Content-Type": "application/json" },
  });
}
