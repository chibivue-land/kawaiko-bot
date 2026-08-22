import { DurableObject } from "cloudflare:workers";

import { 失敗を要約する } from "../../振る舞い/接続口";
import { 名指しに返事する } from "../../振る舞い/返信";
import { メンションを取り除く, 名指しされたか } from "../../核/発言";
import { ISO時刻, エポックミリ秒, 現在時刻 } from "../../核/時刻";
import { 定型文を選ぶ, 異常の文 } from "../../核/定型文";
import { 部品を組み立てる } from "../組み立て";
import { 表示名 } from "./通信";
import type { 環境 } from "../環境";

import { 切り出す, 前後の空白を落とす, 写す } from "../../共通/関数";
import { 場合分け, 試みる } from "../../共通/構文";
import { 記す, 注意, 異常 } from "../../共通/記録";
import type { 文字列, 数値, 真偽, 無, 約束, 一部, 省略可, 不明 } from "../../共通/型";

/**
 * Durable Object に住む Discord Gateway クライアント。
 *
 * MESSAGE_CREATE (@kawaiko のメンションに要る) はゲートウェイの WebSocket でしか
 * 届かず、HTTP の interactions エンドポイントには来ない。この DO が外向きの
 * WebSocket を 1 本抱え、storage の alarm と 5 分ごとの cron が番犬として、
 * 立ち退きやデプロイの後に繋ぎ直す。
 *
 * ここは通信だけ。kawaiko が何を言うかは 振る舞い/返信.ts の担当で、この
 * ファイルの仕事はソケットのフレームを正規化した発言に変えて内側へ渡すこと。
 */
const ゲートウェイのURL = "https://gateway.discord.gg/?v=10&encoding=json";

// https://discord.com/developers/docs/events/gateway#gateway-opcodes
const 命令 = {
  配信: 0,

  心拍: 1,

  名乗り: 2,

  再接続: 7,

  無効な接続: 9,

  挨拶: 10,

  心拍の応答: 11,
} as const;

// GUILD_MESSAGES (1 << 9) | MESSAGE_CONTENT (1 << 15)。
// MESSAGE_CONTENT は特権。Developer Portal で有効化する (README 参照)。
const 意図 = (1 << 9) | (1 << 15);

/** 名乗り直しの最短間隔 (Discord は 1 日あたりの回数を絞っている)。 */
const 名乗りの間隔 = 30_000;

interface 届いた包み {
  op: 数値;

  t?: 省略可<文字列 | null>;

  s?: 省略可<数値 | null>;

  d?: 省略可<不明>;
}

export interface 接続の状態 {
  繋がっているか: 真偽;

  準備できた時刻?: 省略可<文字列>;

  bot利用者?: 省略可<{ id: 文字列; username: 文字列 }>;

  サーバー数?: 省略可<数値>;

  直前の切断?: 省略可<{ 符号: 数値; 理由: 文字列; 時刻: 文字列 }>;

  /** 直近の名指し処理の結末。調査用。 */
  直前の名指し?: 省略可<{
    時刻: 文字列;

    成功か: 真偽;

    異常?: 省略可<文字列>;

    モデル?: 省略可<文字列>;
  }>;
}

interface 発言が来た {
  id: 文字列;

  channel_id: 文字列;

  timestamp?: 省略可<文字列>;

  guild_id?: 省略可<文字列>;

  content?: 省略可<文字列>;
  author?: 省略可<{
    id: 文字列;

    bot?: 省略可<真偽>;

    username?: 省略可<文字列>;

    global_name?: 省略可<文字列 | null>;
  }>;
  member?: 省略可<{ nick?: 省略可<文字列 | null> }>;

  mentions?: 省略可<Array<{ id: 文字列 }>>;

  /** 返信のときに入る。kawaiko への返信に反応するのに使う。 */
  referenced_message?: 省略可<{ author?: 省略可<{ id: 文字列 }> } | null>;
}

export class DiscordGateway extends DurableObject<環境> {
  private ws: WebSocket | null = null;
  private 開いているか = false;
  private 連番: 数値 | null = null;
  private 心拍の時計: ReturnType<typeof setInterval> | null = null;
  private 応答待ちか = false;
  private 直前の名乗り = 0;

