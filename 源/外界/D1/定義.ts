import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, sqliteView, text } from "drizzle-orm/sqlite-core";
import { 真 } from "../../共通/型";

/**
 * kawaiko の長期記憶の，Drizzle 側の定義．
 *
 * DDL の正本は 移行/0001_記憶ログ.sql のほう．ビュー 2 つを含めてあり，
 * あの畳み込みは Drizzle のビルダーに書かせる量ではない．ここでビューを
 * `.existing()` として宣言しているのは，読み取りに型を付けるためだけ．片方を
 * 変えたらもう片方も揃えること (定義.test.ts が食い違いを検出する)．
 *
 * 意味とモデルは 核/記憶.ts．
 */

/** 流れた発言そのまま．解釈も編集もしない． */
export const 観測表 = sqliteTable(
  "observations",
  {
    連番: integer("seq").primaryKey({ autoIncrement: 真 }),

    サーバーid: text("guild_id").notNull(),

    チャンネルid: text("channel_id").notNull(),

    発言id: text("message_id").notNull().unique(),

    発言者id: text("author_id").notNull(),

    発言者名: text("author_label").notNull(),

    /** kawaiko が言ったときに 1．自分の発言は反復ガードの入力になる． */
    kawaikoの発言か: integer("is_kawaiko").notNull().default(0),

    本文: text("content").notNull(),

    時刻: integer("at").notNull(),
  },
  (表) => [
    index("observations_guild_seq").on(表.サーバーid, 表.連番),
    index("observations_author").on(表.サーバーid, 表.発言者id, 表.連番),
  ],
);

/**
 * kawaiko が結論したこと．追記専用: 訂正は古い行を置き換える `learn` 行，
 * 取り消しは `retract` / `retract_batch` / `rollback` 行．UPDATE も DELETE も
 * 一切しない．
 */
export const 記憶の出来事 = sqliteTable(
  "memory_events",
  {
    /** 単調増加．ロールバックが戻る位置そのものでもある． */
    連番: integer("seq").primaryKey({ autoIncrement: 真 }),

    サーバーid: text("guild_id").notNull(),

    時刻: integer("at").notNull(),

    /** 学習 1 回につき 1 つ．ロールバックの単位． */
    識別子: text("batch").notNull(),
    種別: text("kind", {
      enum: ["learn", "retract", "retract_batch", "rollback", "learn_run"],
    }).notNull(),
    主語の種別: text("subject_kind", { enum: ["user", "topic", "channel", "server"] }),

    主語id: text("subject_id"),

    主語名: text("subject_label"),

    本文: text("body"),

    /** learn: この改訂が置き換える連番． */
    置き換える連番: integer("supersedes"),

    /** retract: 消す連番．rollback: 戻る位置． */
    対象の連番: integer("target_seq"),

    /** retract_識別子: the batch to kill. */
    対象の回: text("target_batch"),

    /** learn_run: highest 観測表.seq consumed. */
    読んだ位置: integer("observed_through"),

    出典チャンネルid: text("source_channel_id"),

    出典発言id: text("source_message_id"),

    モデル: text("model"),

    理由: text("note"),
  },
  (表) => [
    index("memory_events_guild_kind").on(表.サーバーid, 表.種別, 表.連番),
    index("memory_events_subject").on(表.サーバーid, 表.主語の種別, 表.主語id),
    index("memory_events_batch").on(表.サーバーid, 表.識別子),
  ],
);

const 事実の列 = {
  連番: integer("seq").notNull(),

  サーバーid: text("guild_id").notNull(),

  時刻: integer("at").notNull(),

  識別子: text("batch").notNull(),

  主語の種別: text("subject_kind", { enum: ["user", "topic", "channel", "server"] }),

  主語id: text("subject_id"),

  主語名: text("subject_label"),

  本文: text("body"),

  置き換える連番: integer("supersedes"),
};

/** 取り消しとロールバックを生き延びた `learn` 行． */
export const 生き残った事実 = sqliteView("memory_kept", 事実の列).existing();

/** kawaiko がいま信じていること: memory_kept から置き換えられた行を引いたもの． */
export const 生きている事実 = sqliteView("memory_live", 事実の列).existing();

/**
 * 生きている学習の回がどこまで読んだか．取り消された回とロールバックされた回を
 * 飛ばす必要があり，それはビューが適用しているのと同じ畳み込みなので，ここに置く．
 */
export const 生きている学習の回 = sql`
  memory_events.kind = 'learn_run'
  AND NOT EXISTS (
    SELECT 1 FROM memory_events r
     WHERE r.guild_id = memory_events.guild_id AND r.kind = 'retract_batch'
       AND r.target_batch = memory_events.batch
  )
  AND NOT EXISTS (
    SELECT 1 FROM memory_events b
     WHERE b.guild_id = memory_events.guild_id AND b.kind = 'rollback'
       AND memory_events.seq > b.target_seq AND memory_events.seq < b.seq
  )`;
