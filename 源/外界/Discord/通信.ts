import type { チャット } from "../../振る舞い/接続口";
import type { 発言 } from "../../核/発言";
import type { 環境 } from "../環境";

import { 切り出す } from "../../共通/関数";
import { 注意 } from "../../共通/記録";
import { 真偽, 例外 } from "../../共通/型";
import type { 文字列, 真偽 as 真偽型, 約束, 配列, 省略可, 無 } from "../../共通/型";

/**
 * Discord の REST API を、チャットのポートへ合わせたもの。
 *
 * 内側へ渡るものはすべて 発言 に正規化してあるので、ユースケースが Discord の
 * JSON を読む場所は一つも無い。
 */
const 基点 = "https://discord.com/api/v10";

/** Discord の 1 通は 2000 文字まで。 */
export function 文字数を収める(本文: 文字列): 文字列 {
  const 上限 = 1990;

  return 本文.length > 上限 ? `${切り出す(本文, 0, 上限)}…` : 本文;
}

export function Discordのチャット(環境: 環境): チャット {
  return {
    async 投稿する(チャンネルid, 本文, 返信先の発言id): 約束<無> {
      await 呼ぶ(環境, `/channels/${チャンネルid}/messages`, {
        method: "POST",
        body: JSON.stringify({
          content: 文字数を収める(本文),
          ...(返信先の発言id
            ? {
                message_reference: { message_id: 返信先の発言id },
                // 返信はするが相手を鳴らさない。kawaiko はそういうところが冷たい。
                allowed_mentions: { replied_user: false },
              }
            : {}),
        }),
      });
    },

    async 直近の発言(チャンネルid, 上限 = 30): 約束<配列<発言>> {
      const 応答 = await 呼ぶ(環境, `/channels/${チャンネルid}/messages?limit=${上限}`, {
        method: "GET",
      });

      return ((await 応答.json()) as 生の発言[]).map(発言に直す);
    },

    async サーバーを引く(チャンネルid): 約束<省略可<文字列>> {
      try {
        const 応答 = await 呼ぶ(環境, `/channels/${チャンネルid}`, { method: "GET" });

        return ((await 応答.json()) as { guild_id?: 文字列 }).guild_id;
      } catch (躓き) {
        注意("Discord: チャンネルのサーバーを引けなかった:", String(躓き));

        return undefined;
      }
    },

    /**
     * 処理のあいだ「kawaiko が入力中…」を出し続ける。
     * 表示の失敗は握り潰す。返事のほうが大事なので。
     */
    async 入力中にする(チャンネルid, 処理) {
      const 打つ = () =>
        呼ぶ(環境, `/channels/${チャンネルid}/typing`, { method: "POST" }).catch(() => {});

      await 打つ();
      const 時計 = setInterval(打つ, 8_000);

      try {
        return await 処理();
      } finally {
        clearInterval(時計);
      }
    },
  };
}

async function 呼ぶ(環境: 環境, 経路: 文字列, 設定: RequestInit): 約束<Response> {
  const 応答 = await fetch(`${基点}${経路}`, {
    ...設定,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bot ${環境.DISCORD_BOT_TOKEN}`,
      ...設定.headers,
    },
  });

  if (!応答.ok) {
    throw new 例外(
      `Discord API ${設定.method ?? "GET"} ${経路} が失敗: ${応答.status} ${await 応答.text()}`,
    );
  }

  return 応答;
}

interface 生の発言者 {
  id: 文字列;
  bot?: 省略可<真偽型>;
  username?: 省略可<文字列>;
  global_name?: 省略可<文字列 | null>;
}

interface 生の発言 {
  id: 文字列;
  content: 文字列;
  timestamp: 文字列;
  author: 生の発言者;
  member?: 省略可<{ nick?: 省略可<文字列 | null> }>;
}

/** ニックネーム > 表示名 > ユーザー名。Discord が実際に見せている順。 */
export function 表示名(発言者: 生の発言者, ニックネーム?: 省略可<文字列 | null>): 文字列 {
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
  };
}
