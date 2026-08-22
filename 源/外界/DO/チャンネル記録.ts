import { DurableObject } from "cloudflare:workers";
import { 現在時刻 } from "../../核/時刻";
import type { 数値, 約束 } from "../../共通/型";

/**
 * チャンネル単位の会話の印。idFromName(Discord のチャンネル id) で 1 つ。
 *
 * kawaiko は短期の会話状態を保存していない。短期記憶はチャンネルのログそのもの。
 * だから「このチャンネルをリセットする」は、ある時点より前を無かったことにすると
 * 取り決めることに等しい。インスタンスがチャンネル id で分かれているので、
 * ここでのリセットは他のチャンネルからは完全に見えない。D1 にあるサーバー単位の
 * 長期記憶にも触れない。
 */
export class ChannelMemory extends DurableObject {
  /** `時刻` (エポックミリ秒) より前を無視する。 */
  async リセットする(時刻: 数値 = 現在時刻().epochMilliseconds): 約束<数値> {
    await this.ctx.storage.put("resetAt", 時刻);
    return 時刻;
  }

  /** このチャンネルの履歴を無視する境界 (0 なら未リセット)。 */
  async リセット時刻(): 約束<数値> {
    return (await this.ctx.storage.get<数値>("resetAt")) ?? 0;
  }
}
