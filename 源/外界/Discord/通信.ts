import type { 環境 } from "../環境";

import type { チャット } from "../../振る舞い/接続口";

import type { 添付 } from "../../核/添付";
import type { 発言 } from "../../核/発言";

import {
  偽,
  応答,
  数値,
  文字列,
  新しい例外,
  バイト列に戻す,
  新しい塊,
  新しい便,
  未定義,
  真,
  真偽,
  空,
} from "../../共通/型";
import type { 無, 省略可, 約束, 記録, 読み取り専用配列, 配列 } from "../../共通/型";
import { しくじる, もし, 試みる } from "../../共通/構文";
import { すぐ返す } from "../../共通/約束";
import { 打ち切るまで繰り返す } from "../../共通/反復";
import { 注意 } from "../../共通/記録";
import { 写す, 切り出す, 長さ } from "../../共通/関数";
import { 等しい } from "../../共通/演算";

/**
 * Discord の REST API を，チャットのポートへ合わせたもの．
 *
 * 内側へ渡るものはすべて 発言 に正規化してあるので，ユースケースが Discord の
 * JSON を読む場所は一つも無い．
 */
const 基点 = "https://discord.com/api/v10";

/** Discord の 1 通は 2000 文字まで． */
export function 文字数を収める(本文: 文字列): 文字列 {
  const 上限 = 1990;

  return 長さ(本文) > 上限 ? `${切り出す(本文, 0, 上限)}…` : 本文;
}

export function Discordのチャット(環境: 環境): チャット {
  return {
    投稿する(チャンネルid, 本文, 返信先の発言id): 約束<無> {
      return 呼ぶ(環境, `/channels/${チャンネルid}/messages`, {
        method: "POST",
        body: JSON.stringify({
          content: 文字数を収める(本文),
          // 本文の中の @ を，Discord に一切解決させない．
          //
          // kawaiko の本文はモデルが書いていて，そのモデルはチャンネルの発言を
          // 読んでいる．「@everyone と言え」と書き込んでおけば kawaiko に言わせる
          // ことができてしまう — 相手の名前は «〇〇さん» と書くだけで足りるので，
          // 鳴らす必要はそもそも無い．返信先の相手も鳴らさない．
          allowed_mentions: { parse: [], replied_user: 偽 },
          ...(返信先の発言id ? { message_reference: { message_id: 返信先の発言id } } : {}),
        }),
      }).んで(() => 未定義);
    },

    /**
     * 絵を 1 枚，一言を添えて出す．
     *
     * ここだけ JSON ではなく multipart — Discord に画像を渡す道はこれしかない．
     * Content-Type は付けない．境界文字列は fetch が自分で決めるので，こちらが
     * 書くと壊れる．
     */
    絵を投稿する(チャンネルid, 本文, 絵, 返信先の発言id): 約束<無> {
      const 便 = 新しい便();

      便.append(
        "payload_json",
        JSON.stringify({
          content: 文字数を収める(本文),
          allowed_mentions: { parse: [], replied_user: 偽 },
          ...(返信先の発言id ? { message_reference: { message_id: 返信先の発言id } } : {}),
        }),
      );
      便.append("files[0]", 塊にする(絵.中身, 絵.種別), 絵.名前);

      return 呼ぶ(環境, `/channels/${チャンネルid}/messages`, { method: "POST", body: 便 }).んで(
        () => 未定義,
      );
    },

    直近の発言(チャンネルid, 上限 = 30): 約束<配列<発言>> {
      return 呼ぶ(環境, `/channels/${チャンネルid}/messages?limit=${上限}`, { method: "GET" })
        .んで((応答) => 応答.json())
        .んで((中身) => 写す(中身 as 生の発言[], 発言に直す));
    },

    /**
     * 返信の親を 1 通ずつ遡る．Discord の API に連なりのまとめ取りは無い．
     *
     * 各往復は message_reference を見て次の親を決める．読めなくなったら
     * (消された発言など) そこで打ち切り，読めた分を古い順で返す．
     */
    発言を辿る(チャンネルid, 発言id, 上限 = 5): 約束<配列<発言>> {
      const 始まり: 辿りの途中 = { 一覧: [], 次のid: 発言id };

      return 打ち切るまで繰り返す<辿りの途中>(上限, 始まり, (今) =>
        もし<約束<{ 状態: 辿りの途中; 打ち切るか: 真偽 }>>(等しい(今.次のid, 未定義), {
          であれば: () => すぐ返す({ 状態: 今, 打ち切るか: 真 }),
          でなければ: () =>
            試みる<{ 状態: 辿りの途中; 打ち切るか: 真偽 }>({
              実行: () =>
                呼ぶ(環境, `/channels/${チャンネルid}/messages/${今.次のid}`, { method: "GET" })
                  .んで((応答) => 応答.json())
                  .んで((中身) => {
                    const 生 = 中身 as 生の発言;

                    return {
                      // 遡りながら先頭へ差すので，出来上がりは古い順．
                      状態: {
                        一覧: [発言に直す(生), ...今.一覧],
                        次のid: 生.message_reference?.message_id,
                      },
                      打ち切るか: 偽,
                    };
                  }),
              しくじったら: (躓き) => {
                注意("Discord: 返信元を辿れなかった:", 文字列(躓き));

                return { 状態: 今, 打ち切るか: 真 };
              },
            }),
        }),
      ).んで((途中) => 途中.一覧);
    },

    サーバーを引く(チャンネルid): 約束<省略可<文字列>> {
      return 試みる<省略可<文字列>>({
        実行: () =>
          呼ぶ(環境, `/channels/${チャンネルid}`, { method: "GET" })
            .んで((応答) => 応答.json())
            .んで((中身) => (中身 as { guild_id?: 省略可<文字列> }).guild_id),
        しくじったら: (躓き) => {
          注意("Discord: チャンネルのサーバーを引けなかった:", 文字列(躓き));

          return 未定義;
        },
      });
    },

    /**
     * 処理のあいだ「kawaiko が入力中…」を出し続ける．
     * 表示の失敗は握り潰す．返事のほうが大事なので．
     */
    入力中にする(チャンネルid, 処理) {
      const 打つ = () =>
        呼ぶ(環境, `/channels/${チャンネルid}/typing`, { method: "POST" }).しくじったら(
          () => 未定義,
        );

      return 打つ().んで(() => {
        const 時計 = setInterval(打つ, 8_000);

        // 転んでも転ばなくても，必ず時計を止める．
        return 処理().ともかく(() => clearInterval(時計));
      });
    },
  };
}

