import type { チャット } from "../../振る舞い/接続口";
import type { 発言 } from "../../核/発言";
import type { 添付 } from "../../核/添付";
import type { 環境 } from "../環境";
import { 偽, 応答, 数値, 文字列, 新しい例外, 未定義, 真偽, 空 } from "../../共通/型";
import type { 無, 省略可, 約束, 読み取り専用配列, 配列 } from "../../共通/型";
import { 写す, 切り出す, 長さ } from "../../共通/関数";
import { しくじる, もし, 試みる } from "../../共通/構文";
import { 注意 } from "../../共通/記録";
import { すぐ返す } from "../../共通/約束";

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
          ...(返信先の発言id
            ? {
                message_reference: { message_id: 返信先の発言id },
                // 返信はするが相手を鳴らさない．kawaiko はそういうところが冷たい．
                allowed_mentions: { replied_user: 偽 },
              }
            : {}),
        }),
      }).んで(() => 未定義);
    },

    直近の発言(チャンネルid, 上限 = 30): 約束<配列<発言>> {
      return 呼ぶ(環境, `/channels/${チャンネルid}/messages?limit=${上限}`, { method: "GET" })
        .んで((応答) => 応答.json())
        .んで((中身) => 写す(中身 as 生の発言[], 発言に直す));
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

function 呼ぶ(環境: 環境, 経路: 文字列, 設定: RequestInit): 約束<応答> {
  return fetch(`${基点}${経路}`, {
    ...設定,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bot ${環境.DISCORD_BOT_TOKEN}`,
      ...設定.headers,
    },
  }).んで((応答) =>
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
