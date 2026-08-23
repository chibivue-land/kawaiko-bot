import { 空, 未定義 } from "./型";
import type { 文字列, 真偽, 不明, 約束, 記録 } from "./型";

/**
 * 日本語を解さない相手との取り次ぎ．
 *
 * 外部ライブラリの返すものは，こちらの都合を知らない．とくに Drizzle の
 * クエリビルダは「`then` は持つが Promise ではない」thenable なので，
 * Promise.prototype に足した `.んで` が生えていない．呼ぶ側で毎回
 * `Promise.resolve(...)` を挟むと，何をしているのかより「包み直している」ほうが
 * 目立ってしまう．
 *
 * そこで Proxy を一枚かぶせて，
 *
 * - `.んで` `.しくじったら` `.ともかく` を訊かれたら，その場で約束にして渡す
 * - メソッドの戻り値がまたオブジェクトなら，同じ取り次ぎをかぶせ直す
 *   (`db.select().from(表).where(...)` のような連鎖の途中でも効くように)
 *
 * `this` には proxy ではなく元のオブジェクトを渡す．ライブラリ内部の private
 * フィールドは proxy 越しだと読めないことがあるため．
 */

const 続きの名前 = new Set(["んで", "しくじったら", "ともかく"]);

const 約束の続き: 記録<文字列, "then" | "catch" | "finally"> = {
  んで: "then",
  しくじったら: "catch",
  ともかく: "finally",
};

function 続きを持つか(値: 不明): 値 is PromiseLike<不明> {
  return (
    (typeof 値 === "object" || typeof 値 === "function") &&
    値 !== 空 &&
    typeof (値 as { then?: 不明 }).then === "function"
  );
}

function 包み直す(値: 不明): 不明 {
  return (typeof 値 === "object" || typeof 値 === "function") && 値 !== 空
    ? 取り次ぐ(値 as object)
    : 値;
}

/** 相手に取り次ぎを一枚かぶせる． */
export function 取り次ぐ<相手 extends object>(相手: 相手): 相手 {
  return new Proxy(相手, {
    get(的, 名前, 受け手) {
      const 続き = typeof 名前 === "string" ? 約束の続き[名前] : 未定義;

      if (続き !== 未定義 && 続きの名前.has(名前 as string) && 続きを持つか(的)) {
        const 約 = Promise.resolve(的) as 約束<不明>;

        return (約[続き] as (...引数: 不明[]) => 不明).bind(約);
      }

      const 値 = Reflect.get(的, 名前, 受け手);

      if (typeof 値 !== "function") return 値;

      // this は proxy ではなく元の相手．内部の private に触れなくなるのを避ける．
      return (...引数: 不明[]) => 包み直す((値 as (...引数: 不明[]) => 不明).apply(的, 引数));
    },
  });
}

/** 取り次ぎ越しでも thenable かどうか (試験用)． */
export function 続けられるか(値: 不明): 真偽 {
  return 続きを持つか(値);
}
