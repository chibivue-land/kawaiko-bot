import { 学習を一巡させる } from "./振る舞い/学習実行";
import { 記憶を操作する } from "./振る舞い/記憶操作";
import { 横槍を入れる } from "./振る舞い/横槍返信";
import { 独り言を投稿する } from "./振る舞い/独言投稿";
import type { 実行結果, 部品一式 } from "./振る舞い/接続口";
import { その時刻の担当, 日本時間の時 } from "./核/予定";
import { JSONで返す, 認可されているか, 記憶への問いを読み取る } from "./外界/経路";
import { 部品を組み立てる } from "./外界/組み立て";
import { 月の予算ドル, type 環境 } from "./外界/環境";

import { 数値, 応答, 真偽 } from "./共通/型";
import type {
  文字列,
  真偽 as 真偽型,
  応答 as 応答型,
  約束,
  記録,
  省略可,
  不明,
  無,
} from "./共通/型";

export { UserRateLimiter } from "./外界/DO/利用制限";
export { BudgetTracker } from "./外界/DO/予算";
export { ChannelMemory } from "./外界/DO/チャンネル記録";
export { DiscordGateway } from "./外界/Discord/接続";

/**
 * Worker の入口 — HTTP の経路と、cron のディスパッチャ。
 *
 * kawaiko が何を言うかは、ここでは何も決めない。リクエストを、外界/組み立て.ts が
 * 作ったポートを添えたユースケース (振る舞い/) へ解決し、その答えを応答へ戻すだけ。
 */

/** ゲートウェイ接続の番犬としてだけ使う cron。 */
const 番犬のcron = "*/5 * * * *";

type 仕事 = (部品: 部品一式, 設定?: { 強制するか?: 省略可<真偽型> }) => 約束<実行結果>;

const 仕事一覧: 記録<文字列, 仕事> = {
  独言: 独り言を投稿する,
  横槍: 横槍を入れる,
  学習: 学習を一巡させる,
};

/** URL の /trigger/<名前> と、内部の担当名の対応。 */
const 引き金の名前: 記録<文字列, 文字列> = {
  mutter: "独言",
  reply: "横槍",
  learn: "学習",
};

export default {
  async fetch(要求, 環境, 文脈): 約束<応答型> {
    const 場所 = new URL(要求.url);

    if (要求.method === "GET" && 場所.pathname === "/") {
      // 生存確認。ついでにゲートウェイ接続を蹴る手段でもある。
      文脈.waitUntil(接続を確かめる(環境));

      return new 応答("kawaiko-bot は生きている", { status: 200 });
    }

    if (要求.method === "GET" && 場所.pathname === "/status") {
      文脈.waitUntil(接続を確かめる(環境));

      return JSONで返す(await 状態(環境));
    }

    // 調査: ある問いかけに対して調査系が何を返すか見る。
    if (要求.method === "GET" && 場所.pathname === "/research") {
      const 問いかけ = 場所.searchParams.get("q") ?? "";
      if (!問いかけ) return new 応答("q が無い", { status: 400 });

      const 中身 = await 部品を組み立てる(環境).調査係.調べる(問いかけ);

      return new 応答(中身 || "(何も出なかった)", {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // kawaiko が学んだことを読む / 取り消す。実在の人物についての観測が返るので
    // 認証付き。
    if (場所.pathname.startsWith("/memory")) {
      if (!認可されているか(要求, 環境.TRIGGER_TOKEN)) {
        return new 応答("権限が無い", { status: 401 });
      }

      const 問い = 記憶への問いを読み取る(要求.method, 場所);
      if (!問い) return JSONで返す({ 異常: "読み取れない要求" }, 400);

      const 結果 = await 記憶を操作する(部品を組み立てる(環境), 問い);

      return JSONで返す(結果.本体, 結果.状態);
    }

    // 手動の引き金 (GitHub Actions の Mutter ワークフロー)。確率ゲートは飛ばすが、
    // 予算の見張りは効いたまま。
    if (要求.method === "POST" && 場所.pathname.startsWith("/trigger/")) {
      if (!認可されているか(要求, 環境.TRIGGER_TOKEN)) {
        return new 応答("権限が無い", { status: 401 });
      }

      const 担当 = 引き金の名前[場所.pathname.slice("/trigger/".length)];
      const 仕事 = 担当 ? 仕事一覧[担当] : undefined;
      if (!仕事) return new 応答("知らない引き金", { status: 400 });

      const 部品 = 部品を組み立てる(環境);

      if (場所.searchParams.get("wait") === "1") {
        // 同期の形。調査用に結果をそのまま応答へ出す。
        const 結果 = await 仕事(部品, { 強制するか: true });

        return JSONで返す(結果, 結果.成功か ? 200 : 500);
      }

      文脈.waitUntil(仕事(部品, { 強制するか: true }));

      return new 応答("動かした\n", { status: 202 });
    }

    return new 応答("そんな経路は無い", { status: 404 });
  },

  async scheduled(制御, 環境, 文脈): 約束<無> {
    // どの拍もゲートウェイ WebSocket の番犬を兼ねる。
    文脈.waitUntil(接続を確かめる(環境));
    if (制御.cron === 番犬のcron) return;

    // 毎時のディスパッチャ: 日本時間の時刻で振り分ける (核/予定.ts)。
    const 仕事 = 仕事一覧[その時刻の担当(日本時間の時())];
    if (仕事) 文脈.waitUntil(仕事(部品を組み立てる(環境)));
  },
} satisfies ExportedHandler<環境>;

async function 状態(環境: 環境): 約束<不明> {
  const 接続 = 環境.DISCORD_GATEWAY.get(環境.DISCORD_GATEWAY.idFromName("global"));
  const 予算の記録 = 環境.BUDGET_TRACKER.get(環境.BUDGET_TRACKER.idFromName("global"));
  const 上限ドル = 月の予算ドル(環境);
  const { 使用済みドル } = await 予算の記録.予算を確認する(上限ドル);

  return {
    ...(await 接続.状態()),
    直近の結果: await 予算の記録.直近の結果(),
    // 今月の概算支出と、コード側の緩い上限。
    予算: { 使用済みドル: 数値(使用済みドル.toFixed(4)), 上限ドル },
    記憶: { 繋がっているか: 真偽(環境.DB) },
    // 有無だけ。値は絶対に出さない。
    秘密: {
      DISCORD_BOT_TOKEN: 真偽(環境.DISCORD_BOT_TOKEN),
      GEMINI_API_KEY: 真偽(環境.GEMINI_API_KEY),
      TRIGGER_TOKEN: 真偽(環境.TRIGGER_TOKEN),
    },
  };
}

async function 接続を確かめる(環境: 環境): 約束<無> {
  await 環境.DISCORD_GATEWAY.get(環境.DISCORD_GATEWAY.idFromName("global")).確かめる();
}
