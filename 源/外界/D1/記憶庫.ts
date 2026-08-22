import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";

import { 失敗を要約する, type 記憶庫 } from "../../振る舞い/接続口";
import {
  取り込み方を決める,
  事実本文を整える,
  指示文に載せる事実の数,
  type 取り込み結果,
  type 学習の回,
  type 学習した事実,
  type 事実,
  type 観測,
  type 観測の入力,
} from "../../核/記憶";
import { 現在時刻 } from "../../核/時刻";
import {
  記憶の出来事,
  観測表,
  生きている事実 as 生きている事実ビュー,
  生きている学習の回,
} from "./定義";

import { 写す, 空か, 絞る, 長さ } from "../../共通/関数";
import { 注意 } from "../../共通/記録";
import type { 文字列, 数値, 真偽, 無, 約束, 配列, 読み取り専用配列, 省略可 } from "../../共通/型";
import { もし, 試みる } from "../../共通/構文";

/**
 * Drizzle 経由で D1 に載る記憶庫．
 *
 * どのメソッドも意図して失敗に強くしてある．覚えることはあくまで寄り道で，
 * データベースが咳き込んだくらいで kawaiko が返事をやめてはいけない．呼び出し側
 * には例外ではなく空の結果と，ログの注意が返る．
 */
export function D1の記憶庫(db: D1Database): 記憶庫 {
  return new D1記憶庫(drizzle(db));
}

class D1記憶庫 implements 記憶庫 {
  readonly 使えるか = true;

  constructor(private readonly db: DrizzleD1Database) {}

  async 観測する(行: 読み取り専用配列<観測の入力>): 約束<無> {
    return もし(空か(行), {
      であれば: async () => {},
      でなければ: () => this.観測を書く(行),
    });
  }

  private async 観測を書く(行: 読み取り専用配列<観測の入力>): 約束<無> {
    return 試みる({
      実行: async () => {
        // 発言 id が重なったら無視する．窓が重なって再読み込みされても無害で，
        // あとから編集された本文ではなく最初に見たものが残る．
        await this.db
          .insert(観測表)
          .values(
            写す(行, (観測) => ({
              サーバーid: 観測.サーバーid,
              チャンネルid: 観測.チャンネルid,
              発言id: 観測.発言id,
              発言者id: 観測.発言者id,
              発言者名: 観測.発言者名,
              kawaikoの発言か: 観測.kawaikoの発言か ? 1 : 0,
              本文: 観測.本文,
              時刻: 観測.時刻,
            })),
          )
          .onConflictDoNothing();
      },
      しくじったら: (躓き) => {
        注意("記憶: 観測を書けなかった:", 失敗を要約する(躓き));
      },
    });
  }

  async 生きている事実(
    サーバーid: 文字列,
    設定?: { 主語id?: 省略可<文字列>; 上限?: 省略可<数値> },
  ): 約束<配列<事実>> {
    return 試みる({
      実行: async () => {
        const 行 = await this.db
          .select()
          .from(生きている事実ビュー)
          .where(eq(生きている事実ビュー.サーバーid, サーバーid))
          // いま返事をしている相手のことを先頭へ．いちばん効く可能性が高い．
          .orderBy(
            desc(
              sql`${生きている事実ビュー.主語id} IS NOT NULL AND ${生きている事実ビュー.主語id} = ${設定?.主語id ?? ""}`,
            ),
            desc(生きている事実ビュー.連番),
          )
          .limit(設定?.上限 ?? 指示文に載せる事実の数);

        return 写す(行, (一行): 事実 => ({
          連番: 一行.連番,
          主語の種別: 一行.主語の種別 ?? "server",
          主語id: 一行.主語id,
          主語名: 一行.主語名,
          本文: 一行.本文 ?? "",
          時刻: 一行.時刻,
        }));
      },
      しくじったら: (躓き) => {
        注意("記憶: 生きている事実を読めなかった:", 失敗を要約する(躓き));

        return [];
      },
    });
  }

