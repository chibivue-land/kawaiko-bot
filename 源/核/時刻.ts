/**
 * 日本時間で暮らす bot のための時刻．
 *
 * Date ではなく Temporal を通す．以前は `now + 9 * 3_600_000` してから UTC の
 * フィールドを読み返す，という自前のタイムゾーン計算を持っていた．世界の大半では
 * 年に二度こっそり壊れる類のもので，ここでは単に読みにくいだけだった．
 *
 * ポリフィルの import はこのモジュール一箇所だけにして再輸出する．workerd も
 * Node も Temporal をまだ露出していないため (compatibility_date 2026-08-01 の
 * workerd で `Temporal is not defined` を実測)．ネイティブ実装が入ったら，
 * 直すのはこの import 一行だけで済む．
 *
 * 中身は temporal-polyfill-lite．要るのは ISO 暦と Asia/Tokyo だけで，暦を
 * 全部積んだものは要らない．workerd 上で日本時間・曜日・ISO の読み書きが
 * 正しいことは実測した．
 */
import { Temporal } from "temporal-polyfill-lite";
import { 数値, 文字列, 未定義 } from "../共通/型";
import type { 省略可 } from "../共通/型";
import { 試す } from "../共通/構文";
export { Temporal };

/** kawaiko は日本時間で生きている． */
export const 日本時間 = "Asia/Tokyo";

/** 今この瞬間．ユースケースが壁掛け時計を読んでよい唯一の入口． */
export function 現在時刻(): Temporal.Instant {
  return Temporal.Now.instant();
}

/**
 * 外部システムから来た ISO 時刻を読む．
 * Date.parse が黙って NaN を返していたところで Temporal は例外を投げるが，
 * ここの呼び出し側は例外より「不明」を受け取りたい．
 */
export function 時刻を読む(iso: 文字列): 省略可<Temporal.Instant> {
  return 試す({
    実行: () => Temporal.Instant.from(iso),
    しくじったら: (): 省略可<Temporal.Instant> => 未定義,
  });
}
/** ISO 時刻のエポックミリ秒．読めなければ undefined． */
export function エポックミリ秒(iso: 文字列): 省略可<数値> {
  return 時刻を読む(iso)?.epochMilliseconds;
}

/** ログや status に載せるためのミリ秒精度 ISO 文字列． */
export function ISO時刻(時刻: Temporal.Instant = 現在時刻()): 文字列 {
  return 時刻.toString({ smallestUnit: "millisecond" });
}
