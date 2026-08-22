import { DurableObject } from "cloudflare:workers";

import { 失敗を要約する } from "../../振る舞い/接続口";
import { 名指しに返事する } from "../../振る舞い/返信";
import { メンションを取り除く, 名指しされたか } from "../../核/発言";
import { 添付の印 } from "../../核/添付";
import { ISO時刻, エポックミリ秒, 現在時刻 } from "../../核/時刻";
import { 定型文を選ぶ, 異常の文 } from "../../核/定型文";
import { 部品を組み立てる } from "../組み立て";
import { 添付に直す, 表示名 } from "./通信";
import type { 生の添付 } from "./通信";
import type { 環境 } from "../環境";

import type { 部品一式 } from "../../振る舞い/接続口";
import { 偽, 数値, 文字列, 未定義, 真, 真偽, 空 } from "../../共通/型";
import type { 一部, 不明, 無, 省略可, 約束, 読み取り専用配列 } from "../../共通/型";
import { 写す, 切り出す, 前後の空白を落とす, 空か, 絞る, 繋ぐ, 長さ } from "../../共通/関数";
import {
  ビット和,
  否定,
  左へずらす,
  等しい,
  等しくない,
  より小さい,
  引く,
  足す,
} from "../../共通/演算";
import { もし, 場合分け, 振り分ける, 試す, 試みる } from "../../共通/構文";
import { 注意, 異常, 記す } from "../../共通/記録";
import { 何もしない } from "../../共通/約束";

/**
 * Durable Object に住む Discord Gateway クライアント．
 *
 * MESSAGE_CREATE (@kawaiko のメンションに要る) はゲートウェイの WebSocket でしか
 * 届かず，HTTP の interactions エンドポイントには来ない．この DO が外向きの
 * WebSocket を 1 本抱え，storage の alarm と 5 分ごとの cron が番犬として，
 * 立ち退きやデプロイの後に繋ぎ直す．
 *
 * ここは通信だけ．kawaiko が何を言うかは 振る舞い/返信.ts の担当で，この
 * ファイルの仕事はソケットのフレームを正規化した発言に変えて内側へ渡すこと．
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

// GUILD_MESSAGES (1 << 9) | MESSAGE_CONTENT (1 << 15)．
// MESSAGE_CONTENT は特権．Developer Portal で有効化する (README 参照)．
const 意図 = ビット和(左へずらす(1, 9), 左へずらす(1, 15));

/** 名乗り直しの最短間隔 (Discord は 1 日あたりの回数を絞っている)． */
const 名乗りの間隔 = 30_000;

/** 番犬の alarm を張り直す間隔． */
const 番犬の間隔 = 60_000;

interface 届いた包み {
  op: 数値;

  t?: 省略可<文字列 | 空>;

  s?: 省略可<数値 | 空>;

  d?: 省略可<不明>;
}

export interface 接続の状態 {
  繋がっているか: 真偽;

  準備できた時刻?: 省略可<文字列>;

  bot利用者?: 省略可<{ id: 文字列; username: 文字列 }>;

  サーバー数?: 省略可<数値>;

  直前の切断?: 省略可<{ 符号: 数値; 理由: 文字列; 時刻: 文字列 }>;

  /** 直近の名指し処理の結末．調査用． */
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

    global_name?: 省略可<文字列 | 空>;
  }>;
  member?: 省略可<{ nick?: 省略可<文字列 | 空> }>;

  mentions?: 省略可<Array<{ id: 文字列 }>>;

  /** 返信のときに入る．kawaiko への返信に反応するのに使う． */
  referenced_message?: 省略可<{ author?: 省略可<{ id: 文字列 }> } | 空>;

  attachments?: 省略可<読み取り専用配列<生の添付>>;
}

export class Discord接続 extends DurableObject<環境> {
  private ws: WebSocket | 空 = 空;
  private 開いているか = 偽;
  private 連番: 数値 | 空 = 空;
  private 心拍の時計: ReturnType<typeof setInterval> | 空 = 空;
  private 応答待ちか = 偽;
  private 直前の名乗り = 0;

  /** 接続の診断．Worker の GET /status が出す． */
  状態(): 約束<接続の状態> {
    return this.保存済みの状態().んで((保存済み) => ({
      繋がっているか: this.開いているか,
      ...保存済み,
    }));
  }

  private 保存済みの状態(): 約束<省略可<Omit<接続の状態, "繋がっているか">>> {
    return this.ctx.storage.get<Omit<接続の状態, "繋がっているか">>("status");
  }

  private 状態を記録する(差分: 一部<接続の状態>): 約束<無> {
    return this.保存済みの状態().んで((保存済み) =>
      this.ctx.storage.put("status", { ...保存済み, ...差分 }),
    );
  }

  /** 何度呼んでもよい．接続があることと，番犬の alarm が張ってあることを保証する． */
  確かめる(): 約束<文字列> {
    return this.ctx.storage.setAlarm(足す(現在時刻().epochMilliseconds, 番犬の間隔)).んで(() =>
      もし<約束<文字列>>(this.開いているか, {
        であれば: () => Promise.resolve("繋がっている"),
        でなければ: () => this.繋ぐ().んで(() => "繋いでいる"),
      }),
    );
  }

