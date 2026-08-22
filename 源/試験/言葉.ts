import { describe, expect, it, vi } from "vitest";
import { 偽, 数値, 文字列, 未定義 } from "../共通/型";
import type { 不明, 無, 省略可, 約束, 記録 } from "../共通/型";
import { 長さ } from "../共通/関数";
import { より大きい, より小さい, 以上, 以下, 等しい } from "../共通/演算";
import { しくじる } from "../共通/構文";


/**
 * テストの語彙．
 *
 * vitest の describe / it / expect をそのまま呼ぶと，日本語で書いた仕様の中に
 * 英語の骨組みだけが残る．読み下してそのまま文になるように包んである:
 *
 *   仕様("反復度", () => {
 *     検証("名前が違っても同じ骨格なら検出する", () => {
 *       期待(反復しているか(候補, 直近)).である(true);
 *     });
 *   });
 *
 * 中身は vitest そのもので，落ちたときの差分も元のまま出る．
 */

/** describe — 何の仕様の話か． */
export const 仕様 = describe;

/** it — 何が成り立つべきか． */
export const 検証 = it;

/** vi — 偽の関数と時計． */
export const 偽装 = vi;

export interface 判定 {
  /** toBe — 同一である． */
  である(期待値: 不明): 無;

  /** toEqual — 中身が等しい． */
  と等しい(期待値: 不明): 無;

  /** toContain — 含んでいる． */
  を含む(部分: 不明): 無;

  /** toMatchObject — 少なくともこの形をしている． */
  の形をしている(形: 不明): 無;

  /** toHaveLength — 長さがこれである． */
  の長さが(長さ: 数値): 無;

  /** toBeUndefined */
  が未定義(): 無;

  /** toBeNull */
  が空(): 無;

  /** toBeTruthy */
  が真(): 無;

  /** toBeFalsy */
  が偽(): 無;

  /** toBeGreaterThan */
  より大きい(値: 数値): 無;

  /** toBeGreaterThanOrEqual */
  以上(値: 数値): 無;

  /** toBeLessThan */
  より小さい(値: 数値): 無;

  /** toBeLessThanOrEqual */
  以下(値: 数値): 無;

  /** toBeCloseTo — 浮動小数の丸め違いを許す． */
  とほぼ等しい(値: 数値, 桁?: 省略可<数値>): 無;

  /** toMatch — 正規表現ないし部分文字列に一致する． */
  に一致する(型: RegExp | 文字列): 無;

  /** toHaveBeenCalled */
  呼ばれた(): 無;

  /** toHaveBeenCalledOnce */
  一度だけ呼ばれた(): 無;

  /** toHaveBeenCalledTimes */
  呼ばれた回数が(回数: 数値): 無;

  /** rejects.toThrow — 投げることを確かめる． */
  しくじる(文: 文字列): 約束<無>;

  /** not — 以下の判定をすべて否定する． */
  readonly 否: 判定;
}

/** expect — 値に期待を置く．第 2 引数は落ちたときに出る覚え書き． */
export function 期待(値: 不明, 覚え書き?: 省略可<文字列>): 判定 {
  return 判定を作る(値, 覚え書き, 偽);
}

function 判定を作る(値: 不明, 覚え書き: 省略可<文字列>, 否定するか: boolean): 判定 {
  // biome/oxlint 的には any だが，vitest の matcher は値ごとに型が変わるので
  // ここで一度だけ緩める．外へ漏らさない．
  const 素 = 等しい(覚え書き, 未定義) ? expect(値) : expect(値, 覚え書き);
  const 的 = (否定するか ? 素.not : 素) as unknown as 記録<文字列, (...引数: 不明[]) => 無>;

  return {
    である: (期待値) => 的.toBe!(期待値),
    と等しい: (期待値) => 的.toEqual!(期待値),
    を含む: (部分) => 的.toContain!(部分),
    の形をしている: (形) => 的.toMatchObject!(形),
    の長さが: (長さ) => 的.toHaveLength!(長さ),
    が未定義: () => 的.toBeUndefined!(),
    が空: () => 的.toBeNull!(),
    が真: () => 的.toBeTruthy!(),
    が偽: () => 的.toBeFalsy!(),
    より大きい: (比較値) => 的.toBeGreaterThan!(比較値),
    以上: (比較値) => 的.toBeGreaterThanOrEqual!(比較値),
    より小さい: (比較値) => 的.toBeLessThan!(比較値),
    以下: (比較値) => 的.toBeLessThanOrEqual!(比較値),
    とほぼ等しい: (比較値, 桁) => 的.toBeCloseTo!(比較値, 桁),
    に一致する: (型) => 的.toMatch!(型),
    呼ばれた: () => 的.toHaveBeenCalled!(),
    一度だけ呼ばれた: () => 的.toHaveBeenCalledOnce!(),
    呼ばれた回数が: (回数) => 的.toHaveBeenCalledTimes!(回数),
    しくじる: async (文) => {
      const 待ち = 否定するか ? expect(値).rejects.not : expect(値).rejects;
      await (待ち as unknown as { toThrow: (文: 文字列) => 約束<無> }).toThrow(文);
    },
    get 否() {
      return 判定を作る(値, 覚え書き, !否定するか);
    },
  };
}
