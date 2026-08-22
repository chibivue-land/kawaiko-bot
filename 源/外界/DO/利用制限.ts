import { DurableObject } from "cloudflare:workers";
import type { 利用制限の判定 } from "../../振る舞い/接続口";
import { 現在時刻 } from "../../核/時刻";
import { 数学 } from "../../共通/型";
import type { 数値, 約束 } from "../../共通/型";

/**
 * 利用者ごとの制限。idFromName(Discord のユーザー id) で 1 人 1 インスタンス。
 * 固定窓 (時 / 日) の数え上げを SQLite 付きストレージに持つ。
 *
 * クラス名だけ英語なのは wrangler.jsonc の `class_name` がこれを指しているため
 * (identifier ではなく deployment の名前なので)。
 */
export class UserRateLimiter extends DurableObject {
  async 確認して数える(時あたり: 数値, 日あたり: 数値): 約束<利用制限の判定> {
    const 現在 = 現在時刻().epochMilliseconds;
    const 時の窓 = 数学.floor(現在 / 3_600_000);
    const 日の窓 = 数学.floor(現在 / 86_400_000);

    const 保存済み = await this.ctx.storage.get<{
      時の窓: 数値;
      時の回数: 数値;
      日の窓: 数値;
      日の回数: 数値;
    }>("counters");

    const 状態 = {
      時の窓,
      時の回数: 保存済み?.時の窓 === 時の窓 ? 保存済み.時の回数 : 0,
      日の窓,
      日の回数: 保存済み?.日の窓 === 日の窓 ? 保存済み.日の回数 : 0,
    };

    if (状態.日の回数 >= 日あたり) {
      return {
        許すか: false,
        再開まで分: 数学.ceil(((日の窓 + 1) * 86_400_000 - 現在) / 60_000),
      };
    }
    if (状態.時の回数 >= 時あたり) {
      return {
        許すか: false,
        再開まで分: 数学.ceil(((時の窓 + 1) * 3_600_000 - 現在) / 60_000),
      };
    }

    状態.時の回数++;
    状態.日の回数++;
    await this.ctx.storage.put("counters", 状態);
    return { 許すか: true };
  }
}