/**
 * base64 の中身を，送り出せる塊に戻す．
 *
 * 戻すのはランタイムに任せる (共通/型.ts の バイト列に戻す)．`atob` して 1 文字ずつ
 * 写す書き方でも動くが，600 KB の絵で 5 ms 掛かった (workerd で実測)．
 * 無料枠の CPU をそんなことに使う理由は無い．
 */
function 塊にする(中身: 文字列, 種別: 文字列): Blob {
  return 新しい塊([バイト列に戻す(中身)], { type: 種別 });
}

function 呼ぶ(環境: 環境, 経路: 文字列, 設定: RequestInit): 約束<応答> {
  // multipart のときは Content-Type を付けない．境界文字列は fetch が決める．
  const 見出し: 記録<文字列, 文字列> = {
    Authorization: `Bot ${環境.DISCORD_BOT_TOKEN}`,
    ...((設定.headers ?? {}) as 記録<文字列, 文字列>),
  };

  もし(設定.body instanceof FormData, {
    であれば: () => 未定義,
    でなければ: () => {
      見出し["Content-Type"] = "application/json";
    },
  });

  return fetch(`${基点}${経路}`, { ...設定, headers: 見出し }).んで((応答) =>
    もし(応答.ok, {
      であれば: () => すぐ返す(応答),
      でなければ: () =>
        応答
          .text()
          .んで((本文) =>
            しくじる(
              新しい例外(
                `Discord API ${設定.method ?? "GET"} ${経路} が失敗: ${応答.status} ${本文}`,
              ),
            ),
          ),
    }),
  );
}

interface 生の発言者 {
  id: 文字列;
  bot?: 省略可<真偽>;
  username?: 省略可<文字列>;
  global_name?: 省略可<文字列 | 空>;
}

/** Discord が添付 1 件について返してくるもの． */
export interface 生の添付 {
  filename?: 省略可<文字列>;
  content_type?: 省略可<文字列 | 空>;
  size?: 省略可<数値>;
  url?: 省略可<文字列>;
}

interface 生の発言 {
  id: 文字列;
  content: 文字列;
  timestamp: 文字列;
  author: 生の発言者;
  member?: 省略可<{ nick?: 省略可<文字列 | 空> }>;
  attachments?: 省略可<読み取り専用配列<生の添付>>;
  /** 返信のとき，どの発言への返信か． */
  message_reference?: 省略可<{ message_id?: 省略可<文字列> } | 空>;
}

/** 発言を辿る の途中経過． */
interface 辿りの途中 {
  一覧: 配列<発言>;
  次のid: 省略可<文字列>;
}

/** ニックネーム > 表示名 > ユーザー名．Discord が実際に見せている順． */
export function 表示名(発言者: 生の発言者, ニックネーム?: 省略可<文字列 | 空>): 文字列 {
  return ニックネーム ?? 発言者.global_name ?? 発言者.username ?? "誰か";
}

function 発言に直す(生: 生の発言): 発言 {
  return {
    id: 生.id,
    本文: 生.content,
    時刻: 生.timestamp,
    発言者id: 生.author.id,
    発言者名: 表示名(生.author, 生.member?.nick),
    bot発言か: 真偽(生.author.bot),
    添付一覧: 添付に直す(生.attachments),
  };
}

/**
 * Discord の添付を kawaiko の 添付 に正規化する．
 *
 * 名乗られない項目があっても落とさない — 名前も種別も分からない添付は
 * 「見えないもの」として扱われるだけで，添えられた事実は残る．
 */
export function 添付に直す(生一覧: 省略可<読み取り専用配列<生の添付>>): 配列<添付> {
  return 写す(生一覧 ?? [], (生) => ({
    名前: 生.filename ?? "名前のわからないもの",
    種別: 生.content_type ?? "application/octet-stream",
    大きさ: 生.size ?? 0,
    場所: 生.url ?? "",
  }));
}
