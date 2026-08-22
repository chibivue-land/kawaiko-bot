import { 学習を一巡させる } from "./振る舞い/学習実行";
import { 記憶を操作する } from "./振る舞い/記憶操作";
import { 横槍を入れる } from "./振る舞い/横槍返信";
import { 独り言を投稿する } from "./振る舞い/独言投稿";
import type { 実行結果, 部品一式 } from "./振る舞い/接続口";
import { その時刻の担当, 日本時間の時 } from "./核/予定";
import { JSONで返す, 認可されているか, 記憶への問いを読み取る } from "./外界/経路";
import { 部品を組み立てる } from "./外界/組み立て";
import { 月の予算ドル, type 環境 } from "./外界/環境";

import { 応答, 数値, 真偽, 場所 as 場所型値 } from "./共通/型";
import { 切り出す, 始まるか, 空か, 長さ } from "./共通/関数";
import { 否定 } from "./共通/演算";
import { もし, 振り分ける } from "./共通/構文";
import type {
  文字列,
  場所 as 場所型,
  要求 as 要求型,
  真偽 as 真偽型,
  応答 as 応答型,
  約束,
  記録,
  省略可,
  不明,
  無,
} from "./共通/型";

export { 利用制限帳 } from "./外界/永続体/利用制限";
export { 予算帳 } from "./外界/永続体/予算";
export { チャンネル記録帳 } from "./外界/永続体/チャンネル記録";
export { Discord接続 } from "./外界/Discord/接続";

/**
 * Worker の入口 — HTTP の経路と，cron のディスパッチャ．
 *
 * kawaiko が何を言うかは，ここでは何も決めない．リクエストを，外界/組み立て.ts が
 * 作ったポートを添えたユースケース (振る舞い/) へ解決し，その答えを応答へ戻すだけ．
 */

/** ゲートウェイ接続の番犬としてだけ使う cron． */
const 番犬のcron = "*/5 * * * *";

type 仕事 = (部品: 部品一式, 設定?: { 強制するか?: 省略可<真偽型> }) => 約束<実行結果>;

const 仕事一覧: 記録<文字列, 仕事> = {
  独言: 独り言を投稿する,
  横槍: 横槍を入れる,
  学習: 学習を一巡させる,
};

/** URL の /trigger/<名前> と，内部の担当名の対応． */
const 引き金の名前: 記録<文字列, 文字列> = {
  mutter: "独言",
  reply: "横槍",
  learn: "学習",
};

export default {
  async fetch(要求, 環境, 文脈): 約束<応答型> {
    const 場所 = new 場所型値(要求.url);

    return 振り分ける<応答型>(
      [
        {
          // 生存確認．ついでにゲートウェイ接続を蹴る手段でもある．
          条件: () => 要求.method === "GET" && 場所.pathname === "/",
          ならば: () => {
            文脈.waitUntil(接続を確かめる(環境));

            return new 応答("kawaiko-bot は生きている", { status: 200 });
          },
        },
        {
          条件: () => 要求.method === "GET" && 場所.pathname === "/status",
          ならば: async () => {
            文脈.waitUntil(接続を確かめる(環境));

            return JSONで返す(await 状態(環境));
          },
        },
        {
          // 調査: ある問いかけに対して調査係が何を返すか見る．
          条件: () => 要求.method === "GET" && 場所.pathname === "/research",
          ならば: () => 調査を覗く(環境, 場所),
        },
        {
          // kawaiko が学んだことを読む / 取り消す．実在の人物についての観測が
          // 返るので認証付き．
          条件: () => 始まるか(場所.pathname, "/memory"),
          ならば: () => 記憶の口(環境, 要求, 場所),
        },
        {
          // 手動の引き金 (GitHub Actions の Mutter ワークフロー)．確率ゲートは
          // 飛ばすが，予算の見張りは効いたまま．
          条件: () => 要求.method === "POST" && 始まるか(場所.pathname, "/trigger/"),
          ならば: () => 引き金を引く(環境, 要求, 場所, 文脈),
        },
      ],
      { どれでもなければ: async () => new 応答("そんな経路は無い", { status: 404 }) },
    );
  },

  async scheduled(制御, 環境, 文脈): 約束<無> {
    // どの拍もゲートウェイ WebSocket の番犬を兼ねる．
    文脈.waitUntil(接続を確かめる(環境));

    もし(制御.cron !== 番犬のcron, {
      であれば: () => {
        // 毎時のディスパッチャ: 日本時間の時刻で振り分ける (核/予定.ts)．
        const 仕事 = 仕事一覧[その時刻の担当(日本時間の時())];

        もし(仕事 !== undefined, {
          であれば: () => 文脈.waitUntil(仕事!(部品を組み立てる(環境))),
          でなければ: () => undefined,
        });
      },
      でなければ: () => undefined,
    });
  },
} satisfies ExportedHandler<環境>;