  async 観測したサーバー(上限 = 20): 約束<配列<文字列>> {
    return 試みる({
      実行: async () => {
        const 行 = await this.db
          .select({ サーバーid: 観測表.サーバーid, 最新: sql<数値>`MAX(${観測表.連番})` })
          .from(観測表)
          .groupBy(観測表.サーバーid)
          .orderBy(desc(sql`最新`))
          .limit(上限);

        return 写す(行, (一行) => 一行.サーバーid);
      },
      しくじったら: (躓き) => {
        注意("記憶: サーバー一覧を読めなかった:", 失敗を要約する(躓き));

        return [];
      },
    });
  }

  async 学習の読み取り位置(サーバーid: 文字列): 約束<数値> {
    return 試みる({
      実行: async () => {
        const [行] = await this.db
          .select({ 位置: sql<数値 | null>`MAX(${記憶の出来事.読んだ位置})` })
          .from(記憶の出来事)
          .where(and(eq(記憶の出来事.サーバーid, サーバーid), 生きている学習の回));

        return 行?.位置 ?? 0;
      },
      しくじったら: (躓き) => {
        注意("記憶: 読み取り位置を読めなかった:", 失敗を要約する(躓き));

        return 0;
      },
    });
  }

  async 未学習の観測(サーバーid: 文字列, これ以降: 数値, 上限 = 60): 約束<配列<観測>> {
    return 試みる({
      実行: async () => {
        const 行 = await this.db
          .select()
          .from(観測表)
          .where(and(eq(観測表.サーバーid, サーバーid), gt(観測表.連番, これ以降)))
          .orderBy(asc(観測表.連番))
          .limit(上限);

        return 写す(行, (一行): 観測 => ({
          連番: 一行.連番,
          チャンネルid: 一行.チャンネルid,
          発言者id: 一行.発言者id,
          発言者名: 一行.発言者名,
          kawaikoの発言か: 一行.kawaikoの発言か === 1,
          本文: 一行.本文,
          時刻: 一行.時刻,
        }));
      },
      しくじったら: (躓き) => {
        注意("記憶: 観測を読めなかった:", 失敗を要約する(躓き));

        return [];
      },
    });
  }

  async 学習を追記する(引数: {
    サーバーid: 文字列;
    識別子: 文字列;
    事実一覧: 読み取り専用配列<学習した事実>;
    読んだ位置: 数値;
    モデル?: 省略可<文字列>;
  }): 約束<取り込み結果> {
    // 指示文に載せる一部ではなく，信じていること全部と突き合わせる．
    const 既知 = await this.生きている事実(引数.サーバーid, { 上限: 500 });
    const 現在 = 現在時刻().epochMilliseconds;

    const 判定済み = 写す(引数.事実一覧, (事実) => ({
      事実,
      取り込み方: 取り込み方を決める(事実, 既知),
    }));

    const 結果: 取り込み結果 = {
      学習: 長さ(絞る(判定済み, (件) => 件.取り込み方.種別 === "学習")),
      更新: 長さ(絞る(判定済み, (件) => 件.取り込み方.種別 === "改訂")),
      却下: 長さ(絞る(判定済み, (件) => 件.取り込み方.種別 === "却下")),
    };

    const 学ぶ行 = 写す(
      絞る(判定済み, (件) => 件.取り込み方.種別 !== "却下"),
      ({ 事実, 取り込み方 }): typeof 記憶の出来事.$inferInsert => ({
        サーバーid: 引数.サーバーid,
        時刻: 現在,
        識別子: 引数.識別子,
        種別: "learn",
        主語の種別: 事実.主語の種別,
        主語id: 事実.主語id ?? null,
        主語名: 事実.主語名 ?? null,
        本文: 事実本文を整える(事実.本文),
        置き換える連番: 取り込み方.種別 === "改訂" ? 取り込み方.置き換える連番 : null,
        出典チャンネルid: 事実.出典チャンネルid ?? null,
        出典発言id: 事実.出典発言id ?? null,
        モデル: 引数.モデル ?? null,
      }),
    );

    // 何も学ばなくても回は必ず閉じる．閉じないと読み取り位置が進まず，同じ発言を
    // 永遠に読み直すことになる．
    const 回を閉じる行: typeof 記憶の出来事.$inferInsert = {
      サーバーid: 引数.サーバーid,
      時刻: 現在,
      識別子: 引数.識別子,
      種別: "learn_run",
      読んだ位置: 引数.読んだ位置,
      モデル: 引数.モデル ?? null,
    };

    return 試みる<取り込み結果>({
      実行: async () => {
        await this.db.insert(記憶の出来事).values([...学ぶ行, 回を閉じる行]);

        return 結果;
      },
      しくじったら: (躓き) => {
        注意("記憶: 学習を追記できなかった:", 失敗を要約する(躓き));

        return { 学習: 0, 更新: 0, 却下: 0 };
      },
    });
  }