  alarm(): 約束<無> {
    return this.確かめる().んで(() => 未定義);
  }

  private 繋ぐ(): 約束<無> {
    // 名乗り直しが早すぎるときは，何もせず次の番犬へ譲る．
    return もし<約束<無>>(
      より小さい(引く(現在時刻().epochMilliseconds, this.直前の名乗り), 名乗りの間隔),
      { であれば: 何もしない, でなければ: () => this.socketを張る() },
    );
  }

  private socketを張る(): 約束<無> {
    this.直前の名乗り = 現在時刻().epochMilliseconds;
    this.畳む();

    // Workers から張るクライアント WebSocket は fetch + Upgrade (wss ではなく https)．
    return fetch(ゲートウェイのURL, { headers: { Upgrade: "websocket" } }).んで((応答) => {
      const ws = 応答.webSocket;

      return もし(等しい(ws, 空), {
        であれば: () => 異常(`接続: upgrade に失敗 (${応答.status})`),
        でなければ: () => this.socketを受け取る(ws!),
      });
    });
  }

  private socketを受け取る(ws: WebSocket): 無 {
    ws.accept();
    this.ws = ws;
    this.開いているか = 真;

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
    もし(等しくない(this.心拍の時計, 空), {
      であれば: () => {
        clearInterval(this.心拍の時計!);
        this.心拍の時計 = 空;
      },
      でなければ: () => 未定義,
    });

    試す({
      実行: () => this.ws?.close(1000, "繋ぎ直す"),
      // もう閉じている．
      しくじったら: () => 未定義,
    });

    this.ws = 空;
    this.開いているか = 偽;
    this.応答待ちか = 偽;
  }

  private 送る(包み: 届いた包み): 無 {
    this.ws?.send(JSON.stringify(包み));
  }

  private 包みを捌く(生: 文字列): 約束<無> {
    const 中身 = 試す<省略可<届いた包み>>({
      実行: () => JSON.parse(生) as 届いた包み,
      しくじったら: () => 未定義,
    });

    return もし<約束<無>>(等しい(中身, 未定義), {
      であれば: 何もしない,
      でなければ: () => this.命令を捌く(中身!),
    });
  }

  private 命令を捌く(中身: 届いた包み): 約束<無> {
    もし(等しい(typeof 中身.s, "number"), {
      であれば: () => {
        this.連番 = 中身.s as 数値;
      },
      でなければ: () => 未定義,
    });

    return 場合分け<文字列, 約束<無>>(文字列(中身.op), {
      [文字列(命令.挨拶)]: () => {
        const 間隔 = (中身.d as { heartbeat_interval: 数値 }).heartbeat_interval;
        this.心拍を始める(間隔);
        this.名乗る();

        return 何もしない();
      },
      [文字列(命令.心拍)]: () => {
        this.送る({ op: 命令.心拍, d: this.連番 });

        return 何もしない();
      },
      [文字列(命令.心拍の応答)]: () => {
        this.応答待ちか = 偽;

        return 何もしない();
      },
      // 単純にいく: 接続を捨てて，次の番犬で名乗り直す．
      [文字列(命令.再接続)]: () => {
        this.畳む();

        return 何もしない();
      },
      [文字列(命令.無効な接続)]: () => {
        this.畳む();

        return 何もしない();
      },
      [文字列(命令.配信)]: () => this.配信を捌く(中身),
      それ以外: 何もしない,
    })!;
  }

  private 配信を捌く(中身: 届いた包み): 約束<無> {
    return 場合分け<文字列, 約束<無>>(中身.t ?? "", {
      READY: () => {
        const 準備 = 中身.d as {
          user?: 省略可<{ id: 文字列; username: 文字列 }>;
          guilds?: 省略可<不明[]>;
        };
        記す("接続: 準備できた");

        return this.状態を記録する({
          準備できた時刻: ISO時刻(),
          bot利用者: 準備.user ? { id: 準備.user.id, username: 準備.user.username } : 未定義,
          サーバー数: 準備.guilds ? 長さ(準備.guilds) : 未定義,
        });
      },
      MESSAGE_CREATE: () => this.発言が来たとき(中身.d as 発言が来た),
      それ以外: 何もしない,
    })!;
  }