async function 調査を覗く(環境: 環境, 場所: 場所型): 約束<応答型> {
  const 問いかけ = 場所.searchParams.get("q") ?? "";

  return もし(空か(問いかけ), {
    であれば: async () => new 応答("q が無い", { status: 400 }),
    でなければ: async () => {
      const 中身 = await 部品を組み立てる(環境).調査係.調べる(問いかけ);

      return new 応答(中身 || "(何も出なかった)", {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    },
  });
}

async function 記憶の口(環境: 環境, 要求: 要求型, 場所: 場所型): 約束<応答型> {
  const 問い = 記憶への問いを読み取る(要求.method, 場所);

  return 振り分ける<応答型>(
    [
      {
        条件: () => 否定(認可されているか(要求, 環境.TRIGGER_TOKEN)),
        ならば: async () => new 応答("権限が無い", { status: 401 }),
      },
      {
        条件: () => 問い === undefined,
        ならば: async () => JSONで返す({ 異常: "読み取れない要求" }, 400),
      },
    ],
    {
      どれでもなければ: async () => {
        const 結果 = await 記憶を操作する(部品を組み立てる(環境), 問い!);

        return JSONで返す(結果.本体, 結果.状態);
      },
    },
  );
}

async function 引き金を引く(
  環境: 環境,
  要求: 要求型,
  場所: 場所型,
  文脈: ExecutionContext,
): 約束<応答型> {
  const 担当 = 引き金の名前[切り出す(場所.pathname, 長さ("/trigger/"))];
  const 仕事 = 担当 ? 仕事一覧[担当] : undefined;

  return 振り分ける<応答型>(
    [
      {
        条件: () => 否定(認可されているか(要求, 環境.TRIGGER_TOKEN)),
        ならば: async () => new 応答("権限が無い", { status: 401 }),
      },
      {
        条件: () => 仕事 === undefined,
        ならば: async () => new 応答("知らない引き金", { status: 400 }),
      },
      {
        // 同期の形．調査用に結果をそのまま応答へ出す．
        条件: () => 場所.searchParams.get("wait") === "1",
        ならば: async () => {
          const 結果 = await 仕事!(部品を組み立てる(環境), { 強制するか: true });

          return JSONで返す(結果, 結果.成功か ? 200 : 500);
        },
      },
    ],
    {
      どれでもなければ: async () => {
        文脈.waitUntil(仕事!(部品を組み立てる(環境), { 強制するか: true }));

        return new 応答("動かした\n", { status: 202 });
      },
    },
  );
}

async function 状態(環境: 環境): 約束<不明> {
  const 接続 = 環境.Discord接続.get(環境.Discord接続.idFromName("global"));
  const 予算の記録 = 環境.予算帳.get(環境.予算帳.idFromName("global"));
  const 上限ドル = 月の予算ドル(環境);
  const { 使用済みドル } = await 予算の記録.予算を確認する(上限ドル);

  return {
    ...(await 接続.状態()),
    直近の結果: await 予算の記録.直近の結果(),
    // 今月の概算支出と，コード側の緩い上限．
    予算: { 使用済みドル: 数値(使用済みドル.toFixed(4)), 上限ドル },
    記憶: { 繋がっているか: 真偽(環境.記憶のD1) },
    // 有無だけ．値は絶対に出さない．
    秘密: {
      DISCORD_BOT_TOKEN: 真偽(環境.DISCORD_BOT_TOKEN),
      GEMINI_API_KEY: 真偽(環境.GEMINI_API_KEY),
      TRIGGER_TOKEN: 真偽(環境.TRIGGER_TOKEN),
    },
  };
}

async function 接続を確かめる(環境: 環境): 約束<無> {
  await 環境.Discord接続.get(環境.Discord接続.idFromName("global")).確かめる();
}