  /** 接続の診断。Worker の GET /status が出す。 */
  async 状態(): 約束<接続の状態> {
    const 保存済み = await this.ctx.storage.get<Omit<接続の状態, "繋がっているか">>("status");

    return { 繋がっているか: this.開いているか, ...保存済み };
  }

  private async 状態を記録する(差分: 一部<接続の状態>): 約束<無> {
    const 保存済み =
      (await this.ctx.storage.get<Omit<接続の状態, "繋がっているか">>("status")) ?? {};

    await this.ctx.storage.put("status", { ...保存済み, ...差分 });
  }

  /** 何度呼んでもよい。接続があることと、番犬の alarm が張ってあることを保証する。 */
  async 確かめる(): 約束<文字列> {
    await this.ctx.storage.setAlarm(現在時刻().epochMilliseconds + 60_000);
    if (this.開いているか) return "繋がっている";

    await this.繋ぐ();

    return "繋いでいる";
  }

  async alarm(): 約束<無> {
    await this.確かめる();
  }

  private async 繋ぐ(): 約束<無> {
    if (現在時刻().epochMilliseconds - this.直前の名乗り < 名乗りの間隔) return;
    this.直前の名乗り = 現在時刻().epochMilliseconds;
    this.畳む();

    // Workers から張るクライアント WebSocket は fetch + Upgrade (wss ではなく https)。
    const 応答 = await fetch(ゲートウェイのURL, { headers: { Upgrade: "websocket" } });
    const ws = 応答.webSocket;

    if (!ws) {
      異常(`接続: upgrade に失敗 (${応答.status})`);
      return;
    }

    ws.accept();
    this.ws = ws;
    this.開いているか = true;

    ws.addEventListener("message", (出来事) => {
      void this.包みを捌く(String(出来事.data));
    });

    ws.addEventListener("close", (出来事) => {
      注意(`接続: 閉じた (${出来事.code} ${出来事.reason})`);
      void this.状態を記録する({
        直前の切断: { 符号: 出来事.code, 理由: 出来事.reason, 時刻: ISO時刻() },
      });
      this.畳む();
    });

    ws.addEventListener("error", () => {
      異常("接続: ソケットの異常");
      this.畳む();
    });
  }

  private 畳む(): 無 {
    if (this.心拍の時計 !== null) {
      clearInterval(this.心拍の時計);
      this.心拍の時計 = null;
    }

    try {
      this.ws?.close(1000, "繋ぎ直す");
    } catch {
      // もう閉じている。
    }

    this.ws = null;
    this.開いているか = false;
    this.応答待ちか = false;
  }

  private 送る(包み: 届いた包み): 無 {
    this.ws?.send(JSON.stringify(包み));
  }

  private async 包みを捌く(生: 文字列): 約束<無> {
    const 包み = 試みる<省略可<届いた包み>>({
      実行: async () => JSON.parse(生) as 届いた包み,

      しくじったら: () => undefined,
    });
    const 中身 = await 包み;

    if (!中身) return;
    if (typeof 中身.s === "number") this.連番 = 中身.s;

    if (中身.op === 命令.挨拶) {
      const 間隔 = (中身.d as { heartbeat_interval: 数値 }).heartbeat_interval;
      this.心拍を始める(間隔);
      this.名乗る();
      return;
    }
    if (中身.op === 命令.心拍) {
      this.送る({ op: 命令.心拍, d: this.連番 });
      return;
    }
    if (中身.op === 命令.心拍の応答) {
      this.応答待ちか = false;
      return;
    }
    if (中身.op === 命令.再接続 || 中身.op === 命令.無効な接続) {
      // 単純にいく: 接続を捨てて、次の番犬で名乗り直す。
      this.畳む();
      return;
    }
    if (中身.op !== 命令.配信) return;

    await 場合分け(中身.t ?? "", {
      READY: async () => {
        const 準備 = 中身.d as {
          user?: 省略可<{ id: 文字列; username: 文字列 }>;

          guilds?: 省略可<不明[]>;
        };
        記す("接続: 準備できた");
        await this.状態を記録する({
          準備できた時刻: ISO時刻(),

          bot利用者: 準備.user ? { id: 準備.user.id, username: 準備.user.username } : undefined,

          サーバー数: 準備.guilds?.length,
        });
      },
      MESSAGE_CREATE: async () => {
        await this.発言が来たとき(中身.d as 発言が来た);
      },
      それ以外: async () => {},
    });
  }