  private 心拍を始める(間隔ミリ秒: 数値): 無 {
    もし(等しくない(this.心拍の時計, 空), {
      であれば: () => clearInterval(this.心拍の時計!),
      でなければ: () => 未定義,
    });

    this.応答待ちか = 偽;

    this.心拍の時計 = setInterval(() => {
      もし(this.応答待ちか, {
        // 死んだ接続．前の拍から応答が返っていない．
        であれば: () => {
          注意("接続: 心拍の応答が無いので繋ぎ直す");
          this.畳む();
        },
        でなければ: () => {
          this.応答待ちか = 真;
          this.送る({ op: 命令.心拍, d: this.連番 });
        },
      });
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

  private 発言が来たとき(発言: 発言が来た): 約束<無> {
    const 部品 = 部品を組み立てる(this.env);
    const 自分のid = 部品.自分のid;
    const サーバーid = 発言.guild_id;
    const 発言者 = 発言.author;
    const 自分の発言か = 等しい(発言者?.id, 自分のid);

    return 振り分ける<無>(
      [
        // サーバー内の発言だけ (DM は受けない)．他所の bot は雑音．
        { 条件: () => 等しい(発言者, 未定義), ならば: 何もしない },
        { 条件: () => 等しい(サーバーid, 未定義), ならば: 何もしない },
        { 条件: () => 発言者!.bot && 否定(自分の発言か), ならば: 何もしない },
      ],
      {
        // 返事をするか決める前に観測する．kawaiko が学ぶのは自分宛ての発言だけで
        // なくサーバー全体．自分の発言も記録に入る．
        どれでもなければ: () =>
          this.観測する(部品, 発言, サーバーid!, 自分の発言か).んで(() =>
            もし<約束<無>>(自分の発言か, {
              であれば: 何もしない,
              でなければ: () => this.名指しなら答える(部品, 発言, サーバーid!),
            }),
          ),
      },
    );
  }

  /** サーバーの発言を観測ログへ積む． */
  private 観測する(
    部品: 部品一式,
    発言: 発言が来た,
    サーバーid: 文字列,
    自分の発言か: 真偽,
  ): 約束<無> {
    const 添付一覧 = 添付に直す(発言.attachments);
    const 印 = 添付の印(添付一覧);
    // 本文が空でも「画像を貼った」ことは残す価値がある．
    const 本文 = 前後の空白を落とす(
      繋ぐ(
        絞る([前後の空白を落とす(発言.content ?? ""), 印], (かけら) => 否定(空か(かけら))),
        " ",
      ),
    );
    const 積むか = 部品.観測するか && 部品.記憶庫.使えるか && 否定(空か(本文));

    return もし<約束<無>>(積むか, {
      であれば: () => {
        // Discord 自身の時刻を使い，読めなければ手元の時計．
        const 時刻 =
          (発言.timestamp ? エポックミリ秒(発言.timestamp) : 未定義) ??
          現在時刻().epochMilliseconds;

        return 部品.記憶庫.観測する([
          {
            サーバーid,
            チャンネルid: 発言.channel_id,
            発言id: 発言.id,
            発言者id: 発言.author!.id,
            発言者名: 表示名(発言.author!, 発言.member?.nick),
            kawaikoの発言か: 自分の発言か,
            本文: 切り出す(本文, 0, 2000),
            時刻,
          },
        ]);
      },
      でなければ: 何もしない,
    });
  }

  /** 明示的なメンションと，kawaiko 自身の発言への返信にだけ反応する． */
  private 名指しなら答える(部品: 部品一式, 発言: 発言が来た, サーバーid: 文字列): 約束<無> {
    const 自分のid = 部品.自分のid;
    const 本文 = 発言.content ?? "";
    const 自分への返信か = 等しい(発言.referenced_message?.author?.id, 自分のid);
    const 言及されたid一覧 = 発言.mentions ? 写す(発言.mentions, (言及) => 言及.id) : 未定義;
    const 応じるか = 自分への返信か || 名指しされたか(自分のid, 本文, 言及されたid一覧);

    return もし<約束<無>>(応じるか, {
      であれば: () => this.返事を試みる(部品, 発言, サーバーid),
      でなければ: 何もしない,
    });
  }

  private 返事を試みる(部品: 部品一式, 発言: 発言が来た, サーバーid: 文字列): 約束<無> {
    const 自分のid = 部品.自分のid;
    const 本文 = 発言.content ?? "";

    return 試みる<無>({
      実行: () =>
        名指しに返事する(部品, {
          発言id: 発言.id,
          チャンネルid: 発言.channel_id,
          サーバーid,
          発言者id: 発言.author!.id,
          相手の名前: 表示名(発言.author!, 発言.member?.nick),
          本文: メンションを取り除く(自分のid, 本文),
          添付一覧: 添付に直す(発言.attachments),
        }).んで((結末) =>
          this.状態を記録する({
            直前の名指し: {
              時刻: ISO時刻(),
              成功か: 真,
              // 判別可能ユニオンの絞り込みは，プロパティ経由の型述語では効かない．
              // ここは素の === でないと 結末.モデル が見えない．
              モデル: 結末.種別 === "返事した" ? 結末.モデル : 未定義,
            },
          }),
        ),
      しくじったら: (躓き) => {
        異常("接続: 名指しへの返事に失敗:", 躓き);

        return this.状態を記録する({
          直前の名指し: { 時刻: ISO時刻(), 成功か: 偽, 異常: 失敗を要約する(躓き) },
        }).んで(() =>
          試みる<無>({
            実行: () => 部品.チャット.投稿する(発言.channel_id, 定型文を選ぶ(異常の文), 発言.id),
            // 静かに諦める．
            しくじったら: () => 未定義,
          }),
        );
      },
    });
  }
}
