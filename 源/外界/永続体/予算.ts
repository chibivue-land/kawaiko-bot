import { DurableObject } from "cloudflare:workers";
import type { 仕事の種類 } from "../../振る舞い/接続口";
import { 月キー } from "../AI/料金";
import { ISO時刻 } from "../../核/時刻";
import type { 文字列, 数値, 真偽, 無, 約束, 一部, 記録, 省略可 } from "../../共通/型";

export interface 仕事の記録 {
  時刻: 文字列;
  成功か: 真偽;
  異常?: 省略可<文字列>;
  /** 生成を担ったモデル (分かるとき)． */
  モデル?: 省略可<文字列>;
}

/**
 * 月ごとの概算費用の見張り (idFromName("global") の単一インスタンス)．
 * MONTHLY_BUDGET_USD を超えたら生成を止める，コード側の緩い歯止め．あわせて
 * /status 用に，定期実行それぞれの最後の結果も持つ．
 */
export class 予算帳 extends DurableObject {
  async 仕事を記録する(
    種類: 仕事の種類,
    成功か: 真偽,
    異常?: 省略可<文字列>,
    モデル?: 省略可<文字列>,
  ): 約束<無> {
    await this.ctx.storage.put(`last:${種類}`, {
      時刻: ISO時刻(),
      成功か,
      異常,
      モデル,
    } satisfies 仕事の記録);
  }

  async 直近の結果(): 約束<一部<記録<仕事の種類, 仕事の記録>>> {
    return {
      独言: await this.ctx.storage.get<仕事の記録>("last:独言"),
      横槍: await this.ctx.storage.get<仕事の記録>("last:横槍"),
      学習: await this.ctx.storage.get<仕事の記録>("last:学習"),
    };
  }

  async 予算を確認する(上限ドル: 数値): 約束<{ 許すか: 真偽; 使用済みドル: 数値 }> {
    const 使用済みドル = (await this.ctx.storage.get<数値>(`spent:${月キー()}`)) ?? 0;
    return { 許すか: 使用済みドル < 上限ドル, 使用済みドル };
  }

  async 支出を記録する(費用ドル: 数値): 約束<無> {
    const 鍵 = `spent:${月キー()}`;
    await this.ctx.storage.put(鍵, ((await this.ctx.storage.get<数値>(鍵)) ?? 0) + 費用ドル);
  }
}