  async 学習の履歴(サーバーid: 文字列, 上限 = 20): 約束<配列<学習の回>> {
    return 試みる({
      実行: async () => {
        const 行 = await this.db.run(sql`
          SELECT e.batch                                              AS batch,
                 MAX(e.at)                                            AS at,
                 SUM(CASE WHEN e.kind = 'learn' THEN 1 ELSE 0 END)    AS facts,
                 MAX(e.observed_through)                              AS observed_through,
                 SUM(CASE WHEN l.seq IS NOT NULL THEN 1 ELSE 0 END)   AS live
            FROM memory_events e
            LEFT JOIN memory_live l ON l.seq = e.seq
           WHERE e.guild_id = ${サーバーid} AND e.kind IN ('learn', 'learn_run')
           GROUP BY e.batch
           ORDER BY at DESC
           LIMIT ${上限}`);

        return 写す(行.results as unknown as 生の回[], (一行): 学習の回 => ({
          識別子: 一行.batch,
          時刻: 一行.at,
          事実の数: 一行.facts,
          読んだ位置: 一行.observed_through,
          生きている数: 一行.live,
        }));
      },
      しくじったら: (躓き) => {
        注意("記憶: 学習の履歴をまとめられなかった:", 失敗を要約する(躓き));

        return [];
      },
    });
  }

  /** 学習 1 回を取り消す．行は残り，数えられなくなるだけ． */
  async 学習の回を取り消す(サーバーid: 文字列, 識別子: 文字列, 理由?: 省略可<文字列>): 約束<真偽> {
    return this.取り消しを追記する({
      サーバーid,
      識別子: `retract:${識別子}`,
      種別: "retract_batch",
      対象の回: 識別子,
      理由: 理由 ?? null,
    });
  }

  /** このサーバーの知識を，その位置の状態へ戻す． */
  async 時点まで巻き戻す(サーバーid: 文字列, 連番: 数値, 理由?: 省略可<文字列>): 約束<真偽> {
    return this.取り消しを追記する({
      サーバーid,
      識別子: `rollback:${連番}`,
      種別: "rollback",
      対象の連番: 連番,
      理由: 理由 ?? null,
    });
  }

  private async 取り消しを追記する(行: Omit<typeof 記憶の出来事.$inferInsert, "時刻">): 約束<真偽> {
    return 試みる({
      実行: async () => {
        await this.db.insert(記憶の出来事).values({ ...行, 時刻: 現在時刻().epochMilliseconds });

        return true;
      },
      しくじったら: (躓き) => {
        注意(`記憶: ${行.種別} を追記できなかった:`, 失敗を要約する(躓き));

        return false;
      },
    });
  }
}

interface 生の回 {
  batch: 文字列;
  at: 数値;
  facts: 数値;
  observed_through: 数値 | null;
  live: 数値;
}

/**
 * 記憶庫が繋がっていないときの身代わり．すべて何もしない．おかげでユースケースは
 * `if (環境.記憶のD1)` を書かずに済み，用意する前でも Worker はそのまま動く．
 */
export const 記憶なし: 記憶庫 = {
  使えるか: false,
  async 観測する() {},
  async 生きている事実() {
    return [];
  },
  async 観測したサーバー() {
    return [];
  },
  async 学習の読み取り位置() {
    return 0;
  },
  async 未学習の観測() {
    return [];
  },
  async 学習を追記する() {
    return { 学習: 0, 更新: 0, 却下: 0 };
  },
  async 学習の履歴() {
    return [];
  },
  async 学習の回を取り消す() {
    return false;
  },
  async 時点まで巻き戻す() {
    return false;
  },
};