  private 心拍を始める(間隔ミリ秒: 数値): 無 {
    if (this.心拍の時計 !== null) clearInterval(this.心拍の時計);
    this.応答待ちか = false;

    this.心拍の時計 = setInterval(() => {
      if (this.応答待ちか) {
        // 死んだ接続。前の拍から応答が返っていない。
        注意("接続: 心拍の応答が無いので繋ぎ直す");
        this.畳む();
        return;
      }
      this.応答待ちか = true;
      this.送る({ op: 命令.心拍, d: this.連番 });
    }, 間隔ミリ秒);
  }

  private 名乗る(): 無 {
    this.送る({
      op: 命令.名乗り,
      d: {
        token: this.env.DISCORD_BOT_TOKEN,

        intents: 意図,

        properties: { os: "cloudflare", browser: "kawaiko-bot", device: "kawaiko-bot" },
      },
    });
  }

  private async 発言が来たとき(発言: 発言が来た): 約束<無> {
    const 部品 = 部品を組み立てる(this.env);
    const 自分のid = 部品.自分のid;
    const 本文 = 発言.content ?? "";

    if (!発言.author) return;

    const サーバーid = 発言.guild_id;
    if (!サーバーid) return; // サーバー内の発言だけ (DM は受けない)。

    // 返事をするか決める前に観測する。kawaiko が学ぶのは自分宛ての発言だけでなく
    // サーバー全体。自分の発言も記録に入るが、他所の bot は雑音。
    const 発言者id = 発言.author.id;
    const 自分の発言か = 発言者id === 自分のid;

    if (発言.author.bot && !自分の発言か) return;

    if (部品.観測するか && 部品.記憶庫.使えるか && 前後の空白を落とす(本文)) {
      // Discord 自身の時刻を使い、読めなければ手元の時計。
      const 時刻 =
        (発言.timestamp ? エポックミリ秒(発言.timestamp) : undefined) ??
        現在時刻().epochMilliseconds;

      await 部品.記憶庫.観測する([
        {
          サーバーid,
          チャンネルid: 発言.channel_id,

          発言id: 発言.id,
          発言者id,

          発言者名: 表示名(発言.author, 発言.member?.nick),

          kawaikoの発言か: 自分の発言か,

          本文: 切り出す(前後の空白を落とす(本文), 0, 2000),
          時刻,
        },
      ]);
    }

    if (自分の発言か) return;

    // 明示的なメンションと、kawaiko 自身の発言への返信に反応する。
    const 自分への返信か = 発言.referenced_message?.author?.id === 自分のid;
    const 言及されたid一覧 = 発言.mentions ? 写す(発言.mentions, (言及) => 言及.id) : undefined;

    if (!自分への返信か && !名指しされたか(自分のid, 本文, 言及されたid一覧)) return;

    try {
      const 結末 = await 名指しに返事する(部品, {
        発言id: 発言.id,

        チャンネルid: 発言.channel_id,
        サーバーid,
        発言者id,

        相手の名前: 表示名(発言.author, 発言.member?.nick),

        本文: メンションを取り除く(自分のid, 本文),
      });

      await this.状態を記録する({
        直前の名指し: {
          時刻: ISO時刻(),

          成功か: true,

          モデル: 結末.種別 === "返事した" ? 結末.モデル : undefined,
        },
      });
    } catch (躓き) {
      異常("接続: 名指しへの返事に失敗:", 躓き);
      await this.状態を記録する({
        直前の名指し: { 時刻: ISO時刻(), 成功か: false, 異常: 失敗を要約する(躓き) },
      });

      try {
        await 部品.チャット.投稿する(発言.channel_id, 定型文を選ぶ(異常の文), 発言.id);
      } catch {
        // 静かに諦める。
      }
    }
  }
}
