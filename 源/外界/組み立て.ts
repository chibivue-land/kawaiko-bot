import type { チャンネル記録, 予算番, 利用制限, 部品一式 } from "../振る舞い/接続口";
import { 現在時刻 } from "../核/時刻";
import { Gemini提供者 } from "./AI/Gemini";
import { WorkersAI提供者 } from "./AI/WorkersAI";
import { モデル一覧を読む, 順に試す発話器 } from "./AI/選択";
import { D1の記憶庫, 記憶なし } from "./D1/記憶庫";
import { Discordのチャット } from "./Discord/通信";
import { RSSの見出し } from "./見出し";
import { webの調査係 } from "./調査";
import { 月の予算ドル, type 環境 } from "./環境";

import { 数値, 数学 } from "../共通/型";

/**
 * 組み立ての場所 — バインディングを入れて、ポートを出す。
 *
 * 両側を知っているのはここだけ。ここより内側はすべて 振る舞い/接続口.ts の interface
 * しか名指ししていない。だからテストは同じユースケースを、Cloudflare の
 * ランタイム抜きで偽物だけ差し替えて動かせる。
 */
export function 部品を組み立てる(環境: 環境): 部品一式 {
  const 予算の記録 = 環境.BUDGET_TRACKER.get(環境.BUDGET_TRACKER.idFromName("global"));

  const 予算番: 予算番 = {
    許すか: async () => {
      const { 許すか, 使用済みドル } = await 予算の記録.予算を確認する(月の予算ドル(環境));
      return { 許すか, 使用済みドル };
    },
    記録する: (費用ドル) => 予算の記録.支出を記録する(費用ドル),
    仕事を終える: (種類, 成功か, 異常, モデル) =>
      予算の記録.仕事を記録する(種類, 成功か, 異常, モデル),
  };

  const 利用制限: 利用制限 = {
    確認する: (利用者id) =>
      環境.USER_RATE_LIMITER.get(環境.USER_RATE_LIMITER.idFromName(利用者id)).確認して数える(
        数値(環境.RATE_LIMIT_PER_HOUR) || 5,
        数値(環境.RATE_LIMIT_PER_DAY) || 20,
      ),
  };

  const チャンネル記録: チャンネル記録 = {
    リセット時刻: (チャンネルid) =>
      環境.CHANNEL_MEMORY.get(環境.CHANNEL_MEMORY.idFromName(チャンネルid)).リセット時刻(),
    リセットする: async (チャンネルid, 時刻) => {
      await 環境.CHANNEL_MEMORY.get(環境.CHANNEL_MEMORY.idFromName(チャンネルid)).リセットする(
        時刻,
      );
    },
  };

  return {
    チャット: Discordのチャット(環境),

    発話器: 順に試す発話器(
      [WorkersAI提供者(環境.AI), Gemini提供者(環境.GEMINI_API_KEY)],
      モデル一覧を読む(環境.KAWAIKO_MODEL),
    ),

    記憶庫: 環境.DB ? D1の記憶庫(環境.DB) : 記憶なし,

    予算番,
    利用制限,
    チャンネル記録,

    調査係: webの調査係({ GitHubのトークン: 環境.GITHUB_API_TOKEN }),
    見出し取得: RSSの見出し,

    自分のid: 環境.DISCORD_APPLICATION_ID,
    住処のチャンネルid: 環境.KAWAIKO_CHANNEL_ID,

    独言の確率: 環境.POST_PROBABILITY,
    横槍の確率: 環境.REPLY_PROBABILITY,
    観測するか: 環境.OBSERVE_MESSAGES !== "false",

    現在時刻,
    乱数: 数学.random,
    新しい識別子: () => crypto.randomUUID(),
  };
}
