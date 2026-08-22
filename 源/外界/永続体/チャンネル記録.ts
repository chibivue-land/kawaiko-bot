import { DurableObject } from "cloudflare:workers";
import { 現在時刻 } from "../../核/時刻";
import { 数値 } from "../../共通/型";
import type { 約束 } from "../../共通/型";

/**
 * チャンネル単位の会話の印．idFromName(Discord のチャンネル id) で 1 つ．
 *
 * kawaiko は短期の会話状態を保存していない．短期記憶はチャンネルのログそのもの．
 * だから「このチャンネルをリセットする」は，ある時点より前を無かったことにすると
 * 取り決めることに等しい．インスタンスがチャンネル id で分かれているので，
 * ここでのリセットは他のチャンネルからは完全に見えない．D1 にあるサーバー単位の
 * 長期記憶にも触れない．
 */
export class チャンネル記録帳 extends DurableObject {
  /** `時刻` (エポックミリ秒) より前を無視する． */
  リセットする(時刻: 数値 = 現在時刻().epochMilliseconds): 約束<数値> {
    return this.ctx.storage.put("resetAt", 時刻).んで(() => 時刻);
  }

  /** このチャンネルの履歴を無視する境界 (0 なら未リセット)． */
  リセット時刻(): 約束<数値> {
    return this.ctx.storage.get<数値>("resetAt").んで((時刻) => 時刻 ?? 0);
  }
}
