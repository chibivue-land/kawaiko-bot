import { DurableObject } from "cloudflare:workers";

import { 月キー } from "../AI/料金";

import type { 仕事の種類, 提供者の休み } from "../../振る舞い/接続口";

import { 現在時刻 } from "../../核/時刻";
import { ISO時刻 } from "../../核/時刻";

import { 各要素に } from "../../共通/反復";
import { 数値, 文字列, 未定義, 真偽 } from "../../共通/型";
import type { 一部, 無, 省略可, 約束, 記録 } from "../../共通/型";
import { もし } from "../../共通/構文";
import { より大きい, より小さい, 足す } from "../../共通/演算";
import { 揃える } from "../../共通/約束";

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
  仕事を記録する(
    種類: 仕事の種類,
    成功か: 真偽,
    異常?: 省略可<文字列>,
    モデル?: 省略可<文字列>,
  ): 約束<無> {
    return this.ctx.storage.put(`last:${種類}`, {
      時刻: ISO時刻(),
      成功か,
      異常,
      モデル,
    } satisfies 仕事の記録);
  }

  直近の結果(): 約束<一部<記録<仕事の種類, 仕事の記録>>> {
    return 揃える([
      this.ctx.storage.get<仕事の記録>("last:独言"),
      this.ctx.storage.get<仕事の記録>("last:横槍"),
      this.ctx.storage.get<仕事の記録>("last:学習"),
    ]).んで(([独言, 横槍, 学習]) => ({ 独言, 横槍, 学習 }));
  }

  /** いま休んでいる提供者．期限切れのものは読み出しの時点で落とす． */
  休んでいる提供者(): 約束<記録<文字列, 提供者の休み>> {
    return this.ctx.storage
      .get<記録<文字列, 提供者の休み>>("休み")
      .んで((保存済み) => 期限内だけ残す(保存済み ?? {}));
  }

  提供者を休ませる(提供者名: 文字列, 休み: 提供者の休み): 約束<無> {
    return this.休んでいる提供者().んで((保存済み) =>
      this.ctx.storage.put("休み", { ...保存済み, [提供者名]: 休み }),
    );
  }

  予算を確認する(上限ドル: 数値): 約束<{ 許すか: 真偽; 使用済みドル: 数値 }> {
    return this.ctx.storage.get<数値>(`spent:${月キー()}`).んで((保存済み) => {
      const 使用済みドル = 保存済み ?? 0;

      return { 許すか: より小さい(使用済みドル, 上限ドル), 使用済みドル };
    });
  }

  支出を記録する(費用ドル: 数値): 約束<無> {
    const 鍵 = `spent:${月キー()}`;

    return this.ctx.storage
      .get<数値>(鍵)
      .んで((保存済み) => this.ctx.storage.put(鍵, 足す(保存済み ?? 0, 費用ドル)));
  }
}

/** 期限の切れた休みは，読み出しの時点で落とす． */
function 期限内だけ残す(保存済み: 記録<文字列, 提供者の休み>): 記録<文字列, 提供者の休み> {
  const 現在 = 現在時刻().epochMilliseconds;
  const 生きている: 記録<文字列, 提供者の休み> = {};

  各要素に(Object.entries(保存済み), ([名前, 休み]) => {
    もし(より大きい(休み.いつまで, 現在), {
      であれば: () => {
        生きている[名前] = 休み;
      },
      でなければ: () => 未定義,
    });
  });

  return 生きている;
}
